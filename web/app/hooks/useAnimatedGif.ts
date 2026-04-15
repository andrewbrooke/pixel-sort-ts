import { useState, useRef, useCallback } from 'react';
import type { SortOptions } from '@core/types';

export interface RawGifFrame {
  dims: { top: number; left: number; width: number; height: number };
  patch: Uint8ClampedArray;
  delay: number;
  disposalType: number;
}

export interface GifFrame {
  /** Full composited RGBA, width × height × 4 bytes. */
  data: Uint8ClampedArray;
  /** Delay in centiseconds (GIF spec units). */
  delay: number;
}

/**
 * Composite raw GIF frame patches onto a persistent canvas to produce full
 * RGBA frames, honouring each frame's disposal method.
 */
export function compositeGifFrames(
  frames: RawGifFrame[],
  width: number,
  height: number,
): GifFrame[] {
  const result: GifFrame[] = [];
  const canvas = new Uint8ClampedArray(width * height * 4);

  for (const frame of frames) {
    const { dims, patch, delay, disposalType } = frame;
    const savedCanvas = disposalType === 3 ? new Uint8ClampedArray(canvas) : null;

    for (let row = 0; row < dims.height; row++) {
      for (let col = 0; col < dims.width; col++) {
        const ci = ((dims.top + row) * width + (dims.left + col)) * 4;
        const pi = (row * dims.width + col) * 4;
        if (patch[pi + 3] > 0) {
          canvas[ci] = patch[pi];
          canvas[ci + 1] = patch[pi + 1];
          canvas[ci + 2] = patch[pi + 2];
          canvas[ci + 3] = patch[pi + 3];
        }
      }
    }

    result.push({ data: new Uint8ClampedArray(canvas), delay: delay ?? 10 });

    if (disposalType === 2) {
      canvas.fill(0);
    } else if (disposalType === 3 && savedCanvas) {
      canvas.set(savedCanvas);
    }
  }

  return result;
}

/**
 * Manages animated GIF state and the multi-frame sort+encode pipeline.
 *
 * The caller is responsible for `processing`, `outputUrl`, and overall sort
 * timing — this hook only owns the frame-level state and returns a `run()`
 * that resolves to the encoded GIF blob.
 */
export function useAnimatedGif(opts: SortOptions, lassoMask: Uint8Array | null) {
  const [gifFrames, setGifFrames] = useState<GifFrame[] | null>(null);
  const [gifProgress, setGifProgress] = useState<number | null>(null);
  const frameDurationsRef = useRef<number[]>([]);

  const reset = useCallback(() => {
    setGifFrames(null);
    setGifProgress(null);
  }, []);

  /**
   * Sort every frame through the worker then encode to an animated GIF blob.
   * Manages `gifProgress` internally; clears it on completion or error.
   */
  const run = useCallback(
    async (width: number, height: number): Promise<Blob> => {
      if (!gifFrames) throw new Error('no frames loaded');

      frameDurationsRef.current = [];
      const sortedFrames: Uint8ClampedArray[] = [];

      try {
        for (let i = 0; i < gifFrames.length; i++) {
          setGifProgress(i);
          const buffer = gifFrames[i].data.buffer.slice(0) as ArrayBuffer;
          const frameStart = performance.now();

          const sorted = await new Promise<Uint8ClampedArray>((resolve, reject) => {
            const worker = new Worker(new URL('../workers/sort.worker.ts', import.meta.url));
            type WorkerMsg =
              | { type: 'progress'; percent: number }
              | { type: 'done'; buffer: ArrayBuffer };
            worker.onmessage = ({ data: msg }: MessageEvent<WorkerMsg>) => {
              if (msg.type === 'progress') return;
              worker.terminate();
              resolve(new Uint8ClampedArray(msg.buffer));
            };
            worker.onerror = () => {
              worker.terminate();
              reject(new Error('sort worker failed'));
            };

            const transferables: ArrayBuffer[] = [buffer];
            let maskCopy: ArrayBuffer | undefined;
            if (lassoMask) {
              maskCopy = new Uint8Array(lassoMask).buffer;
              transferables.push(maskCopy);
            }

            worker.postMessage({ buffer, width, height, opts, mask: maskCopy }, transferables);
          });

          frameDurationsRef.current.push(performance.now() - frameStart);
          sortedFrames.push(sorted);
        }

        // Signal the encoding phase. Yield to the browser so React can flush
        // the "encoding..." label before the synchronous quantisation work
        // blocks the main thread.
        setGifProgress(gifFrames.length);
        await new Promise<void>(resolve => setTimeout(resolve, 0));

        const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
        const encoder = GIFEncoder();

        for (let i = 0; i < sortedFrames.length; i++) {
          const palette = quantize(sortedFrames[i], 256);
          const index = applyPalette(sortedFrames[i], palette);
          encoder.writeFrame(index, width, height, {
            palette,
            delay: Math.max(2, gifFrames[i].delay),
            repeat: 0,
          });
        }

        encoder.finish();
        return new Blob([encoder.bytes()], { type: 'image/gif' });
      } finally {
        setGifProgress(null);
      }
    },
    [gifFrames, opts, lassoMask],
  );

  // Derived — recomputed whenever gifProgress triggers a re-render.
  const done = frameDurationsRef.current;
  const gifEstimatedRemainingMs =
    gifFrames && done.length > 0 && gifProgress !== null
      ? (done.reduce((a, b) => a + b, 0) / done.length) * (gifFrames.length - done.length)
      : undefined;

  return {
    gifFrames,
    setGifFrames,
    gifProgress,
    gifEstimatedRemainingMs,
    run,
    reset,
  };
}
