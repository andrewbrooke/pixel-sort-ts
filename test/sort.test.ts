import { expect } from 'chai';
import { sortRows, sortColumns } from '../src/sort';
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
    const row0 = [255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255] as const;
    const row2 = [255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 0, 255] as const;
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
