import { describe, it, expect } from 'vitest';
import { overlayColors, rasterisePolygon, CLICK_THRESHOLD_PX } from '../app/utils/overlayHelpers';

// ─── overlayColors ────────────────────────────────────────────────────────────

describe('overlayColors', () => {
  it('returns dark stroke and fill for light areas', () => {
    const { stroke, fill } = overlayColors('light');
    expect(stroke).toContain('0,0,0');
    expect(fill).toContain('0,0,0');
  });

  it('returns light stroke and fill for dark areas', () => {
    const { stroke, fill } = overlayColors('dark');
    expect(stroke).toContain('255,255,255');
    expect(fill).toContain('255,255,255');
  });

  it('stroke is more opaque than fill', () => {
    const light = overlayColors('light');
    const darkStrokeOpacity = parseFloat(light.stroke.match(/[\d.]+\)$/)![0]);
    const darkFillOpacity = parseFloat(light.fill.match(/[\d.]+\)$/)![0]);
    expect(darkStrokeOpacity).toBeGreaterThan(darkFillOpacity);

    const dark = overlayColors('dark');
    const lightStrokeOpacity = parseFloat(dark.stroke.match(/[\d.]+\)$/)![0]);
    const lightFillOpacity = parseFloat(dark.fill.match(/[\d.]+\)$/)![0]);
    expect(lightStrokeOpacity).toBeGreaterThan(lightFillOpacity);
  });
});

// ─── rasterisePolygon ─────────────────────────────────────────────────────────

describe('rasterisePolygon', () => {
  it('returns an empty mask for fewer than 3 points', () => {
    const mask = rasterisePolygon(
      [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ],
      10,
      10,
    );
    expect(mask.every(v => v === 0)).toBe(true);
  });

  it('returns a mask of the correct size', () => {
    const mask = rasterisePolygon(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ],
      20,
      15,
    );
    expect(mask.length).toBe(20 * 15);
  });

  it('fills the interior of a square', () => {
    // Square: (1,1)→(8,1)→(8,8)→(1,8) in a 10×10 grid
    const mask = rasterisePolygon(
      [
        { x: 1, y: 1 },
        { x: 8, y: 1 },
        { x: 8, y: 8 },
        { x: 1, y: 8 },
      ],
      10,
      10,
    );
    expect(mask[4 * 10 + 4]).toBe(1); // interior point (4,4)
    expect(mask[0]).toBe(0); // corner (0,0) outside
    expect(mask[9 * 10 + 9]).toBe(0); // corner (9,9) outside
  });

  it('fills the interior of a triangle', () => {
    // Triangle: (0,0)→(9,0)→(4,9) in a 10×10 grid
    const mask = rasterisePolygon(
      [
        { x: 0, y: 0 },
        { x: 9, y: 0 },
        { x: 4, y: 9 },
      ],
      10,
      10,
    );
    expect(mask[1 * 10 + 4]).toBe(1); // row 1, col 4 — near centroid
    expect(mask[9 * 10 + 0]).toBe(0); // bottom-left corner — outside
  });

  it('leaves everything at 0 for an empty points array', () => {
    const mask = rasterisePolygon([], 5, 5);
    expect(mask.every(v => v === 0)).toBe(true);
    expect(mask.length).toBe(25);
  });

  it('clamps fill to within image bounds', () => {
    // Large polygon extending beyond the 5×5 grid
    const mask = rasterisePolygon(
      [
        { x: -5, y: -5 },
        { x: 20, y: -5 },
        { x: 20, y: 20 },
        { x: -5, y: 20 },
      ],
      5,
      5,
    );
    expect(mask.every(v => v === 1)).toBe(true);
    expect(mask.length).toBe(25);
  });
});

// ─── CLICK_THRESHOLD_PX ───────────────────────────────────────────────────────

describe('CLICK_THRESHOLD_PX', () => {
  it('is a positive number', () => {
    expect(CLICK_THRESHOLD_PX).toBeGreaterThan(0);
  });
});
