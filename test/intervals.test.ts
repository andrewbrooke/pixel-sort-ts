import { expect } from 'chai';
import { buildIntervals, mulberry32 } from '../src/intervals';
import type { Pixel } from '../src/types';

function px(r: number, g: number, b: number): Pixel {
  return { r, g, b, a: 255 };
}

const BASE = { lo: 0, hi: 1, maxLen: 100 };

describe('intervals: buildIntervals() — full mode', () => {
  it('returns one interval covering all pixels', () => {
    const pixels = [px(0, 0, 0), px(128, 128, 128), px(255, 255, 255)];
    expect(buildIntervals(pixels, { ...BASE, mode: 'full' })).to.deep.equal([[0, 3]]);
  });

  it('works with a single pixel', () => {
    expect(buildIntervals([px(255, 0, 0)], { ...BASE, mode: 'full' })).to.deep.equal([[0, 1]]);
  });
});

describe('intervals: buildIntervals() — threshold mode', () => {
  it('returns empty array when no pixels are in range', () => {
    // All black (brightness = 0), lo = 0.5
    const pixels = [px(0, 0, 0), px(0, 0, 0)];
    expect(
      buildIntervals(pixels, { mode: 'threshold', lo: 0.5, hi: 1, maxLen: 100 }),
    ).to.deep.equal([]);
  });

  it('groups consecutive in-range pixels into one interval', () => {
    // black | mid | mid | black  →  interval [1, 3]
    const pixels = [px(0, 0, 0), px(128, 128, 128), px(150, 150, 150), px(0, 0, 0)];
    expect(
      buildIntervals(pixels, { mode: 'threshold', lo: 0.25, hi: 0.8, maxLen: 100 }),
    ).to.deep.equal([[1, 3]]);
  });

  it('splits at out-of-range pixels', () => {
    // mid | black | mid  →  [0, 1] and [2, 3]
    const pixels = [px(180, 180, 180), px(0, 0, 0), px(180, 180, 180)];
    expect(
      buildIntervals(pixels, { mode: 'threshold', lo: 0.25, hi: 0.8, maxLen: 100 }),
    ).to.deep.equal([
      [0, 1],
      [2, 3],
    ]);
  });

  it('returns single interval when all pixels are in range', () => {
    const pixels = [px(128, 128, 128), px(150, 150, 150)];
    expect(
      buildIntervals(pixels, { mode: 'threshold', lo: 0.25, hi: 0.8, maxLen: 100 }),
    ).to.deep.equal([[0, 2]]);
  });

  it('treats pixels above hi as boundaries (bri2 > hi branch)', () => {
    // white pixels (brightness=1) exceed hi=0.8 and should act as boundaries
    const pixels = [px(128, 128, 128), px(255, 255, 255), px(128, 128, 128)];
    expect(
      buildIntervals(pixels, { mode: 'threshold', lo: 0.25, hi: 0.8, maxLen: 100 }),
    ).to.deep.equal([
      [0, 1],
      [2, 3],
    ]);
  });
});

describe('intervals: mulberry32()', () => {
  it('returns values in [0, 1)', () => {
    const rand = mulberry32(0);
    for (let i = 0; i < 50; i++) {
      const v = rand();
      expect(v).to.be.at.least(0);
      expect(v).to.be.lessThan(1);
    }
  });

  it('same seed produces the same sequence', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) {
      expect(a()).to.equal(b());
    }
  });

  it('advances state on each call', () => {
    const rand = mulberry32(1);
    expect(rand()).to.not.equal(rand());
  });

  it('different seeds produce different first values', () => {
    expect(mulberry32(1)()).to.not.equal(mulberry32(2)());
  });
});

describe('intervals: buildIntervals() — random mode with seed', () => {
  it('same seed produces identical intervals', () => {
    const pixels = Array.from({ length: 100 }, () => px(128, 128, 128));
    const opts = { mode: 'random' as const, lo: 0, hi: 1, maxLen: 20, seed: 77 };
    expect(buildIntervals(pixels, opts)).to.deep.equal(buildIntervals(pixels, opts));
  });

  it('different seeds produce different intervals', () => {
    const pixels = Array.from({ length: 100 }, () => px(128, 128, 128));
    const a = buildIntervals(pixels, { mode: 'random', lo: 0, hi: 1, maxLen: 20, seed: 1 });
    const b = buildIntervals(pixels, { mode: 'random', lo: 0, hi: 1, maxLen: 20, seed: 2 });
    expect(a).to.not.deep.equal(b);
  });
});

describe('intervals: buildIntervals() — random mode', () => {
  it('covers every pixel with no gaps or overlaps', () => {
    const pixels = Array.from({ length: 10 }, () => px(128, 128, 128));
    const intervals = buildIntervals(pixels, { mode: 'random', lo: 0, hi: 1, maxLen: 3 });

    let covered = 0;
    for (const [start, end] of intervals) covered += end - start;
    expect(covered).to.equal(10);
  });

  it('never produces an interval longer than maxLen', () => {
    const pixels = Array.from({ length: 50 }, () => px(128, 128, 128));
    const intervals = buildIntervals(pixels, { mode: 'random', lo: 0, hi: 1, maxLen: 5 });

    for (const [start, end] of intervals) {
      expect(end - start).to.be.at.most(5);
    }
  });

  it('produces at least one interval for a non-empty strip', () => {
    const pixels = [px(0, 0, 0)];
    const intervals = buildIntervals(pixels, { mode: 'random', lo: 0, hi: 1, maxLen: 10 });
    expect(intervals.length).to.be.greaterThan(0);
  });
});
