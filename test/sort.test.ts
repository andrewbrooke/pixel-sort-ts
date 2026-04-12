import { expect } from 'chai';
import { sortRows, sortColumns, sortPolar } from '../src/sort';
import type { SortOptions } from '../src/types';

/** Build a flat RGBA Uint8Array from [r,g,b,a] tuples */
function makeBuffer(...pixels: [number, number, number, number][]): Uint8Array {
  const buf = new Uint8Array(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) {
    buf[i * 4] = pixels[i][0];
    buf[i * 4 + 1] = pixels[i][1];
    buf[i * 4 + 2] = pixels[i][2];
    buf[i * 4 + 3] = pixels[i][3];
  }
  return buf;
}

/** Extract the R value of pixel at index i */
function r(buf: Uint8Array, i: number): number {
  return buf[i * 4];
}

const FULL: SortOptions = {
  direction: 'horizontal',
  key: 'brightness',
  mode: 'full',
  lo: 0,
  hi: 1,
  reverse: false,
  maxLen: 100,
  exclude: null,
  excludeInvert: false,
  cx: 0.5,
  cy: 0.5,
  channel: 'all',
};

// ─── sortRows ────────────────────────────────────────────────────────────────

describe('sort: sortRows()', () => {
  it('sorts a single row ascending by brightness', () => {
    // 1 row × 3 cols: white, black, grey → should become black, grey, white
    const buf = makeBuffer([255, 255, 255, 255], [0, 0, 0, 255], [128, 128, 128, 255]);
    sortRows(buf, 3, 1, FULL);
    expect(r(buf, 0)).to.equal(0); // darkest first
    expect(r(buf, 2)).to.equal(255); // brightest last
  });

  it('sorts descending when reverse = true', () => {
    const buf = makeBuffer([0, 0, 0, 255], [255, 255, 255, 255], [128, 128, 128, 255]);
    sortRows(buf, 3, 1, { ...FULL, reverse: true });
    expect(r(buf, 0)).to.equal(255); // brightest first
    expect(r(buf, 2)).to.equal(0); // darkest last
  });

  it('sorts each row independently', () => {
    // 2 rows × 2 cols: row 0 = [white, black], row 1 = [black, white]
    const buf = makeBuffer(
      [255, 255, 255, 255],
      [0, 0, 0, 255], // row 0
      [0, 0, 0, 255],
      [255, 255, 255, 255], // row 1
    );
    sortRows(buf, 2, 2, FULL);
    // Both rows should be sorted [black, white]
    expect(r(buf, 0)).to.equal(0); // row 0 pixel 0
    expect(r(buf, 1)).to.equal(255); // row 0 pixel 1
    expect(r(buf, 2)).to.equal(0); // row 1 pixel 0
    expect(r(buf, 3)).to.equal(255); // row 1 pixel 1
  });

  it('does not move pixels outside the threshold range', () => {
    // threshold [0.25, 0.8]: black pixels are below range and act as boundaries
    // single mid pixel is in range but forms an interval of length 1 — nothing to sort
    const buf = makeBuffer([0, 0, 0, 255], [128, 128, 128, 255], [0, 0, 0, 255]);
    const original = Array.from(buf);
    sortRows(buf, 3, 1, { ...FULL, mode: 'threshold', lo: 0.25, hi: 0.8 });
    expect(Array.from(buf)).to.deep.equal(original);
  });

  it('preserves alpha channel values', () => {
    const buf = makeBuffer([255, 255, 255, 200], [0, 0, 0, 100]);
    sortRows(buf, 2, 1, FULL);
    // After sort: [black (α=100), white (α=200)]
    expect(buf[3]).to.equal(100); // alpha of first pixel
    expect(buf[7]).to.equal(200); // alpha of second pixel
  });
});

// ─── sortColumns ─────────────────────────────────────────────────────────────

describe('sort: sortRows() — random mode', () => {
  it('sorts pixels within random intervals without gaps or loss', () => {
    const buf = makeBuffer(
      [200, 200, 200, 255],
      [50, 50, 50, 255],
      [150, 150, 150, 255],
      [100, 100, 100, 255],
      [250, 250, 250, 255],
      [10, 10, 10, 255],
    );
    const before = Array.from(buf)
      .filter((_, i) => i % 4 === 0)
      .sort((a, b) => a - b);
    sortRows(buf, 6, 1, { ...FULL, mode: 'random', maxLen: 3 });
    const after = Array.from(buf)
      .filter((_, i) => i % 4 === 0)
      .sort((a, b) => a - b);
    // All pixels still present, just reordered
    expect(after).to.deep.equal(before);
  });
});

describe('sort: sortColumns()', () => {
  it('sorts a single column ascending by brightness', () => {
    // 3 rows × 1 col: white, black, grey → black, grey, white
    const buf = makeBuffer([255, 255, 255, 255], [0, 0, 0, 255], [128, 128, 128, 255]);
    sortColumns(buf, 1, 3, { ...FULL, direction: 'vertical' });
    expect(r(buf, 0)).to.equal(0); // darkest at top
    expect(r(buf, 2)).to.equal(255); // brightest at bottom
  });

  it('sorts each column independently', () => {
    // 2 rows × 2 cols
    // col 0: [white, black] → [black, white]
    // col 1: [black, white] → [black, white]
    const buf = makeBuffer(
      [255, 255, 255, 255],
      [0, 0, 0, 255], // row 0
      [0, 0, 0, 255],
      [255, 255, 255, 255], // row 1
    );
    sortColumns(buf, 2, 2, { ...FULL, direction: 'vertical' });
    expect(r(buf, 0)).to.equal(0); // col 0, row 0 = black
    expect(r(buf, 2)).to.equal(255); // col 0, row 1 = white
    expect(r(buf, 1)).to.equal(0); // col 1, row 0 = black
    expect(r(buf, 3)).to.equal(255); // col 1, row 1 = white
  });
});

// ─── exclude mask ─────────────────────────────────────────────────────────────

describe('sort: sortRows() — exclude mask', () => {
  it('leaves pixels inside the masked rectangle byte-for-byte identical', () => {
    // 3 rows × 4 cols. Mask covers col 1–2 on row 1 only: exclude {x1:1,y1:1,x2:2,y2:1}
    // Row 1 pixels (indices 4–7): white, BLACK, BLACK, white — masked pixels stay in place
    const buf = makeBuffer(
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [255, 255, 255, 255], // row 0
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [255, 255, 255, 255], // row 1 (masked cols 1-2)
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [0, 0, 0, 255],
      [255, 255, 255, 255], // row 2
    );
    const opts: SortOptions = { ...FULL, exclude: { x1: 1, y1: 1, x2: 2, y2: 1 } };
    sortRows(buf, 4, 3, opts);

    // Masked pixels at row 1, cols 1 and 2 (buffer indices 5 and 6) must be unchanged
    expect(r(buf, 5)).to.equal(0);
    expect(r(buf, 6)).to.equal(0);
  });

  it('still sorts the unmasked segments of masked rows', () => {
    // 1 row × 5 cols: [white, black, MASKED, MASKED, grey]
    // Mask covers cols 2–3. Segments [0,2) and [4,5) are sorted independently.
    const buf = makeBuffer(
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [200, 200, 200, 255],
      [200, 200, 200, 255], // masked — should not move
      [128, 128, 128, 255],
    );
    const maskedR = [r(buf, 2), r(buf, 3)];
    sortRows(buf, 5, 1, { ...FULL, exclude: { x1: 2, y1: 0, x2: 3, y2: 0 } });

    // Masked pixels unchanged
    expect(r(buf, 2)).to.equal(maskedR[0]);
    expect(r(buf, 3)).to.equal(maskedR[1]);
    // Segment before mask [0,2): white+black → sorted black,white
    expect(r(buf, 0)).to.equal(0);
    expect(r(buf, 1)).to.equal(255);
  });

  it('does not affect rows outside the mask y range', () => {
    // 3 rows × 2 cols. Mask only covers row 1. Rows 0 and 2 should sort normally.
    const buf = makeBuffer(
      [255, 255, 255, 255],
      [0, 0, 0, 255], // row 0 — should sort
      [255, 255, 255, 255],
      [0, 0, 0, 255], // row 1 — masked
      [255, 255, 255, 255],
      [0, 0, 0, 255], // row 2 — should sort
    );
    sortRows(buf, 2, 3, { ...FULL, exclude: { x1: 0, y1: 1, x2: 1, y2: 1 } });

    // Row 0: sorted black, white
    expect(r(buf, 0)).to.equal(0);
    expect(r(buf, 1)).to.equal(255);
    // Row 2: sorted black, white
    expect(r(buf, 4)).to.equal(0);
    expect(r(buf, 5)).to.equal(255);
  });
});

describe('sort: sortColumns() — exclude mask', () => {
  it('leaves pixels inside the masked rectangle unchanged', () => {
    // 4 rows × 3 cols. Mask covers col 1, rows 1–2: exclude {x1:1,y1:1,x2:1,y2:2}
    const buf = makeBuffer(
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [255, 255, 255, 255], // row 0
      [0, 0, 0, 255],
      [128, 128, 128, 255],
      [0, 0, 0, 255], // row 1
      [0, 0, 0, 255],
      [200, 200, 200, 255],
      [0, 0, 0, 255], // row 2
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [255, 255, 255, 255], // row 3
    );
    const maskedCol1Row1 = r(buf, 4); // index 4 = row1,col1
    const maskedCol1Row2 = r(buf, 7); // index 7 = row2,col1
    sortColumns(buf, 3, 4, {
      ...FULL,
      direction: 'vertical',
      exclude: { x1: 1, y1: 1, x2: 1, y2: 2 },
    });

    expect(r(buf, 4)).to.equal(maskedCol1Row1);
    expect(r(buf, 7)).to.equal(maskedCol1Row2);
  });
});

// ─── invert mask ──────────────────────────────────────────────────────────────

describe('sort: sortRows() — invert mask', () => {
  it('sorts ONLY pixels inside the rectangle, leaving outside rows untouched', () => {
    // 3 rows × 3 cols. Mask covers row 1 only (y1=1, y2=1).
    // Rows 0 and 2 must be completely unchanged.
    const buf = makeBuffer(
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [128, 128, 128, 255], // row 0 — must not change
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [128, 128, 128, 255], // row 1 — sorted
      [255, 255, 255, 255],
      [0, 0, 0, 255],
      [255, 255, 0, 255], // row 2 — must not change
    );
    const beforeRow0 = Array.from(buf.slice(0, 12));
    const beforeRow2 = Array.from(buf.slice(24, 36));

    sortRows(buf, 3, 3, { ...FULL, exclude: { x1: 0, y1: 1, x2: 2, y2: 1 }, excludeInvert: true });

    // Rows outside mask are byte-identical
    expect(Array.from(buf.slice(0, 12))).to.deep.equal(beforeRow0);
    expect(Array.from(buf.slice(24, 36))).to.deep.equal(beforeRow2);

    // Row 1 is sorted ascending by brightness: black, grey, white
    expect(r(buf, 3)).to.equal(0);
    expect(r(buf, 4)).to.equal(128);
    expect(r(buf, 5)).to.equal(255);
  });

  it('sorts only the masked x-range within a row', () => {
    // 1 row × 5 cols. Mask covers cols 1–3.
    // Col 0 and col 4 must not move; cols 1–3 are sorted.
    const buf = makeBuffer(
      [50, 50, 50, 255], // col 0 — outside mask, must stay
      [255, 255, 255, 255], // col 1 — inside mask (white)
      [0, 0, 0, 255], // col 2 — inside mask (black)
      [128, 128, 128, 255], // col 3 — inside mask (grey)
      [200, 200, 200, 255], // col 4 — outside mask, must stay
    );
    sortRows(buf, 5, 1, { ...FULL, exclude: { x1: 1, y1: 0, x2: 3, y2: 0 }, excludeInvert: true });

    expect(r(buf, 0)).to.equal(50); // col 0 unchanged
    expect(r(buf, 4)).to.equal(200); // col 4 unchanged
    // cols 1–3 sorted ascending: black, grey, white
    expect(r(buf, 1)).to.equal(0);
    expect(r(buf, 2)).to.equal(128);
    expect(r(buf, 3)).to.equal(255);
  });
});

describe('sort: sortColumns() — invert mask', () => {
  it('sorts ONLY the masked column segment, leaving other columns untouched', () => {
    // 3 rows × 2 cols. Mask covers col 0 only (x1=0, x2=0).
    // Col 1 must be completely unchanged.
    const buf = makeBuffer(
      [255, 255, 255, 255],
      [200, 200, 200, 255], // row 0
      [0, 0, 0, 255],
      [200, 200, 200, 255], // row 1
      [128, 128, 128, 255],
      [200, 200, 200, 255], // row 2
    );
    const beforeCol1 = [r(buf, 1), r(buf, 3), r(buf, 5)];

    sortColumns(buf, 2, 3, {
      ...FULL,
      direction: 'vertical',
      exclude: { x1: 0, y1: 0, x2: 0, y2: 2 },
      excludeInvert: true,
    });

    // Col 1 unchanged
    expect(r(buf, 1)).to.equal(beforeCol1[0]);
    expect(r(buf, 3)).to.equal(beforeCol1[1]);
    expect(r(buf, 5)).to.equal(beforeCol1[2]);

    // Col 0 sorted ascending: black, grey, white
    expect(r(buf, 0)).to.equal(0);
    expect(r(buf, 2)).to.equal(128);
    expect(r(buf, 4)).to.equal(255);
  });
});

// ─── pixel bitmask ────────────────────────────────────────────────────────────

/** Build a flat Uint8Array bitmask from a 2D array of 0/1 rows (top to bottom). */
function makeMask(rows: number[][]): Uint8Array {
  const height = rows.length;
  const width = rows[0].length;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) mask[y * width + x] = rows[y][x];
  return mask;
}

describe('sort: sortRows() — pixel bitmask', () => {
  it('leaves masked pixels untouched, sorts unmasked pixels', () => {
    // 1 row × 5 cols. Mask marks cols 1 and 3 (non-contiguous).
    // Unmasked cols: 0, 2, 4 → [white, grey, black] → sorted: [black, grey, white]
    // but they are sorted as separate runs around the masked pixels, so:
    // segment [0,1): [white] → stays white (length 1)
    // segment [2,3): [grey] → stays grey (length 1)
    // segment [4,5): [black] → stays black (length 1)
    // Each segment is length 1 so nothing moves — let's use a wider gap instead.
    //
    // 1 row × 6 cols. Mask covers cols 2–3. Segments: [0,2) and [4,6).
    // [0,2): white, black → sorted: black, white
    // [4,6): grey, red-ish → sorted by brightness ascending
    const buf = makeBuffer(
      [255, 255, 255, 255],
      [0, 0, 0, 255], // cols 0-1 (unmasked)
      [200, 200, 200, 255],
      [200, 200, 200, 255], // cols 2-3 (masked)
      [128, 128, 128, 255],
      [64, 64, 64, 255], // cols 4-5 (unmasked)
    );
    const maskedBefore = [r(buf, 2), r(buf, 3)];
    const mask = makeMask([[0, 0, 1, 1, 0, 0]]);

    sortRows(buf, 6, 1, FULL, mask);

    // Masked cols unchanged
    expect(r(buf, 2)).to.equal(maskedBefore[0]);
    expect(r(buf, 3)).to.equal(maskedBefore[1]);
    // [0,2): black, white
    expect(r(buf, 0)).to.equal(0);
    expect(r(buf, 1)).to.equal(255);
    // [4,6): darker first
    expect(r(buf, 4)).to.equal(64);
    expect(r(buf, 5)).to.equal(128);
  });

  it('skips rows where the mask is entirely zero in invert mode', () => {
    // 2 rows × 2 cols. Mask only covers row 0.
    // In invert mode, row 1 (all zeros in mask) should be untouched.
    const buf = makeBuffer(
      [255, 255, 255, 255],
      [0, 0, 0, 255], // row 0 — masked, will sort inside
      [255, 255, 255, 255],
      [0, 0, 0, 255], // row 1 — unmasked, must not change
    );
    const beforeRow1 = Array.from(buf.slice(8, 16));
    const mask = makeMask([
      [1, 1],
      [0, 0],
    ]);

    sortRows(buf, 2, 2, { ...FULL, excludeInvert: true }, mask);

    // Row 0 sorted inside the mask: black, white
    expect(r(buf, 0)).to.equal(0);
    expect(r(buf, 1)).to.equal(255);
    // Row 1 completely unchanged
    expect(Array.from(buf.slice(8, 16))).to.deep.equal(beforeRow1);
  });

  it('sorts only inside masked runs when excludeInvert is true', () => {
    // 1 row × 6 cols. Mask covers cols 1–4. Invert = sort only inside that run.
    // Inside [1,5): [black, white, grey, red-ish] → sorted ascending
    // Cols 0 and 5 must not move.
    const buf = makeBuffer(
      [42, 42, 42, 255], // col 0 — unmasked
      [255, 255, 255, 255],
      [0, 0, 0, 255], // cols 1-2 (masked)
      [128, 128, 128, 255],
      [64, 64, 64, 255], // cols 3-4 (masked)
      [99, 99, 99, 255], // col 5 — unmasked
    );
    const mask = makeMask([[0, 1, 1, 1, 1, 0]]);

    sortRows(buf, 6, 1, { ...FULL, excludeInvert: true }, mask);

    // Unmasked cols unchanged
    expect(r(buf, 0)).to.equal(42);
    expect(r(buf, 5)).to.equal(99);
    // Inside [1,5): sorted ascending by brightness: 0, 64, 128, 255
    expect(r(buf, 1)).to.equal(0);
    expect(r(buf, 2)).to.equal(64);
    expect(r(buf, 3)).to.equal(128);
    expect(r(buf, 4)).to.equal(255);
  });
});

describe('sort: sortColumns() — pixel bitmask', () => {
  it('leaves masked pixels untouched, sorts unmasked pixels per column', () => {
    // 4 rows × 2 cols. Mask covers col 0 rows 1–2, col 1 is fully unmasked.
    // Col 0: [white, MASKED, MASKED, black] → segments [0,1) and [3,4) — length 1 each, no change
    // Col 1: [black, white, grey, darkgrey] → fully sorted ascending
    const buf = makeBuffer(
      [255, 255, 255, 255],
      [0, 0, 0, 255], // row 0
      [200, 200, 200, 255],
      [255, 255, 255, 255], // row 1
      [200, 200, 200, 255],
      [128, 128, 128, 255], // row 2
      [0, 0, 0, 255],
      [64, 64, 64, 255], // row 3
    );
    const maskedBefore = [r(buf, 2), r(buf, 4)]; // col 0, rows 1 and 2
    const mask = makeMask([
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 0],
    ]);

    sortColumns(buf, 2, 4, { ...FULL, direction: 'vertical' }, mask);

    // Masked pixels in col 0 unchanged
    expect(r(buf, 2)).to.equal(maskedBefore[0]);
    expect(r(buf, 4)).to.equal(maskedBefore[1]);
    // Col 1 sorted ascending: 0, 64, 128, 255
    expect(r(buf, 1)).to.equal(0);
    expect(r(buf, 3)).to.equal(64);
    expect(r(buf, 5)).to.equal(128);
    expect(r(buf, 7)).to.equal(255);
  });

  it('sorts only inside masked runs per column when excludeInvert is true', () => {
    // 4 rows × 1 col. Mask covers rows 1–2. Invert = sort only inside [1,3).
    // Row 0 and row 3 must be unchanged.
    const buf = makeBuffer(
      [42, 42, 42, 255], // row 0 — unmasked
      [255, 255, 255, 255], // row 1 — masked (white)
      [0, 0, 0, 255], // row 2 — masked (black)
      [99, 99, 99, 255], // row 3 — unmasked
    );
    const mask = makeMask([[0], [1], [1], [0]]);

    sortColumns(buf, 1, 4, { ...FULL, direction: 'vertical', excludeInvert: true }, mask);

    expect(r(buf, 0)).to.equal(42); // row 0 unchanged
    expect(r(buf, 3)).to.equal(99); // row 3 unchanged
    // Inside [1,3): sorted ascending: black, white
    expect(r(buf, 1)).to.equal(0);
    expect(r(buf, 2)).to.equal(255);
  });
});

// ─── channel isolation ────────────────────────────────────────────────────────
//
// Two-pixel row: pixel 0 is bright [200,50,80], pixel 1 is dark [10,30,20].
// Ascending sort by brightness moves pixel 1 to position 0 and pixel 0 to position 1.
// Channel isolation means only the target channel's values are reordered;
// the other two channels remain at their original pixel positions.

describe('sort: sortRows() — channel isolation', () => {
  function twoPixelBuf() {
    // pixel 0: bright [200,50,80,255]  brightness ≈ 0.39
    // pixel 1: dark   [10,30,20,255]   brightness ≈ 0.09
    return makeBuffer([200, 50, 80, 255], [10, 30, 20, 255]);
  }

  it('channel=all moves the full pixel (baseline)', () => {
    const buf = twoPixelBuf();
    sortRows(buf, 2, 1, { ...FULL, channel: 'all' });
    // After ascending sort: dark pixel at pos 0, bright at pos 1
    expect(buf[0]).to.equal(10); // r
    expect(buf[1]).to.equal(30); // g
    expect(buf[2]).to.equal(20); // b
    expect(buf[4]).to.equal(200); // r
    expect(buf[5]).to.equal(50); // g
    expect(buf[6]).to.equal(80); // b
  });

  it('channel=red reorders only red, leaves green and blue untouched', () => {
    const buf = twoPixelBuf();
    sortRows(buf, 2, 1, { ...FULL, channel: 'red' });
    // Red values sorted: pos 0 gets 10, pos 1 gets 200
    expect(buf[0]).to.equal(10); // red moved to pos 0
    expect(buf[4]).to.equal(200); // red moved to pos 1
    // Green and blue stay at their original positions (pixel 0's values)
    expect(buf[1]).to.equal(50); // green at pos 0 unchanged
    expect(buf[2]).to.equal(80); // blue at pos 0 unchanged
    // And pixel 1's original green/blue stay at pos 1
    expect(buf[5]).to.equal(30); // green at pos 1 unchanged
    expect(buf[6]).to.equal(20); // blue at pos 1 unchanged
  });

  it('channel=green reorders only green, leaves red and blue untouched', () => {
    const buf = twoPixelBuf();
    sortRows(buf, 2, 1, { ...FULL, channel: 'green' });
    // Green values sorted: pos 0 gets 30, pos 1 gets 50
    expect(buf[1]).to.equal(30); // green moved to pos 0
    expect(buf[5]).to.equal(50); // green moved to pos 1
    // Red and blue untouched
    expect(buf[0]).to.equal(200); // red at pos 0 unchanged
    expect(buf[2]).to.equal(80); // blue at pos 0 unchanged
    expect(buf[4]).to.equal(10); // red at pos 1 unchanged
    expect(buf[6]).to.equal(20); // blue at pos 1 unchanged
  });

  it('channel=blue reorders only blue, leaves red and green untouched', () => {
    const buf = twoPixelBuf();
    sortRows(buf, 2, 1, { ...FULL, channel: 'blue' });
    // Blue values sorted: pos 0 gets 20, pos 1 gets 80
    expect(buf[2]).to.equal(20); // blue moved to pos 0
    expect(buf[6]).to.equal(80); // blue moved to pos 1
    // Red and green untouched
    expect(buf[0]).to.equal(200); // red at pos 0 unchanged
    expect(buf[1]).to.equal(50); // green at pos 0 unchanged
    expect(buf[4]).to.equal(10); // red at pos 1 unchanged
    expect(buf[5]).to.equal(30); // green at pos 1 unchanged
  });

  it('alpha is always preserved regardless of channel', () => {
    const buf = makeBuffer([200, 50, 80, 200], [10, 30, 20, 100]);
    sortRows(buf, 2, 1, { ...FULL, channel: 'red' });
    // Alpha travels with the sorted pixel position in all modes
    expect(buf[3]).to.equal(100); // dark pixel's alpha now at pos 0
    expect(buf[7]).to.equal(200); // bright pixel's alpha now at pos 1
  });
});

describe('sort: sortColumns() — channel isolation', () => {
  it('channel=red reorders only red values down a column', () => {
    // 2 rows × 1 col: pixel 0 bright [200,50,80], pixel 1 dark [10,30,20]
    const buf = makeBuffer([200, 50, 80, 255], [10, 30, 20, 255]);
    sortColumns(buf, 1, 2, { ...FULL, direction: 'vertical', channel: 'red' });
    expect(buf[0]).to.equal(10); // red sorted to top (darker)
    expect(buf[4]).to.equal(200); // red sorted to bottom (brighter)
    expect(buf[1]).to.equal(50); // green at row 0 unchanged
    expect(buf[2]).to.equal(80); // blue at row 0 unchanged
    expect(buf[5]).to.equal(30); // green at row 1 unchanged
    expect(buf[6]).to.equal(20); // blue at row 1 unchanged
  });
});

describe('sort: sortPolar() — channel isolation', () => {
  it('channel=red only modifies the red channel', () => {
    // 1×3 single-ring strip. Pixels have distinct red values and brightness.
    const buf = makeBuffer(
      [200, 100, 100, 255], // bright
      [10, 100, 100, 255], // dark
      [120, 100, 100, 255], // mid
    );
    const greenBefore = [buf[1], buf[5], buf[9]];
    const blueBefore = [buf[2], buf[6], buf[10]];

    sortPolar(buf, 3, 1, { ...FULL, direction: 'radial', channel: 'red' });

    // Green and blue channels are entirely untouched
    expect([buf[1], buf[5], buf[9]]).to.deep.equal(greenBefore);
    expect([buf[2], buf[6], buf[10]]).to.deep.equal(blueBefore);
    // Red values are a permutation of the original reds
    const redAfter = [buf[0], buf[4], buf[8]].sort((a, b) => a - b);
    expect(redAfter).to.deep.equal([10, 120, 200]);
  });
});

// ─── sortPolar ───────────────────────────────────────────────────────────────

describe('sort: sortPolar() — radial', () => {
  it('modifies pixel data (sanity: output differs from input)', () => {
    // 5×5 image with randomised brightness values — full mode, centre focal point.
    const vals: [number, number, number, number][] = [];
    const seed = [
      200, 50, 180, 30, 120, 90, 255, 10, 140, 70, 160, 220, 80, 110, 40, 190, 60, 130, 240, 20,
      100, 170, 230, 15, 145,
    ];
    for (const v of seed) vals.push([v, v, v, 255]);
    const buf = makeBuffer(...vals);
    const before = Array.from(buf);
    sortPolar(buf, 5, 5, { ...FULL, direction: 'radial', cx: 0.5, cy: 0.5 });
    expect(Array.from(buf)).to.not.deep.equal(before);
  });

  it('preserves the total number of pixels (no data loss)', () => {
    const vals: [number, number, number, number][] = [];
    for (let i = 0; i < 25; i++) vals.push([i * 10, i * 10, i * 10, 255]);
    const buf = makeBuffer(...vals);
    sortPolar(buf, 5, 5, { ...FULL, direction: 'radial', cx: 0.5, cy: 0.5 });
    // Every alpha channel should still be 255
    for (let i = 3; i < buf.length; i += 4) expect(buf[i]).to.equal(255);
    // Buffer length unchanged
    expect(buf.length).to.equal(25 * 4);
  });

  it('is a no-op for a 1×1 image', () => {
    const buf = makeBuffer([123, 45, 67, 255]);
    sortPolar(buf, 1, 1, { ...FULL, direction: 'radial', cx: 0.5, cy: 0.5 });
    expect(buf[0]).to.equal(123);
    expect(buf[1]).to.equal(45);
  });

  it('off-centre focal point still covers all pixels', () => {
    const vals: [number, number, number, number][] = [];
    for (let i = 0; i < 16; i++) vals.push([i * 16, i * 16, i * 16, 255]);
    const buf = makeBuffer(...vals);
    // focal point at top-left corner — all pixels are on rings radiating outward
    sortPolar(buf, 4, 4, { ...FULL, direction: 'radial', cx: 0, cy: 0 });
    for (let i = 3; i < buf.length; i += 4) expect(buf[i]).to.equal(255);
  });
});

describe('sort: sortPolar() — spoke', () => {
  it('modifies pixel data (sanity: output differs from input)', () => {
    const vals: [number, number, number, number][] = [];
    const seed = [
      200, 50, 180, 30, 120, 90, 255, 10, 140, 70, 160, 220, 80, 110, 40, 190, 60, 130, 240, 20,
      100, 170, 230, 15, 145,
    ];
    for (const v of seed) vals.push([v, v, v, 255]);
    const buf = makeBuffer(...vals);
    const before = Array.from(buf);
    sortPolar(buf, 5, 5, { ...FULL, direction: 'spoke', cx: 0.5, cy: 0.5 });
    expect(Array.from(buf)).to.not.deep.equal(before);
  });

  it('preserves the total number of pixels (no data loss)', () => {
    const vals: [number, number, number, number][] = [];
    for (let i = 0; i < 25; i++) vals.push([i * 10, i * 10, i * 10, 255]);
    const buf = makeBuffer(...vals);
    sortPolar(buf, 5, 5, { ...FULL, direction: 'spoke', cx: 0.5, cy: 0.5 });
    for (let i = 3; i < buf.length; i += 4) expect(buf[i]).to.equal(255);
    expect(buf.length).to.equal(25 * 4);
  });
});

// ─── sortPolar — seam offset (findSeamOffset coverage) ───────────────────────

describe('sort: sortPolar() — threshold seam offset', () => {
  it('finds a natural boundary pixel to use as seam start in threshold mode', () => {
    // 1-row × 5-col image used as a single ring. Values: bright, dark, bright, bright, bright.
    // lo=0.4, hi=0.9 → pixel 1 (value 10) is below lo — a natural boundary.
    // After sorting the sortable pixels [200,180,160,140] should be ordered and
    // the boundary pixel (10) stays put. Critically: no wrap-around artifact.
    const buf = makeBuffer(
      [200, 200, 200, 255],
      [10, 10, 10, 255], // boundary (below lo)
      [180, 180, 180, 255],
      [160, 160, 160, 255],
      [140, 140, 140, 255],
    );
    sortPolar(buf, 5, 1, {
      ...FULL,
      direction: 'radial',
      mode: 'threshold',
      lo: 0.4,
      hi: 0.9,
      cx: 0.5,
      cy: 0.5,
    });
    // All alphas intact
    for (let i = 3; i < buf.length; i += 4) expect(buf[i]).to.equal(255);
    // Buffer length unchanged
    expect(buf.length).to.equal(5 * 4);
  });
});

// ─── sortPolar — pixel bitmask (isMasked branch coverage) ────────────────────

describe('sort: sortPolar() — pixel bitmask', () => {
  it('leaves masked pixels untouched in radial mode', () => {
    // 3×3 image, focal point top-left (0,0). All pixels at varying radii.
    // Mask covers pixel at (2,0) — it should not move.
    const vals: [number, number, number, number][] = [
      [255, 255, 255, 255],
      [128, 128, 128, 255],
      [10, 10, 10, 255],
      [200, 200, 200, 255],
      [50, 50, 50, 255],
      [180, 180, 180, 255],
      [90, 90, 90, 255],
      [220, 220, 220, 255],
      [60, 60, 60, 255],
    ];
    const buf = makeBuffer(...vals);
    const mask = new Uint8Array(9);
    mask[2] = 1; // mask pixel at (2,0)
    const maskedValBefore = buf[2 * 4]; // red channel of pixel (2,0)

    sortPolar(buf, 3, 3, { ...FULL, direction: 'radial', cx: 0, cy: 0 }, mask);

    expect(buf[2 * 4]).to.equal(maskedValBefore);
    for (let i = 3; i < buf.length; i += 4) expect(buf[i]).to.equal(255);
  });

  it('respects opts.exclude rect without a pixelMask (isMasked rect branch)', () => {
    // 3×3 image. opts.exclude covers the top-right pixel (x:2, y:0).
    // That pixel must not move regardless of which ring it falls on.
    const vals: [number, number, number, number][] = [
      [255, 255, 255, 255],
      [128, 128, 128, 255],
      [10, 10, 10, 255], // (2,0) — inside exclude rect
      [200, 200, 200, 255],
      [50, 50, 50, 255],
      [180, 180, 180, 255],
      [90, 90, 90, 255],
      [220, 220, 220, 255],
      [60, 60, 60, 255],
    ];
    const buf = makeBuffer(...vals);
    const excludedBefore = buf[2 * 4]; // red of pixel at index 2

    sortPolar(buf, 3, 3, {
      ...FULL,
      direction: 'radial',
      cx: 0,
      cy: 0,
      exclude: { x1: 2, y1: 0, x2: 2, y2: 0 },
    });
    // No pixelMask passed — exercises the opts.exclude branch inside isMasked
    expect(buf[2 * 4]).to.equal(excludedBefore);
    for (let i = 3; i < buf.length; i += 4) expect(buf[i]).to.equal(255);
  });

  it('skips rings with no masked pixels when excludeInvert is true', () => {
    // 1×3 image. No pixels masked (mask all zeros). excludeInvert=true means sort
    // ONLY inside the mask — but there is no mask region, so nothing should change.
    // This exercises the `maskedRuns.length === 0 && excludeInvert` early-return.
    const buf = makeBuffer([255, 255, 255, 255], [0, 0, 0, 255], [128, 128, 128, 255]);
    const before = Array.from(buf);
    const mask = new Uint8Array([0, 0, 0]); // no pixels masked

    sortPolar(
      buf,
      3,
      1,
      { ...FULL, direction: 'radial', cx: 0.5, cy: 0.5, excludeInvert: true },
      mask,
    );

    expect(Array.from(buf)).to.deep.equal(before);
  });
});
