import type { Rect } from '@core/types';

export type DisplayRect = { left: number; top: number; width: number; height: number };

/** Convert a mouse event position to image pixel coordinates.
 *  Uses the overlay/container element's bounds so that the letterboxing offsets
 *  match the actual flex-centered rendering (not the img element's own bounds). */
export function toImageCoords(
  e: React.MouseEvent,
  containerEl: HTMLElement,
  imgEl: HTMLImageElement,
): { x: number; y: number } {
  const rect = containerEl.getBoundingClientRect();
  const natW = imgEl.naturalWidth;
  const natH = imgEl.naturalHeight;
  const scale = Math.min(rect.width / natW, rect.height / natH);
  const offsetX = (rect.width - natW * scale) / 2;
  const offsetY = (rect.height - natH * scale) / 2;
  const x = Math.round(Math.max(0, Math.min(natW - 1, (e.clientX - rect.left - offsetX) / scale)));
  const y = Math.round(Math.max(0, Math.min(natH - 1, (e.clientY - rect.top - offsetY) / scale)));
  return { x, y };
}

/** Convert image-space Rect to display-space CSS rect within the container element. */
export function toDisplayRect(
  rect: Rect,
  containerEl: HTMLElement,
  imgEl: HTMLImageElement,
): DisplayRect {
  const elRect = containerEl.getBoundingClientRect();
  const natW = imgEl.naturalWidth;
  const natH = imgEl.naturalHeight;
  const scale = Math.min(elRect.width / natW, elRect.height / natH);
  const offsetX = (elRect.width - natW * scale) / 2;
  const offsetY = (elRect.height - natH * scale) / 2;
  return {
    left: offsetX + rect.x1 * scale,
    top: offsetY + rect.y1 * scale,
    width: (rect.x2 - rect.x1 + 1) * scale,
    height: (rect.y2 - rect.y1 + 1) * scale,
  };
}

/**
 * Sample average brightness of a small patch of image pixels around (x, y).
 * Returns 'light' if the area is bright (use a dark overlay) or 'dark' (use a light overlay).
 */
export function sampleBrightness(
  imgEl: HTMLImageElement,
  x: number,
  y: number,
  radius = 20,
): 'light' | 'dark' {
  try {
    const canvas = document.createElement('canvas');
    const size = radius * 2;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(imgEl, x - radius, y - radius, size, size, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    let total = 0;
    for (let i = 0; i < data.length; i += 4)
      total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return total / (data.length / 4) > 128 ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Overlay stroke/fill colors based on whether the underlying image area is light or dark. */
export function overlayColors(brightness: 'light' | 'dark') {
  return brightness === 'light'
    ? { stroke: 'rgba(0,0,0,0.85)', fill: 'rgba(0,0,0,0.15)' }
    : { stroke: 'rgba(255,255,255,0.85)', fill: 'rgba(255,255,255,0.15)' };
}

export const CLICK_THRESHOLD_PX = 5;

/** Scanline fill — returns a flat Uint8Array bitmask (1 = inside polygon). */
export function rasterisePolygon(
  points: { x: number; y: number }[],
  width: number,
  height: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (points.length < 3) return mask;
  const n = points.length;
  const minY = Math.max(0, Math.floor(Math.min(...points.map(p => p.y))));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...points.map(p => p.y))));

  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const pi = points[i],
        pj = points[j];
      if ((pi.y <= y && pj.y > y) || (pj.y <= y && pi.y > y)) {
        xs.push(pi.x + ((y - pi.y) / (pj.y - pi.y)) * (pj.x - pi.x));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.round(xs[k]));
      const x1 = Math.min(width - 1, Math.round(xs[k + 1]));
      for (let x = x0; x <= x1; x++) mask[y * width + x] = 1;
    }
  }
  return mask;
}
