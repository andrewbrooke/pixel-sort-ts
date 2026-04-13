'use client';

import { useRef, useState } from 'react';
import type { Rect } from '@core/types';
import {
  toImageCoords,
  toDisplayRect,
  sampleBrightness,
  overlayColors,
  CLICK_THRESHOLD_PX,
} from '../../utils/overlayHelpers';

export function MaskOverlay({
  imgRef,
  exclude,
  onExcludeChange,
  onFocalPointSet,
}: {
  imgRef: React.RefObject<HTMLImageElement | null>;
  exclude: Rect | null;
  onExcludeChange: (rect: Rect | null) => void;
  onFocalPointSet?: (x: number, y: number) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState<Rect | null>(null);
  const [brightness, setBrightness] = useState<'light' | 'dark'>('dark');

  const getCoords = (e: React.MouseEvent) => {
    if (!overlayRef.current || !imgRef.current) return null;
    return toImageCoords(e, overlayRef.current, imgRef.current);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const coords = getCoords(e);
    if (!coords) return;
    if (imgRef.current) setBrightness(sampleBrightness(imgRef.current, coords.x, coords.y));
    setDragStart(coords);
    setLive(null);
    // Do NOT call onExcludeChange(null) here — that would change opts mid-drag and
    // trigger a spurious auto-sort. The live preview is driven by the `live` state,
    // so opts.exclude only needs to change on mouseup when the drag is complete.
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragStart) return;
    const coords = getCoords(e);
    if (!coords) return;
    setLive({
      x1: Math.min(dragStart.x, coords.x),
      y1: Math.min(dragStart.y, coords.y),
      x2: Math.max(dragStart.x, coords.x),
      y2: Math.max(dragStart.y, coords.y),
    });
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (!dragStart) return;
    const coords = getCoords(e);
    setDragStart(null);
    setLive(null);
    if (!coords) return;
    // Treat as a click (no meaningful drag) — set focal point if available
    if (
      onFocalPointSet &&
      Math.abs(coords.x - dragStart.x) < CLICK_THRESHOLD_PX &&
      Math.abs(coords.y - dragStart.y) < CLICK_THRESHOLD_PX
    ) {
      const img = imgRef.current;
      if (img) onFocalPointSet(coords.x / img.naturalWidth, coords.y / img.naturalHeight);
      return;
    }
    const rect: Rect = {
      x1: Math.min(dragStart.x, coords.x),
      y1: Math.min(dragStart.y, coords.y),
      x2: Math.max(dragStart.x, coords.x),
      y2: Math.max(dragStart.y, coords.y),
    };
    if (rect.x1 !== rect.x2 || rect.y1 !== rect.y2) onExcludeChange(rect);
  };

  const displayed = live ?? exclude;
  const displayRect =
    displayed && overlayRef.current && imgRef.current
      ? toDisplayRect(displayed, overlayRef.current, imgRef.current)
      : null;

  return (
    <div
      ref={overlayRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ position: 'absolute', inset: 0, cursor: 'crosshair', userSelect: 'none' }}
    >
      {displayRect &&
        (() => {
          const { stroke, fill } = overlayColors(brightness);
          return (
            <div
              style={{
                position: 'absolute',
                left: displayRect.left,
                top: displayRect.top,
                width: displayRect.width,
                height: displayRect.height,
                background: fill,
                border: `2px solid ${stroke}`,
                pointerEvents: 'none',
              }}
            />
          );
        })()}
    </div>
  );
}
