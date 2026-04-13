'use client';

import { useRef, useState, useEffect } from 'react';
import {
  toImageCoords,
  sampleBrightness,
  overlayColors,
  rasterisePolygon,
} from '../../utils/overlayHelpers';

export function LassoOverlay({
  imgRef,
  imageSize,
  lassoPoints,
  onLassoComplete,
  onFocalPointSet,
}: {
  imgRef: React.RefObject<HTMLImageElement | null>;
  imageSize: { width: number; height: number } | null;
  lassoPoints: { x: number; y: number }[];
  onLassoComplete: (points: { x: number; y: number }[], mask: Uint8Array) => void;
  onFocalPointSet?: (x: number, y: number) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [livePoints, setLivePoints] = useState<{ x: number; y: number }[]>([]);
  const [brightness, setBrightness] = useState<'light' | 'dark'>('dark');

  const livePointsRef = useRef(livePoints);
  livePointsRef.current = livePoints;
  const imageSizeRef = useRef(imageSize);
  imageSizeRef.current = imageSize;
  const onLassoCompleteRef = useRef(onLassoComplete);
  onLassoCompleteRef.current = onLassoComplete;
  const onFocalPointSetRef = useRef(onFocalPointSet);
  onFocalPointSetRef.current = onFocalPointSet;

  useEffect(() => {
    const onGlobalMouseUp = () => {
      const pts = livePointsRef.current;
      const size = imageSizeRef.current;
      // Click (no meaningful drag) — set focal point if handler is available
      if (pts.length < 3) {
        if (pts.length === 1 && onFocalPointSetRef.current && size) {
          onFocalPointSetRef.current(pts[0].x / size.width, pts[0].y / size.height);
        }
        setLivePoints([]);
        return;
      }
      setLivePoints([]);
      onLassoCompleteRef.current(pts, rasterisePolygon(pts, size!.width, size!.height));
    };
    window.addEventListener('mouseup', onGlobalMouseUp);
    return () => window.removeEventListener('mouseup', onGlobalMouseUp);
  }, []);

  const getCoords = (e: React.MouseEvent) => {
    if (!overlayRef.current || !imgRef.current) return null;
    return toImageCoords(e, overlayRef.current, imgRef.current);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const coords = getCoords(e);
    if (!coords) return;
    if (imgRef.current) setBrightness(sampleBrightness(imgRef.current, coords.x, coords.y));
    setLivePoints([coords]);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (livePoints.length === 0) return;
    const coords = getCoords(e);
    if (!coords) return;
    setLivePoints(prev => {
      const last = prev[prev.length - 1];
      if (last && Math.abs(coords.x - last.x) < 3 && Math.abs(coords.y - last.y) < 3) return prev;
      return [...prev, coords];
    });
  };

  const toSvgPoints = (pts: { x: number; y: number }[]) => pts.map(p => `${p.x},${p.y}`).join(' ');

  const drawing = livePoints.length > 0;
  const activePts = drawing ? livePoints : lassoPoints;

  // Use a viewBox matching the image's natural dimensions so SVG coordinates are
  // already in image pixel space. preserveAspectRatio="xMidYMid meet" is the SVG
  // equivalent of object-fit:contain — it scales and centers to match the image
  // exactly, with no manual coordinate conversion needed.
  const viewBox = imageSize ? `0 0 ${imageSize.width} ${imageSize.height}` : '0 0 1 1';

  return (
    <div
      ref={overlayRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      style={{ position: 'absolute', inset: 0, cursor: 'crosshair', userSelect: 'none' }}
    >
      {activePts.length > 1 && (
        <svg
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          {(() => {
            const { stroke, fill } = overlayColors(brightness);
            return drawing ? (
              <polyline
                points={toSvgPoints(activePts)}
                fill="none"
                stroke={stroke}
                strokeWidth="2.5"
                strokeDasharray="6 3"
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <polygon
                points={toSvgPoints(activePts)}
                fill={fill}
                stroke={stroke}
                strokeWidth="2.5"
                vectorEffect="non-scaling-stroke"
              />
            );
          })()}
        </svg>
      )}
    </div>
  );
}
