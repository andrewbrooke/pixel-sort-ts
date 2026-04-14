import { Channel, Pixel, Rect, SortKey, SortOptions } from './types';
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
    const rowOpts =
      opts.seed !== undefined
        ? { ...opts, seed: (opts.seed ^ ((y + 1) * 0x9e3779b9)) >>> 0 }
        : opts;

    let sorted: Pixel[];
    if (pixelMask) {
      const runs = getMaskedRunsFromRow(pixelMask, y, width);
      if (runs.length === 0 && opts.excludeInvert) continue;
      sorted = sortStripWithRuns(pixels, rowOpts, runs);
    } else {
      const maskRange = opts.exclude ? getMaskRange(opts.exclude, y, 'x') : null;
      if (maskRange) {
        sorted = opts.excludeInvert
          ? sortStripInverted(pixels, rowOpts, maskRange)
          : sortStripWithMask(pixels, rowOpts, maskRange);
      } else if (opts.excludeInvert) {
        continue;
      } else {
        sorted = sortStrip(pixels, rowOpts);
      }
    }

    writeRow(data, y, width, sorted, opts.channel);
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
    const colOpts =
      opts.seed !== undefined
        ? { ...opts, seed: (opts.seed ^ ((x + 1) * 0x9e3779b9)) >>> 0 }
        : opts;

    let sorted: Pixel[];
    if (pixelMask) {
      const runs = getMaskedRunsFromCol(pixelMask, x, width, height);
      if (runs.length === 0 && opts.excludeInvert) continue;
      sorted = sortStripWithRuns(pixels, colOpts, runs);
    } else {
      const maskRange = opts.exclude ? getMaskRange(opts.exclude, x, 'y') : null;
      if (maskRange) {
        sorted = opts.excludeInvert
          ? sortStripInverted(pixels, colOpts, maskRange)
          : sortStripWithMask(pixels, colOpts, maskRange);
      } else if (opts.excludeInvert) {
        continue;
      } else {
        sorted = sortStrip(pixels, colOpts);
      }
    }

    writeCol(data, x, width, sorted, opts.channel);
  }
}

/**
 * Polar sort: sorts pixels along concentric rings (radial) or outward spokes (spoke).
 *
 * Every pixel is assigned to exactly one ring/spoke by integer distance or discretised
 * angle from the focal point. The strip for each ring/spoke is then sorted with the
 * same interval logic used by sortRows/sortColumns.
 */
export function sortPolar(
  data: Uint8Array,
  width: number,
  height: number,
  opts: SortOptions,
  pixelMask?: Uint8Array,
): void {
  const cx = (opts.cx ?? 0.5) * width;
  const cy = (opts.cy ?? 0.5) * height;

  /** Returns true if this flat pixel index is inside the exclusion mask. */
  function isMasked(pixIdx: number): boolean {
    if (pixelMask) return pixelMask[pixIdx] !== 0;
    if (opts.exclude) {
      const x = pixIdx % width;
      const y = Math.floor(pixIdx / width);
      const { x1, y1, x2, y2 } = opts.exclude;
      return x >= x1 && x <= x2 && y >= y1 && y <= y2;
    }
    return false;
  }

  const hasMask = !!(pixelMask || opts.exclude);

  if (opts.direction === 'radial') {
    const rings = new Map<number, number[]>();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const r = Math.round(Math.sqrt((x - cx) ** 2 + (y - cy) ** 2));
        let ring = rings.get(r);
        if (!ring) {
          ring = [];
          rings.set(r, ring);
        }
        ring.push(y * width + x);
      }
    }

    for (const pixIndices of rings.values()) {
      pixIndices.sort((a, b) => {
        const ax = (a % width) - cx,
          ay = Math.floor(a / width) - cy;
        const bx = (b % width) - cx,
          by = Math.floor(b / width) - cy;
        return Math.atan2(ay, ax) - Math.atan2(by, bx);
      });
      sortAndWriteStrip(data, pixIndices, opts, hasMask ? isMasked : undefined);
    }
  } else {
    const maxR = Math.ceil(
      Math.sqrt(Math.max(cx, width - cx) ** 2 + Math.max(cy, height - cy) ** 2),
    );
    const numSpokes = Math.max(8, Math.ceil(2 * Math.PI * maxR));

    const spokes = new Map<number, number[]>();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const theta = Math.atan2(y - cy, x - cx);
        const spokeIdx =
          ((Math.round(((theta + Math.PI) / (2 * Math.PI)) * numSpokes) % numSpokes) + numSpokes) %
          numSpokes;
        let spoke = spokes.get(spokeIdx);
        if (!spoke) {
          spoke = [];
          spokes.set(spokeIdx, spoke);
        }
        spoke.push(y * width + x);
      }
    }

    for (const pixIndices of spokes.values()) {
      pixIndices.sort((a, b) => {
        const ax = (a % width) - cx,
          ay = Math.floor(a / width) - cy;
        const bx = (b % width) - cx,
          by = Math.floor(b / width) - cy;
        return ax * ax + ay * ay - (bx * bx + by * by);
      });
      sortAndWriteStrip(data, pixIndices, opts, hasMask ? isMasked : undefined);
    }
  }
}

/**
 * Read pixels at the given flat indices, apply mask-aware sorting, write back.
 *
 * The strip is first rotated so the wrap-around seam falls at a natural interval
 * boundary, eliminating the visible line artifact that occurs when a sorted interval
 * crosses the arbitrary start/end of a circular polar strip.
 */
function sortAndWriteStrip(
  data: Uint8Array,
  pixIndices: number[],
  opts: SortOptions,
  isMasked?: (pixIdx: number) => boolean,
): void {
  const n = pixIndices.length;
  if (n === 0) return;

  // Rotate so the seam between index 0 and index n-1 falls at a natural boundary.
  const offset = findSeamOffset(data, pixIndices, opts);
  const ordered =
    offset === 0 ? pixIndices : [...pixIndices.slice(offset), ...pixIndices.slice(0, offset)];

  const pixels: Pixel[] = ordered.map(idx => {
    const i = idx * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
  });

  let sorted: Pixel[];

  if (isMasked) {
    const maskedRuns: [number, number][] = [];
    let runStart = -1;
    for (let i = 0; i <= n; i++) {
      const masked = i < n && isMasked(ordered[i]);
      if (masked && runStart === -1) runStart = i;
      else if (!masked && runStart !== -1) {
        maskedRuns.push([runStart, i]);
        runStart = -1;
      }
    }
    if (maskedRuns.length === 0 && opts.excludeInvert) return;
    sorted = sortStripWithRuns(pixels, opts, maskedRuns);
  } else {
    sorted = sortStrip(pixels, opts);
  }

  const ch = opts.channel;
  for (let i = 0; i < n; i++) {
    const idx = ordered[i] * 4;
    const p = sorted[i];
    if (ch === 'all' || ch === 'red') data[idx] = p.r;
    if (ch === 'all' || ch === 'green') data[idx + 1] = p.g;
    if (ch === 'all' || ch === 'blue') data[idx + 2] = p.b;
    data[idx + 3] = p.a;
  }
}

/**
 * Find the best rotation offset for a circular polar strip so the seam between
 * the last and first element falls at a natural interval boundary.
 *
 * Threshold mode: use the first pixel whose brightness is outside [lo, hi] — it
 * would be a boundary anyway, so the wrapped interval becomes a clean linear one.
 *
 * Full / random mode (or threshold with no boundary pixels): find the adjacent pair
 * with the largest brightness step and place the seam there, coinciding with an
 * existing edge in the image rather than cutting across a uniform region.
 */
function findSeamOffset(data: Uint8Array, pixIndices: number[], opts: SortOptions): number {
  const n = pixIndices.length;
  if (n <= 1) return 0;

  if (opts.mode === 'threshold') {
    for (let i = 0; i < n; i++) {
      const base = pixIndices[i] * 4;
      const bri = (0.299 * data[base] + 0.587 * data[base + 1] + 0.114 * data[base + 2]) / 255;
      if (bri < opts.lo || bri > opts.hi) return i;
    }
  }

  // Fallback: seam at the largest brightness discontinuity.
  let maxStep = -1;
  let seamIdx = 0;
  for (let i = 0; i < n; i++) {
    const a = pixIndices[i] * 4;
    const b = pixIndices[(i + 1) % n] * 4;
    const bA = (0.299 * data[a] + 0.587 * data[a + 1] + 0.114 * data[a + 2]) / 255;
    const bB = (0.299 * data[b] + 0.587 * data[b + 1] + 0.114 * data[b + 2]) / 255;
    const step = Math.abs(bA - bB);
    if (step > maxStep) {
      maxStep = step;
      seamIdx = (i + 1) % n;
    }
  }
  return seamIdx;
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

function writeRow(
  data: Uint8Array,
  y: number,
  width: number,
  pixels: Pixel[],
  channel: Channel = 'all',
): void {
  for (let x = 0; x < pixels.length; x++) {
    const i = (y * width + x) * 4;
    const p = pixels[x];
    if (channel === 'all' || channel === 'red') data[i] = p.r;
    if (channel === 'all' || channel === 'green') data[i + 1] = p.g;
    if (channel === 'all' || channel === 'blue') data[i + 2] = p.b;
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

function writeCol(
  data: Uint8Array,
  x: number,
  width: number,
  pixels: Pixel[],
  channel: Channel = 'all',
): void {
  for (let y = 0; y < pixels.length; y++) {
    const i = (y * width + x) * 4;
    const p = pixels[y];
    if (channel === 'all' || channel === 'red') data[i] = p.r;
    if (channel === 'all' || channel === 'green') data[i + 1] = p.g;
    if (channel === 'all' || channel === 'blue') data[i + 2] = p.b;
    data[i + 3] = p.a;
  }
}
