import { useState, useRef, useCallback, useEffect } from 'react';
import type { SortOptions } from '@core/types';

export interface SourceImage {
  data: Uint8Array;
  width: number;
  height: number;
}

type WorkerMsg = { type: 'progress'; percent: number } | { type: 'done'; buffer: ArrayBuffer };

/**
 * Manages the single-image sort worker lifecycle.
 *
 * `run(source, mimeType, onDone, onError)` fires the worker and calls `onDone(blob)`
 * synchronously from within the canvas.toBlob callback — keeping all React state updates
 * on the same synchronous stack as the worker's onmessage, which is required for
 * React Testing Library's act() to track them correctly.
 *
 * Also exposes `sortProgress` (0–1) while the worker is active.
 */
export function useSingleImageSort(opts: SortOptions, lassoMask: Uint8Array | null) {
  const [sortProgress, setSortProgress] = useState<number | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
    },
    [],
  );

  const run = useCallback(
    (
      source: SourceImage,
      mimeType: string,
      onDone: (blob: Blob) => void,
      onError: () => void,
    ): void => {
      const { width, height } = source;
      const data = new Uint8Array(source.data);

      const worker = new Worker(new URL('../workers/sort.worker.ts', import.meta.url));
      workerRef.current = worker;

      worker.onmessage = ({ data: msg }: MessageEvent<WorkerMsg>) => {
        if (msg.type === 'progress') {
          setSortProgress(msg.percent);
          return;
        }
        setSortProgress(null);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(new ImageData(new Uint8ClampedArray(msg.buffer), width, height), 0, 0);
        canvas.toBlob(blob => {
          worker.terminate();
          workerRef.current = null;
          if (blob) onDone(blob);
          else onError();
        }, mimeType);
      };

      worker.onerror = () => {
        setSortProgress(null);
        worker.terminate();
        workerRef.current = null;
        onError();
      };

      const transferables: ArrayBuffer[] = [data.buffer];
      let maskBuffer: ArrayBuffer | undefined;
      if (lassoMask) {
        const copy = new Uint8Array(lassoMask);
        maskBuffer = copy.buffer;
        transferables.push(maskBuffer);
      }

      worker.postMessage(
        { buffer: data.buffer, width, height, opts, mask: maskBuffer },
        transferables,
      );
    },
    [opts, lassoMask],
  );

  return { run, sortProgress };
}
