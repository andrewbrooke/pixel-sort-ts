import { sortRows, sortColumns, sortPolar } from '@core/sort';
import type { SortOptions } from '@core/types';

export interface SortWorkerInput {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  opts: SortOptions;
  /** Optional per-pixel bitmask (1 = masked). Used for freehand lasso selections. */
  mask?: ArrayBuffer;
}

addEventListener('message', ({ data }: MessageEvent<SortWorkerInput>) => {
  const { buffer, width, height, opts, mask } = data;
  const pixels = new Uint8Array(buffer);
  const pixelMask = mask ? new Uint8Array(mask) : undefined;

  const isBoth = opts.direction === 'both';

  if (opts.direction === 'horizontal' || isBoth) {
    sortRows(pixels, width, height, opts, pixelMask, frac => {
      postMessage({ type: 'progress', percent: isBoth ? frac * 0.5 : frac });
    });
  }
  if (opts.direction === 'vertical' || isBoth) {
    sortColumns(pixels, width, height, opts, pixelMask, frac => {
      postMessage({ type: 'progress', percent: isBoth ? 0.5 + frac * 0.5 : frac });
    });
  }
  if (opts.direction === 'radial' || opts.direction === 'spoke') {
    sortPolar(pixels, width, height, opts, pixelMask, frac => {
      postMessage({ type: 'progress', percent: frac });
    });
  }

  // Transfer the buffer back to the main thread (zero-copy)
  postMessage({ type: 'done', buffer }, { transfer: [buffer] });
});
