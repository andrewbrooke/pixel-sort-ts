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

  if (opts.direction === 'horizontal' || opts.direction === 'both') {
    sortRows(pixels, width, height, opts, pixelMask);
  }
  if (opts.direction === 'vertical' || opts.direction === 'both') {
    sortColumns(pixels, width, height, opts, pixelMask);
  }
  if (opts.direction === 'radial' || opts.direction === 'spoke') {
    sortPolar(pixels, width, height, opts, pixelMask);
  }

  // Transfer the buffer back to the main thread (zero-copy)
  postMessage(buffer, { transfer: [buffer] });
});
