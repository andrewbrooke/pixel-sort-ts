'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { SortOptions, Direction, SortKey, IntervalMode, Rect } from '@core/types';
import { DIRECTIONS, SORT_KEYS, INTERVAL_MODES, DEFAULTS } from '@core/constants';

const CANVAS_MIME: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/webp': 'image/webp',
};

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const TOOLTIPS: Record<string, string> = {
  direction:
    'Axis to sort along. Horizontal sorts pixels within each row, vertical within each column, both does rows then columns.',
  key: 'Color property used to rank pixels within each interval before sorting.',
  mode: 'How sortable intervals are detected. full = entire row/column, threshold = brightness range, random = fixed-length segments.',
  lo: 'Lower brightness bound (0–1). Pixels below this value act as interval boundaries in threshold mode.',
  hi: 'Upper brightness bound (0–1). Pixels above this value act as interval boundaries in threshold mode.',
  maxLen: 'Maximum segment length in pixels for random mode.',
  reverse: 'Sort pixels in descending order instead of ascending.',
  exclude: 'Draw a rectangle on the original image to protect that area from sorting.',
};

type SourceImage = { data: Uint8Array; width: number; height: number };

export default function PixelSorter() {
  const [opts, setOpts] = useState<SortOptions>(DEFAULTS);
  const [maskEnabled, setMaskEnabled] = useState(false);
  const [inputUrl, setInputUrl] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [mimeType, setMimeType] = useState('image/png');
  const [isNarrow, setIsNarrow] = useState(false);
  const source = useRef<SourceImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => { workerRef.current?.terminate(); }, []);

  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth < 700);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const loadFile = useCallback((file: File) => {
    setOutputUrl(null);
    setFileName(file.name);
    setMimeType(CANVAS_MIME[file.type] ?? 'image/png');
    const url = URL.createObjectURL(file);
    setInputUrl(url);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      source.current = {
        data: new Uint8Array(imageData.data.buffer),
        width: canvas.width,
        height: canvas.height,
      };
    };
    img.src = url;
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) loadFile(file);
    },
    [loadFile],
  );

  const set = <K extends keyof SortOptions>(key: K, value: SortOptions[K]) =>
    setOpts(prev => ({ ...prev, [key]: value }));

  const toggleMask = (enabled: boolean) => {
    setMaskEnabled(enabled);
    if (!enabled) setOpts(prev => ({ ...prev, exclude: null, excludeInvert: false }));
  };

  const run = useCallback(() => {
    if (!source.current) return;
    setProcessing(true);

    const { width, height } = source.current;
    const data = new Uint8Array(source.current.data);

    const worker = new Worker(new URL('../workers/sort.worker.ts', import.meta.url));
    workerRef.current = worker;

    worker.onmessage = ({ data: buffer }: MessageEvent<ArrayBuffer>) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0);

      canvas.toBlob(blob => {
        if (blob) {
          if (outputUrl) URL.revokeObjectURL(outputUrl);
          setOutputUrl(URL.createObjectURL(blob));
        }
        setProcessing(false);
        worker.terminate();
        workerRef.current = null;
      }, mimeType);
    };

    worker.onerror = () => {
      setProcessing(false);
      worker.terminate();
      workerRef.current = null;
    };

    worker.postMessage({ buffer: data.buffer, width, height, opts }, [data.buffer]);
  }, [opts, outputUrl, mimeType]);

  const download = useCallback(() => {
    if (!outputUrl) return;
    const a = document.createElement('a');
    a.href = outputUrl;
    const base = fileName.replace(/\.[^.]+$/, '');
    const ext = MIME_EXT[mimeType] ?? 'png';
    a.download = `${base}_sorted.${ext}`;
    a.click();
  }, [outputUrl, fileName, mimeType]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '20px', gap: '16px' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
        <span style={{ color: 'var(--accent)', fontSize: '18px', fontWeight: 'bold' }}>pixel-sort</span>
        <span style={{ color: 'var(--muted)' }}>glitch art tool</span>
      </header>

      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>
        {/* Controls */}
        <aside
          style={{
            width: '220px',
            flexShrink: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <Field label="direction" tooltip={TOOLTIPS.direction}>
            <select value={opts.direction} onChange={e => set('direction', e.target.value as Direction)}>
              {DIRECTIONS.map(d => <option key={d}>{d}</option>)}
            </select>
          </Field>

          <Field label="key" tooltip={TOOLTIPS.key}>
            <select value={opts.key} onChange={e => set('key', e.target.value as SortKey)}>
              {SORT_KEYS.map(k => <option key={k}>{k}</option>)}
            </select>
          </Field>

          <Field label="mode" tooltip={TOOLTIPS.mode}>
            <select value={opts.mode} onChange={e => set('mode', e.target.value as IntervalMode)}>
              {INTERVAL_MODES.map(m => <option key={m}>{m}</option>)}
            </select>
          </Field>

          {opts.mode === 'threshold' && (
            <>
              <Field label={`lo  ${opts.lo.toFixed(2)}`} tooltip={TOOLTIPS.lo}>
                <input type="range" min={0} max={1} step={0.01} value={opts.lo}
                  onChange={e => set('lo', parseFloat(e.target.value))} style={{ width: '100%' }} />
              </Field>
              <Field label={`hi  ${opts.hi.toFixed(2)}`} tooltip={TOOLTIPS.hi}>
                <input type="range" min={0} max={1} step={0.01} value={opts.hi}
                  onChange={e => set('hi', parseFloat(e.target.value))} style={{ width: '100%' }} />
              </Field>
            </>
          )}

          {opts.mode === 'random' && (
            <Field label="max-len" tooltip={TOOLTIPS.maxLen}>
              <input type="number" min={1} max={9999} value={opts.maxLen}
                onChange={e => set('maxLen', parseInt(e.target.value) || 1)} />
            </Field>
          )}

          <Field label="reverse" tooltip={TOOLTIPS.reverse}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={opts.reverse} onChange={e => set('reverse', e.target.checked)}
                style={{ accentColor: 'var(--accent)', width: '14px', height: '14px' }} />
              <span style={{ color: opts.reverse ? 'var(--accent)' : 'var(--muted)' }}>
                {opts.reverse ? 'on' : 'off'}
              </span>
            </label>
          </Field>

          <Field label="exclude" tooltip={TOOLTIPS.exclude}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={maskEnabled} onChange={e => toggleMask(e.target.checked)}
                style={{ accentColor: 'var(--accent)', width: '14px', height: '14px' }} />
              <span style={{ color: maskEnabled ? 'var(--accent)' : 'var(--muted)' }}>
                {maskEnabled ? 'draw on image' : 'off'}
              </span>
            </label>
            {maskEnabled && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', paddingLeft: '2px' }}>
                <input type="checkbox" checked={opts.excludeInvert}
                  onChange={e => set('excludeInvert', e.target.checked)}
                  style={{ accentColor: 'var(--accent)', width: '14px', height: '14px' }} />
                <span style={{ color: opts.excludeInvert ? 'var(--accent)' : 'var(--muted)', fontSize: '11px' }}>
                  invert (sort inside only)
                </span>
              </label>
            )}
            {maskEnabled && opts.exclude && (
              <span style={{ color: 'var(--muted)', fontSize: '10px', fontFamily: 'monospace' }}>
                {opts.exclude.x1},{opts.exclude.y1} → {opts.exclude.x2},{opts.exclude.y2}
              </span>
            )}
          </Field>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button onClick={run} disabled={!inputUrl || processing}
              style={{
                padding: '8px',
                background: inputUrl && !processing ? 'var(--accent)' : 'var(--border)',
                color: inputUrl && !processing ? '#000' : 'var(--muted)',
                border: 'none', borderRadius: 'var(--radius)', fontWeight: 'bold', transition: 'background 0.15s',
              }}
            >
              {processing ? 'processing...' : 'sort'}
            </button>

            <button onClick={() => { setOpts(DEFAULTS); setMaskEnabled(false); }}
              style={{
                padding: '8px', background: 'transparent', color: 'var(--muted)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
              }}
            >
              reset to defaults
            </button>

            {outputUrl && (
              <button onClick={download}
                style={{
                  padding: '8px', background: 'transparent', color: 'var(--accent)',
                  border: '1px solid var(--accent)', borderRadius: 'var(--radius)',
                }}
              >
                download
              </button>
            )}
          </div>
        </aside>

        {/* Preview area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          {!inputUrl ? (
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onClick={() => fileInputRef.current?.click()}
              style={{
                flex: 1,
                border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer',
                color: dragging ? 'var(--accent)' : 'var(--muted)',
                transition: 'border-color 0.15s, color 0.15s',
              }}
            >
              <span style={{ fontSize: '32px' }}>+</span>
              <span>drop image or click to upload</span>
              <span style={{ fontSize: '11px' }}>JPEG · PNG · WebP · BMP · GIF · TIFF</span>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: isNarrow ? 'column' : 'row', gap: '16px', minHeight: 0 }}>
              <ImagePane
                label="original"
                url={inputUrl}
                onReplace={() => fileInputRef.current?.click()}
                maskEnabled={maskEnabled}
                exclude={opts.exclude}
                imageSize={source.current ? { width: source.current.width, height: source.current.height } : null}
                onExcludeChange={rect => setOpts(prev => ({ ...prev, exclude: rect }))}
              />
              <ImagePane label="sorted" url={outputUrl} />
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MaskOverlay ──────────────────────────────────────────────────────────────

type DisplayRect = { left: number; top: number; width: number; height: number };

/** Convert a mouse event position to image pixel coordinates.
 *  Uses the overlay/container element's bounds so that the letterboxing offsets
 *  match the actual flex-centered rendering (not the img element's own bounds). */
function toImageCoords(
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
function toDisplayRect(rect: Rect, containerEl: HTMLElement, imgEl: HTMLImageElement): DisplayRect {
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

function MaskOverlay({
  imgRef,
  exclude,
  onExcludeChange,
}: {
  imgRef: React.RefObject<HTMLImageElement | null>;
  exclude: Rect | null;
  onExcludeChange: (rect: Rect | null) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState<Rect | null>(null);

  const getCoords = (e: React.MouseEvent) => {
    if (!overlayRef.current || !imgRef.current) return null;
    return toImageCoords(e, overlayRef.current, imgRef.current);
  };

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const coords = getCoords(e);
    if (!coords) return;
    setDragStart(coords);
    setLive(null);
    onExcludeChange(null);
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
      style={{
        position: 'absolute',
        inset: 0,
        cursor: 'crosshair',
        userSelect: 'none',
      }}
    >
      {displayRect && (
        <div
          style={{
            position: 'absolute',
            left: displayRect.left,
            top: displayRect.top,
            width: displayRect.width,
            height: displayRect.height,
            background: 'rgba(200, 255, 0, 0.15)',
            border: '1px solid rgba(200, 255, 0, 0.7)',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}

// ─── ImagePane ────────────────────────────────────────────────────────────────

function ImagePane({
  label,
  url,
  onReplace,
  maskEnabled = false,
  exclude = null,
  imageSize: _imageSize = null,
  onExcludeChange,
}: {
  label: string;
  url: string | null;
  onReplace?: () => void;
  maskEnabled?: boolean;
  exclude?: Rect | null;
  imageSize?: { width: number; height: number } | null;
  onExcludeChange?: (rect: Rect | null) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: 'var(--muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
        {onReplace && (
          <button onClick={onReplace}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '11px', padding: 0, textDecoration: 'underline', cursor: 'pointer' }}>
            replace
          </button>
        )}
      </div>
      <div
        style={{
          flex: 1, position: 'relative', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {url ? (
          <>
            <img ref={imgRef} src={url} alt={label}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
            {maskEnabled && onExcludeChange && (
              <MaskOverlay imgRef={imgRef} exclude={exclude} onExcludeChange={onExcludeChange} />
            )}
          </>
        ) : (
          <span style={{ color: 'var(--muted)', fontSize: '12px' }}>run sort to see output</span>
        )}
      </div>
    </div>
  );
}

// ─── Tooltip & Field ──────────────────────────────────────────────────────────

function Tooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      <span style={{
        width: '14px', height: '14px', borderRadius: '50%', border: '1px solid var(--muted)',
        color: 'var(--muted)', fontSize: '10px', display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', cursor: 'default', userSelect: 'none', flexShrink: 0,
      }}>?</span>
      {visible && (
        <span style={{
          position: 'absolute', left: 'calc(100% + 8px)', top: '50%', transform: 'translateY(-50%)',
          width: '200px', background: '#222', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '8px 10px', fontSize: '11px',
          color: 'var(--text)', lineHeight: '1.5', zIndex: 10, pointerEvents: 'none',
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

function Field({ label, tooltip, children }: { label: string; tooltip?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em' }}>
          {label}
        </span>
        {tooltip && <Tooltip text={tooltip} />}
      </div>
      {children}
    </div>
  );
}
