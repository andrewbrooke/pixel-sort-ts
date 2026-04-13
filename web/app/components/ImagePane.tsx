'use client';

import { useRef } from 'react';
import type { Rect } from '@core/types';
import { MaskOverlay, LassoOverlay, FocalPointOverlay } from './overlays';

export function ImagePane({
  label,
  url,
  onReplace,
  maskEnabled = false,
  maskMode = 'rect',
  exclude = null,
  lassoPoints = [],
  imageSize = null,
  focalPoint = null,
  onExcludeChange,
  onLassoComplete,
  onFocalPointSet,
}: {
  label: string;
  url: string | null;
  onReplace?: () => void;
  maskEnabled?: boolean;
  maskMode?: 'rect' | 'lasso';
  exclude?: Rect | null;
  lassoPoints?: { x: number; y: number }[];
  imageSize?: { width: number; height: number } | null;
  focalPoint?: { x: number; y: number } | null;
  onExcludeChange?: (rect: Rect | null) => void;
  onLassoComplete?: (points: { x: number; y: number }[], mask: Uint8Array) => void;
  onFocalPointSet?: (x: number, y: number) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            color: 'var(--muted)',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {label}
        </span>
        {onReplace && (
          <button
            onClick={onReplace}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: '11px',
              padding: 0,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            replace
          </button>
        )}
      </div>
      <div
        style={{
          flex: 1,
          position: 'relative',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {url ? (
          <>
            <img
              ref={imgRef}
              src={url}
              alt={label}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
            {maskEnabled && maskMode === 'rect' && onExcludeChange && (
              <MaskOverlay
                imgRef={imgRef}
                exclude={exclude}
                onExcludeChange={onExcludeChange}
                onFocalPointSet={onFocalPointSet}
              />
            )}
            {maskEnabled && maskMode === 'lasso' && onLassoComplete && (
              <LassoOverlay
                imgRef={imgRef}
                imageSize={imageSize}
                lassoPoints={lassoPoints}
                onLassoComplete={onLassoComplete}
                onFocalPointSet={onFocalPointSet}
              />
            )}
            {focalPoint && imageSize && (
              <FocalPointOverlay
                imageSize={imageSize}
                focalPoint={focalPoint}
                onFocalPointSet={maskEnabled ? undefined : onFocalPointSet}
              />
            )}
          </>
        ) : (
          <span style={{ color: 'var(--muted)', fontSize: '12px' }}>run sort to see output</span>
        )}
      </div>
    </div>
  );
}
