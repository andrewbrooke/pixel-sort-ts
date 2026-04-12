export type Direction = 'horizontal' | 'vertical' | 'both' | 'radial' | 'spoke';

export type SortKey = 'brightness' | 'hue' | 'saturation' | 'lightness' | 'red' | 'green' | 'blue';

export type IntervalMode = 'full' | 'threshold' | 'random';

export interface Pixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Axis-aligned rectangle in pixel coordinates (inclusive on all sides). */
export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SortOptions {
  direction: Direction;
  key: SortKey;
  mode: IntervalMode;
  lo: number;
  hi: number;
  reverse: boolean;
  maxLen: number;
  exclude: Rect | null;
  /** When true, sort ONLY inside the excluded rect instead of outside it. */
  excludeInvert: boolean;
  /** Focal point X for radial/spoke directions, normalised 0–1. Defaults to 0.5 (centre). */
  cx: number;
  /** Focal point Y for radial/spoke directions, normalised 0–1. Defaults to 0.5 (centre). */
  cy: number;
}
