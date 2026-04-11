import { Pixel, Rect, SortKey, SortOptions } from './types';
import { getSortValue } from './color';
import { buildIntervals, Interval } from './intervals';

function sortSegment(pixels: Pixel[], interval: Interval, key: SortKey, reverse: boolean): void {
  const [start, end] = interval;
  const segment = pixels.slice(start, end);

  segment.sort((a, b) => {
    const va = getSortValue(a.r, a.g, a.b, key);
    const vb = getSortValue(b.r, b.g, b.b, key);
    return reverse ? vb - va : va - vb;
  });

  for (let i = 0; i < segment.length; i++) {
    pixels[start + i] = segment[i];
  }
}

function sortStrip(pixels: Pixel[], opts: SortOptions): Pixel[] {
  const result = [...pixels];
  const intervals = buildIntervals(result, opts);

  for (const interval of intervals) {
    if (interval[1] - interval[0] > 1) {
      sortSegment(result, interval, opts.key, opts.reverse);
    }
  }

  return result;
}

/**
 * Returns [maskStart, maskEnd) indices within a strip where the mask rect applies,
 * or null if the mask doesn't intersect this strip at all.
 *
 * For rows (axis = 'x'): stripIndex is y, position along strip is x.
 * For cols (axis = 'y'): stripIndex is x, position along strip is y.
 */
function getMaskRange(rect: Rect, stripIndex: number, axis: 'x' | 'y'): [number, number] | null {
  if (axis === 'x') {
    if (stripIndex < rect.y1 || stripIndex > rect.y2) return null;
    return [rect.x1, rect.x2 + 1];
  } else {
    if (stripIndex < rect.x1 || stripIndex > rect.x2) return null;
    return [rect.y1, rect.y2 + 1];
  }
}

/**
 * Sort a strip but leave the masked region untouched.
 * Splits the strip into up to two sortable segments around the mask.
 */
function sortStripWithMask(
  pixels: Pixel[],
  opts: SortOptions,
  maskRange: [number, number],
): Pixel[] {
  const [maskStart, maskEnd] = maskRange;
  const len = pixels.length;
  const result = [...pixels];

  // Segment before the mask
  if (maskStart > 0) {
    const before = sortStrip(pixels.slice(0, maskStart), opts);
    for (let i = 0; i < before.length; i++) result[i] = before[i];
  }

  // Segment after the mask (masked pixels stay as-is from the spread above)
  if (maskEnd < len) {
    const after = sortStrip(pixels.slice(maskEnd), opts);
    for (let i = 0; i < after.length; i++) result[maskEnd + i] = after[i];
  }

  return result;
}

/**
 * Sort ONLY the masked region, leaving everything outside untouched.
 * Used when excludeInvert is true.
 */
function sortStripInverted(
  pixels: Pixel[],
  opts: SortOptions,
  maskRange: [number, number],
): Pixel[] {
  const [maskStart, maskEnd] = maskRange;
  const result = [...pixels];
  const segment = sortStrip(pixels.slice(maskStart, maskEnd), opts);
  for (let i = 0; i < segment.length; i++) result[maskStart + i] = segment[i];
  return result;
}

/**
 * Extract contiguous runs of masked pixels from a row in a flat bitmask.
 * Each run is [start, end) — same convention as intervals.
 */
function getMaskedRunsFromRow(
  mask: Uint8Array,
  rowIndex: number,
  width: number,
): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  for (let x = 0; x <= width; x++) {
    const masked = x < width && mask[rowIndex * width + x] !== 0;
    if (masked && start === -1) start = x;
    else if (!masked && start !== -1) {
      runs.push([start, x]);
      start = -1;
    }
  }
  return runs;
}

/**
 * Extract contiguous runs of masked pixels from a column in a flat bitmask.
 */
function getMaskedRunsFromCol(
  mask: Uint8Array,
  colIndex: number,
  width: number,
  height: number,
): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  for (let y = 0; y <= height; y++) {
    const masked = y < height && mask[y * width + colIndex] !== 0;
    if (masked && start === -1) start = y;
    else if (!masked && start !== -1) {
      runs.push([start, y]);
      start = -1;
    }
  }
  return runs;
}

/**
 * Sort a strip using a set of masked runs from a pixel bitmask.
 * In normal mode: sorts the gaps between runs, leaves runs untouched.
 * In excludeInvert mode: sorts only inside runs, leaves gaps untouched.
 */
function sortStripWithRuns(
  pixels: Pixel[],
  opts: SortOptions,
  maskedRuns: [number, number][],
): Pixel[] {
  const result = [...pixels];
  const len = pixels.length;

  if (opts.excludeInvert) {
    for (const [start, end] of maskedRuns) {
      const seg = sortStrip(pixels.slice(start, end), opts);
      for (let i = 0; i < seg.length; i++) result[start + i] = seg[i];
    }
  } else {
    let cursor = 0;
    for (const [start, end] of maskedRuns) {
      if (cursor < start) {
        const seg = sortStrip(pixels.slice(cursor, start), opts);
        for (let i = 0; i < seg.length; i++) result[cursor + i] = seg[i];
      }
      cursor = end;
    }
    if (cursor < len) {
      const seg = sortStrip(pixels.slice(cursor), opts);
      for (let i = 0; i < seg.length; i++) result[cursor + i] = seg[i];
    }
  }

  return result;
}

export function sortRows(
  data: Uint8Array,
  width: number,
  height: number,
  opts: SortOptions,
  pixelMask?: Uint8Array,
): void {
  for (let y = 0; y < height; y++) {
    const pixels = readRow(data, y, width);

    let sorted: Pixel[];
    if (pixelMask) {
      const runs = getMaskedRunsFromRow(pixelMask, y, width);
      if (runs.length === 0 && opts.excludeInvert) continue;
      sorted = sortStripWithRuns(pixels, opts, runs);
    } else {
      const maskRange = opts.exclude ? getMaskRange(opts.exclude, y, 'x') : null;
      if (maskRange) {
        sorted = opts.excludeInvert
          ? sortStripInverted(pixels, opts, maskRange)
          : sortStripWithMask(pixels, opts, maskRange);
      } else if (opts.excludeInvert) {
        continue;
      } else {
        sorted = sortStrip(pixels, opts);
      }
    }

    writeRow(data, y, width, sorted);
  }
}

export function sortColumns(
  data: Uint8Array,
  width: number,
  height: number,
  opts: SortOptions,
  pixelMask?: Uint8Array,
): void {
  for (let x = 0; x < width; x++) {
    const pixels = readCol(data, x, width, height);

    let sorted: Pixel[];
    if (pixelMask) {
      const runs = getMaskedRunsFromCol(pixelMask, x, width, height);
      if (runs.length === 0 && opts.excludeInvert) continue;
      sorted = sortStripWithRuns(pixels, opts, runs);
    } else {
      const maskRange = opts.exclude ? getMaskRange(opts.exclude, x, 'y') : null;
      if (maskRange) {
        sorted = opts.excludeInvert
          ? sortStripInverted(pixels, opts, maskRange)
          : sortStripWithMask(pixels, opts, maskRange);
      } else if (opts.excludeInvert) {
        continue;
      } else {
        sorted = sortStrip(pixels, opts);
      }
    }

    writeCol(data, x, width, sorted);
  }
}

// ─── Buffer helpers (kept local to avoid circular deps) ──────────────────────

function readRow(data: Uint8Array, y: number, width: number): Pixel[] {
  const pixels: Pixel[] = [];
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] });
  }
  return pixels;
}

function writeRow(data: Uint8Array, y: number, width: number, pixels: Pixel[]): void {
  for (let x = 0; x < pixels.length; x++) {
    const i = (y * width + x) * 4;
    const p = pixels[x];
    data[i] = p.r;
    data[i + 1] = p.g;
    data[i + 2] = p.b;
    data[i + 3] = p.a;
  }
}

function readCol(data: Uint8Array, x: number, width: number, height: number): Pixel[] {
  const pixels: Pixel[] = [];
  for (let y = 0; y < height; y++) {
    const i = (y * width + x) * 4;
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] });
  }
  return pixels;
}

function writeCol(data: Uint8Array, x: number, width: number, pixels: Pixel[]): void {
  for (let y = 0; y < pixels.length; y++) {
    const i = (y * width + x) * 4;
    const p = pixels[y];
    data[i] = p.r;
    data[i + 1] = p.g;
    data[i + 2] = p.b;
    data[i + 3] = p.a;
  }
}
