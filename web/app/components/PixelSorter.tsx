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
  const [privacyDismissed, setPrivacyDismissed] = useState(true);
  const [maskMode, setMaskModeState] = useState<'rect' | 'lasso'>('rect');
  const [lassoPoints, setLassoPoints] = useState<{ x: number; y: number }[]>([]);
  const [lassoMask, setLassoMask] = useState<Uint8Array | null>(null);
  const [autoSort, setAutoSort] = useState(false);
  const [sliderLo, setSliderLo] = useState(DEFAULTS.lo);
  const [sliderHi, setSliderHi] = useState(DEFAULTS.hi);
  const source = useRef<SourceImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const runRef = useRef<() => void>(() => {});

  useEffect(
    () => () => {
      workerRef.current?.terminate();
    },
    [],
  );

  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth < 700);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('privacy-dismissed')) setPrivacyDismissed(false);
  }, []);

  const dismissPrivacy = () => {
    localStorage.setItem('privacy-dismissed', '1');
    setPrivacyDismissed(true);
  };

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
    if (!enabled) {
      setOpts(prev => ({ ...prev, exclude: null, excludeInvert: false }));
      setLassoPoints([]);
      setLassoMask(null);
    }
  };

  const setMaskMode = (mode: 'rect' | 'lasso') => {
    setMaskModeState(mode);
    if (mode === 'lasso') {
      setOpts(prev => ({ ...prev, exclude: null }));
    } else {
      setLassoPoints([]);
      setLassoMask(null);
    }
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

    const transferables: ArrayBuffer[] = [data.buffer];
    let maskBuffer: ArrayBuffer | undefined;
    if (lassoMask) {
      const copy = new Uint8Array(lassoMask);
      maskBuffer = copy.buffer;
      transferables.push(maskBuffer);
    }

    worker.postMessage(
      { buffer: data.buffer, width, height, opts, mask: maskBuffer },
      transferables,
    );
  }, [opts, outputUrl, mimeType, lassoMask]);

  runRef.current = run;

  useEffect(() => {
    if (!autoSort || !source.current || processing) return;
    runRef.current();
  }, [opts, autoSort]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = useCallback(() => {
    if (!outputUrl) return;
    const a = document.createElement('a');
    a.href = outputUrl;
    const base = fileName.replace(/\.[^.]+$/, '');
    const ext = MIME_EXT[mimeType] ?? 'png';
    a.download = `${base}_sorted.${ext}`;
    a.click();
  }, [outputUrl, fileName, mimeType]);

  const useOutputAsInput = useCallback(async () => {
    if (!outputUrl) return;
    const blob = await fetch(outputUrl).then(r => r.blob());
    const base = fileName.replace(/\.[^.]+$/, '');
    const ext = MIME_EXT[mimeType] ?? 'png';
    loadFile(new File([blob], `${base}_sorted.${ext}`, { type: blob.type }));
  }, [outputUrl, fileName, mimeType, loadFile]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        padding: '20px',
        gap: '16px',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ color: 'var(--accent)', fontSize: '18px', fontWeight: 'bold' }}>
          pixel-sort
        </span>
        <span style={{ color: 'var(--muted)' }}>glitch art tool</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a
            href="https://github.com/andrewbrooke/pixel-sort-ts"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--muted)',
              textDecoration: 'none',
              fontSize: '12px',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            GitHub
          </a>
          <a
            href="https://ko-fi.com/andrewbrooke"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--muted)',
              textDecoration: 'none',
              fontSize: '12px',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z" />
            </svg>
            Leave a Tip
          </a>
        </div>
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
            <select
              value={opts.direction}
              onChange={e => set('direction', e.target.value as Direction)}
            >
              {DIRECTIONS.map(d => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>

          <Field label="key" tooltip={TOOLTIPS.key}>
            <select value={opts.key} onChange={e => set('key', e.target.value as SortKey)}>
              {SORT_KEYS.map(k => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>

          <Field label="mode" tooltip={TOOLTIPS.mode}>
            <select value={opts.mode} onChange={e => set('mode', e.target.value as IntervalMode)}>
              {INTERVAL_MODES.map(m => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>

          {opts.mode === 'threshold' && (
            <>
              <Field label={`lo  ${sliderLo.toFixed(2)}`} tooltip={TOOLTIPS.lo}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={sliderLo}
                  onChange={e => setSliderLo(parseFloat(e.target.value))}
                  onMouseUp={e => set('lo', parseFloat((e.target as HTMLInputElement).value))}
                  style={{ width: '100%' }}
                />
              </Field>
              <Field label={`hi  ${sliderHi.toFixed(2)}`} tooltip={TOOLTIPS.hi}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={sliderHi}
                  onChange={e => setSliderHi(parseFloat(e.target.value))}
                  onMouseUp={e => set('hi', parseFloat((e.target as HTMLInputElement).value))}
                  style={{ width: '100%' }}
                />
              </Field>
            </>
          )}

          {opts.mode === 'random' && (
            <Field label="max-len" tooltip={TOOLTIPS.maxLen}>
              <input
                type="number"
                min={1}
                max={9999}
                value={opts.maxLen}
                onChange={e => set('maxLen', parseInt(e.target.value) || 1)}
              />
            </Field>
          )}

          <Field label="reverse" tooltip={TOOLTIPS.reverse}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={opts.reverse}
                onChange={e => set('reverse', e.target.checked)}
                style={{ accentColor: 'var(--accent)', width: '14px', height: '14px' }}
              />
              <span style={{ color: opts.reverse ? 'var(--accent)' : 'var(--muted)' }}>
                {opts.reverse ? 'on' : 'off'}
              </span>
            </label>
          </Field>

          <Field label="exclude" tooltip={TOOLTIPS.exclude}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={maskEnabled}
                onChange={e => toggleMask(e.target.checked)}
                style={{ accentColor: 'var(--accent)', width: '14px', height: '14px' }}
              />
              <span style={{ color: maskEnabled ? 'var(--accent)' : 'var(--muted)' }}>
                {maskEnabled ? 'draw on image' : 'off'}
              </span>
            </label>
            {maskEnabled && (
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['rect', 'lasso'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMaskMode(m)}
                    style={{
                      flex: 1,
                      padding: '3px 0',
                      fontSize: '11px',
                      background: maskMode === m ? 'var(--accent)' : 'transparent',
                      color: maskMode === m ? '#000' : 'var(--muted)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      cursor: 'pointer',
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
            {maskEnabled && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  paddingLeft: '2px',
                }}
              >
                <input
                  type="checkbox"
                  checked={opts.excludeInvert}
                  onChange={e => set('excludeInvert', e.target.checked)}
                  style={{ accentColor: 'var(--accent)', width: '14px', height: '14px' }}
                />
                <span
                  style={{
                    color: opts.excludeInvert ? 'var(--accent)' : 'var(--muted)',
                    fontSize: '11px',
                  }}
                >
                  invert (sort inside only)
                </span>
              </label>
            )}
            {maskEnabled && maskMode === 'rect' && opts.exclude && (
              <span style={{ color: 'var(--muted)', fontSize: '10px', fontFamily: 'monospace' }}>
                {opts.exclude.x1},{opts.exclude.y1} → {opts.exclude.x2},{opts.exclude.y2}
              </span>
            )}
            {maskEnabled && maskMode === 'lasso' && lassoPoints.length > 0 && (
              <span style={{ color: 'var(--muted)', fontSize: '10px' }}>
                {lassoPoints.length} points
              </span>
            )}
          </Field>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoSort}
                onChange={e => setAutoSort(e.target.checked)}
                style={{ accentColor: 'var(--accent)', width: '14px', height: '14px' }}
              />
              <span
                style={{ color: autoSort ? 'var(--accent)' : 'var(--muted)', fontSize: '11px' }}
              >
                auto sort
              </span>
            </label>
            <button
              onClick={run}
              disabled={!inputUrl || processing}
              style={{
                padding: '8px',
                background: inputUrl && !processing ? 'var(--accent)' : 'var(--border)',
                color: inputUrl && !processing ? '#000' : 'var(--muted)',
                border: 'none',
                borderRadius: 'var(--radius)',
                fontWeight: 'bold',
                transition: 'background 0.15s',
              }}
            >
              {processing ? 'processing...' : 'sort'}
            </button>

            <button
              onClick={() => {
                setOpts(DEFAULTS);
                setSliderLo(DEFAULTS.lo);
                setSliderHi(DEFAULTS.hi);
                setMaskEnabled(false);
                setMaskModeState('rect');
                setLassoPoints([]);
                setLassoMask(null);
              }}
              style={{
                padding: '8px',
                background: 'transparent',
                color: 'var(--muted)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
              }}
            >
              reset to defaults
            </button>

            {outputUrl && (
              <>
                <button
                  onClick={download}
                  style={{
                    padding: '8px',
                    background: 'transparent',
                    color: 'var(--accent)',
                    border: '1px solid var(--accent)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  download
                </button>
                <button
                  onClick={useOutputAsInput}
                  style={{
                    padding: '8px',
                    background: 'transparent',
                    color: 'var(--muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                  }}
                >
                  use as input
                </button>
              </>
            )}
          </div>
        </aside>

        {/* Preview area */}
        <div
          onDrop={handleDrop}
          onDragOver={e => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            minWidth: 0,
            outline: dragging ? '2px dashed var(--accent)' : '2px dashed transparent',
            borderRadius: 'var(--radius)',
            transition: 'outline-color 0.15s',
          }}
        >
          {!inputUrl ? (
            <div
              onDrop={handleDrop}
              onDragOver={e => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onClick={() => fileInputRef.current?.click()}
              style={{
                flex: 1,
                border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                color: dragging ? 'var(--accent)' : 'var(--muted)',
                transition: 'border-color 0.15s, color 0.15s',
              }}
            >
              <span style={{ fontSize: '32px' }}>+</span>
              <span>drop image or click to upload</span>
              <span style={{ fontSize: '11px' }}>JPEG · PNG · WebP · BMP · GIF · TIFF</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) loadFile(f);
                }}
              />
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: isNarrow ? 'column' : 'row',
                gap: '16px',
                minHeight: 0,
              }}
            >
              <ImagePane
                label="original"
                url={inputUrl}
                onReplace={() => fileInputRef.current?.click()}
                maskEnabled={maskEnabled}
                maskMode={maskMode}
                exclude={opts.exclude}
                lassoPoints={lassoPoints}
                imageSize={
                  source.current
                    ? { width: source.current.width, height: source.current.height }
                    : null
                }
                onExcludeChange={rect => setOpts(prev => ({ ...prev, exclude: rect }))}
                onLassoComplete={(pts, mask) => {
                  setLassoPoints(pts);
                  setLassoMask(mask);
                }}
              />
              <ImagePane label="sorted" url={outputUrl} />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) loadFile(f);
                }}
              />
            </div>
          )}
        </div>
      </div>

      {!privacyDismissed && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '8px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontSize: '11px',
            color: 'var(--muted)',
          }}
        >
          <span>
            Your images never leave your device — all processing happens locally in your browser.
          </span>
          <button
            onClick={dismissPrivacy}
            aria-label="Dismiss"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontSize: '14px',
              lineHeight: 1,
              padding: '0 2px',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}
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

/**
 * Sample average brightness of a small patch of image pixels around (x, y).
 * Returns 'light' if the area is bright (use a dark overlay) or 'dark' (use a light overlay).
 */
function sampleBrightness(
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
function overlayColors(brightness: 'light' | 'dark') {
  return brightness === 'light'
    ? { stroke: 'rgba(0,0,0,0.85)', fill: 'rgba(0,0,0,0.15)' }
    : { stroke: 'rgba(255,255,255,0.85)', fill: 'rgba(255,255,255,0.15)' };
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

// ─── Polygon rasterisation ────────────────────────────────────────────────────

/** Scanline fill — returns a flat Uint8Array bitmask (1 = inside polygon). */
function rasterisePolygon(
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

// ─── LassoOverlay ─────────────────────────────────────────────────────────────

function LassoOverlay({
  imgRef,
  imageSize,
  lassoPoints,
  onLassoComplete,
}: {
  imgRef: React.RefObject<HTMLImageElement | null>;
  imageSize: { width: number; height: number } | null;
  lassoPoints: { x: number; y: number }[];
  onLassoComplete: (points: { x: number; y: number }[], mask: Uint8Array) => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [livePoints, setLivePoints] = useState<{ x: number; y: number }[]>([]);
  const [brightness, setBrightness] = useState<'light' | 'dark'>('dark');

  // Refs so the global mouseup handler always sees current values without re-subscribing
  const livePointsRef = useRef(livePoints);
  livePointsRef.current = livePoints;
  const imageSizeRef = useRef(imageSize);
  imageSizeRef.current = imageSize;
  const onLassoCompleteRef = useRef(onLassoComplete);
  onLassoCompleteRef.current = onLassoComplete;

  // Finish the lasso on mouseup anywhere on the page — handles the case where the
  // user drags outside the overlay while holding the button down.
  useEffect(() => {
    const onGlobalMouseUp = () => {
      const pts = livePointsRef.current;
      const size = imageSizeRef.current;
      if (pts.length < 3 || !size) {
        setLivePoints([]);
        return;
      }
      setLivePoints([]);
      onLassoCompleteRef.current(pts, rasterisePolygon(pts, size.width, size.height));
    };
    window.addEventListener('mouseup', onGlobalMouseUp);
    return () => window.removeEventListener('mouseup', onGlobalMouseUp);
  }, []); // no deps — refs keep it current without re-subscribing

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

// ─── ImagePane ────────────────────────────────────────────────────────────────

function ImagePane({
  label,
  url,
  onReplace,
  maskEnabled = false,
  maskMode = 'rect',
  exclude = null,
  lassoPoints = [],
  imageSize = null,
  onExcludeChange,
  onLassoComplete,
}: {
  label: string;
  url: string | null;
  onReplace?: () => void;
  maskEnabled?: boolean;
  maskMode?: 'rect' | 'lasso';
  exclude?: Rect | null;
  lassoPoints?: { x: number; y: number }[];
  imageSize?: { width: number; height: number } | null;
  onExcludeChange?: (rect: Rect | null) => void;
  onLassoComplete?: (points: { x: number; y: number }[], mask: Uint8Array) => void;
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
              <MaskOverlay imgRef={imgRef} exclude={exclude} onExcludeChange={onExcludeChange} />
            )}
            {maskEnabled && maskMode === 'lasso' && onLassoComplete && (
              <LassoOverlay
                imgRef={imgRef}
                imageSize={imageSize}
                lassoPoints={lassoPoints}
                onLassoComplete={onLassoComplete}
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

// ─── Tooltip & Field ──────────────────────────────────────────────────────────

function Tooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span
        style={{
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          border: '1px solid var(--muted)',
          color: 'var(--muted)',
          fontSize: '10px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'default',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        ?
      </span>
      {visible && (
        <span
          style={{
            position: 'absolute',
            left: 'calc(100% + 8px)',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '200px',
            background: '#222',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '8px 10px',
            fontSize: '11px',
            color: 'var(--text)',
            lineHeight: '1.5',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function Field({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span
          style={{
            color: 'var(--muted)',
            textTransform: 'uppercase',
            fontSize: '11px',
            letterSpacing: '0.05em',
          }}
        >
          {label}
        </span>
        {tooltip && <Tooltip text={tooltip} />}
      </div>
      {children}
    </div>
  );
}
