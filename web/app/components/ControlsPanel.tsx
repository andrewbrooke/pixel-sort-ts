'use client';

import type { SortOptions, Direction, SortKey, IntervalMode, Channel } from '@core/types';
import { CHANNELS, DIRECTIONS, SORT_KEYS, INTERVAL_MODES } from '@core/constants';
import { Field } from './Field';

function fmtMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const TOOLTIPS: Record<string, string> = {
  direction:
    'Axis to sort along. Horizontal/vertical/both use straight rows or columns. Radial sorts along concentric rings; spoke sorts along lines radiating from a focal point.',
  key: 'Color property used to rank pixels within each interval before sorting.',
  mode: 'How sortable intervals are detected. full = entire row/column, threshold = brightness range, random = fixed-length segments.',
  lo: 'Lower brightness bound (0–1). Pixels below this value act as interval boundaries in threshold mode.',
  hi: 'Upper brightness bound (0–1). Pixels above this value act as interval boundaries in threshold mode.',
  maxLen: 'Maximum segment length in pixels for random mode.',
  seed: 'PRNG seed for random mode. Same seed + same settings always produce identical output. Leave blank for unseeded (different each run).',
  reverse: 'Sort pixels in descending order instead of ascending.',
  exclude: 'Draw a rectangle on the original image to protect that area from sorting.',
  channel:
    'Sort only one colour channel independently. The other two channels stay frozen at their original positions, producing chromatic-aberration-style colour shifts.',
};

export function ControlsPanel({
  opts,
  set,
  maskEnabled,
  maskMode,
  sliderLo,
  sliderHi,
  autoSort,
  processing,
  inputUrl,
  outputUrl,
  lassoPoints,
  gifFrameCount,
  gifProgress,
  lastSortMs,
  sortProgress,
  onToggleMask,
  onSetMaskMode,
  onSliderLoChange,
  onSliderHiChange,
  onAutoSortChange,
  onReset,
  onRun,
  onDownload,
  onUseAsInput,
  onPublish,
}: {
  opts: SortOptions;
  set: <K extends keyof SortOptions>(key: K, value: SortOptions[K]) => void;
  maskEnabled: boolean;
  maskMode: 'rect' | 'lasso';
  sliderLo: number;
  sliderHi: number;
  autoSort: boolean;
  processing: boolean;
  inputUrl: string | null;
  outputUrl: string | null;
  lassoPoints: { x: number; y: number }[];
  gifFrameCount?: number;
  gifProgress?: number;
  lastSortMs?: number;
  sortProgress?: number;
  onToggleMask: (enabled: boolean) => void;
  onSetMaskMode: (mode: 'rect' | 'lasso') => void;
  onSliderLoChange: (val: number) => void;
  onSliderHiChange: (val: number) => void;
  onAutoSortChange: (val: boolean) => void;
  onReset: () => void;
  onRun: () => void;
  onDownload: () => void;
  onUseAsInput: () => void;
  onPublish: () => void;
}) {
  return (
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

      {(opts.direction === 'radial' || opts.direction === 'spoke') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span className="field-label">focal point</span>
          <span style={{ color: 'var(--muted)', fontSize: '10px' }}>
            click image to set · {(opts.cx * 100).toFixed(0)}%, {(opts.cy * 100).toFixed(0)}%
          </span>
          <button
            onClick={() => {
              set('cx', 0.5);
              set('cy', 0.5);
            }}
            className="btn-ghost"
            style={{ padding: '3px 0', fontSize: '11px' }}
          >
            reset to centre
          </button>
        </div>
      )}

      <Field label="key" tooltip={TOOLTIPS.key}>
        <select value={opts.key} onChange={e => set('key', e.target.value as SortKey)}>
          {SORT_KEYS.map(k => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </Field>

      <Field label="channel" tooltip={TOOLTIPS.channel}>
        <select value={opts.channel} onChange={e => set('channel', e.target.value as Channel)}>
          {CHANNELS.map(c => (
            <option key={c}>{c}</option>
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
              onChange={e => onSliderLoChange(parseFloat(e.target.value))}
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
              onChange={e => onSliderHiChange(parseFloat(e.target.value))}
              onMouseUp={e => set('hi', parseFloat((e.target as HTMLInputElement).value))}
              style={{ width: '100%' }}
            />
          </Field>
        </>
      )}

      {opts.mode === 'random' && (
        <>
          <Field label="max-len" tooltip={TOOLTIPS.maxLen}>
            <input
              type="number"
              min={1}
              max={9999}
              value={opts.maxLen}
              onChange={e => set('maxLen', parseInt(e.target.value) || 1)}
            />
          </Field>
          <Field label="seed" tooltip={TOOLTIPS.seed}>
            <input
              type="number"
              min={0}
              placeholder="random"
              value={opts.seed ?? ''}
              onChange={e => {
                const v = e.target.value;
                set('seed', v === '' ? undefined : parseInt(v));
              }}
            />
          </Field>
        </>
      )}

      <Field label="reverse" tooltip={TOOLTIPS.reverse}>
        <label className="checkbox-row">
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
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={maskEnabled}
            onChange={e => onToggleMask(e.target.checked)}
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
                onClick={() => onSetMaskMode(m)}
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
          <label className="checkbox-row" style={{ paddingLeft: '2px' }}>
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
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={autoSort}
            onChange={e => onAutoSortChange(e.target.checked)}
            style={{ accentColor: 'var(--accent)', width: '14px', height: '14px' }}
          />
          <span style={{ color: autoSort ? 'var(--accent)' : 'var(--muted)', fontSize: '11px' }}>
            auto sort
          </span>
        </label>
        <button
          onClick={onRun}
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

        {(processing || lastSortMs !== undefined) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div
              style={{
                height: '3px',
                background: processing ? 'var(--border)' : 'transparent',
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              {processing &&
                (() => {
                  const isGif = gifFrameCount !== undefined;
                  const pct = isGif
                    ? Math.round(((gifProgress ?? 0) / (gifFrameCount ?? 1)) * 100)
                    : Math.round((sortProgress ?? 0) * 100);
                  return (
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: 'var(--accent)',
                        transition: 'width 0.1s linear',
                      }}
                    />
                  );
                })()}
            </div>
            <span style={{ color: 'var(--muted)', fontSize: '11px', textAlign: 'center' }}>
              {processing
                ? (() => {
                    const isGif = gifFrameCount !== undefined;
                    const pct = isGif
                      ? Math.round(((gifProgress ?? 0) / (gifFrameCount ?? 1)) * 100)
                      : Math.round((sortProgress ?? 0) * 100);
                    const isEncoding =
                      isGif && gifProgress !== undefined && gifProgress >= gifFrameCount;
                    return isEncoding ? 'encoding...' : `${pct}%`;
                  })()
                : `sorted in ${fmtMs(lastSortMs!)}`}
            </span>
          </div>
        )}

        <button onClick={onReset} className="btn-ghost">
          reset to defaults
        </button>

        {outputUrl && (
          <>
            <button onClick={onDownload} className="btn-accent">
              download
            </button>
            <button onClick={onUseAsInput} className="btn-ghost">
              use as input
            </button>
            <button onClick={onPublish} className="btn-ghost">
              publish to gallery
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
