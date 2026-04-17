'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type { SortOptions } from '@core/types';
import { DEFAULTS } from '@core/constants';
import { ControlsPanel } from './ControlsPanel';
import { ImagePane } from './ImagePane';
import { Header } from './Header';
import { PrivacyBanner } from './PrivacyBanner';
import { useAnimatedGif, compositeGifFrames } from '../hooks/useAnimatedGif';
import type { RawGifFrame } from '../hooks/useAnimatedGif';
import { useSingleImageSort } from '../hooks/useSingleImageSort';
import { PublishModal } from './PublishModal';
import type { PublishResult } from './PublishModal';

const CANVAS_MIME: Record<string, string> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/webp': 'image/webp',
};

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

import type { SourceImage } from '../hooks/useSingleImageSort';

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
  const [lastSortMs, setLastSortMs] = useState<number | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const animatedGif = useAnimatedGif(opts, lassoMask);
  const { reset: gifReset, setGifFrames, gifFrames, run: runGif } = animatedGif;
  const { run: runSingle, sortProgress } = useSingleImageSort(opts, lassoMask);
  const source = useRef<SourceImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const runRef = useRef<() => void>(() => {});
  const imageUrlConsumed = useRef(false);

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

  const loadFile = useCallback(
    async (file: File) => {
      setOutputUrl(null);
      setFileName(file.name);
      setLastSortMs(null);
      gifReset();

      if (file.type === 'image/gif') {
        const arrayBuffer = await file.arrayBuffer();
        const { parseGIF, decompressFrames } = await import('gifuct-js');
        const gif = parseGIF(arrayBuffer);
        const rawFrames = decompressFrames(gif, true) as unknown as RawGifFrame[];

        if (rawFrames.length > 1) {
          const { width, height } = gif.lsd;
          const frames = compositeGifFrames(rawFrames, width, height);
          setGifFrames(frames);
          setMimeType('image/gif');
          source.current = { data: new Uint8Array(frames[0].data.buffer), width, height };
          const url = URL.createObjectURL(file);
          setInputUrl(url);
          return;
        }
      }

      // Normal single-frame path
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
    },
    [gifReset, setGifFrames],
  );

  // Load an image passed via ?imageUrl= (e.g. from the gallery "sort this" link)
  useEffect(() => {
    if (imageUrlConsumed.current) return;
    const params = new URLSearchParams(window.location.search);
    const imageUrl = params.get('imageUrl');
    if (!imageUrl) return;
    imageUrlConsumed.current = true;
    window.history.replaceState({}, '', '/');
    fetch(imageUrl)
      .then(r => r.blob())
      .then(blob => {
        const filename = imageUrl.split('/').pop() ?? 'gallery.png';
        loadFile(new File([blob], filename, { type: blob.type || 'image/png' }));
      })
      .catch(console.error);
  }, [loadFile]);

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
    setLastSortMs(null);
    const start = performance.now();

    const finish = (blob: Blob) => {
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      setOutputUrl(URL.createObjectURL(blob));
      setLastSortMs(performance.now() - start);
      setProcessing(false);
    };

    if (gifFrames) {
      runGif(source.current.width, source.current.height)
        .then(finish)
        .finally(() => setProcessing(false));
    } else {
      runSingle(source.current, mimeType, finish, () => setProcessing(false));
    }
  }, [gifFrames, runGif, runSingle, outputUrl, mimeType]);

  runRef.current = run;

  // pendingSortRef is set when auto-sort wants to run but is blocked by an in-progress
  // sort. The second effect below watches `processing` and runs the pending sort when
  // the worker finishes.
  const pendingSortRef = useRef(false);

  useEffect(() => {
    if (!autoSort || !source.current) return;
    if (processing) {
      pendingSortRef.current = true;
      return;
    }
    pendingSortRef.current = false;
    runRef.current();
  }, [opts, autoSort, lassoMask]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (processing || !pendingSortRef.current || !autoSort || !source.current) return;
    pendingSortRef.current = false;
    runRef.current();
  }, [processing, autoSort]);

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

  const handlePublished = useCallback((result: PublishResult) => {
    localStorage.setItem(`gallery-delete-${result.imageId}`, result.deleteToken);
  }, []);

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
      <Header />

      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>
        <ControlsPanel
          opts={opts}
          set={set}
          maskEnabled={maskEnabled}
          maskMode={maskMode}
          sliderLo={sliderLo}
          sliderHi={sliderHi}
          autoSort={autoSort}
          processing={processing}
          inputUrl={inputUrl}
          outputUrl={outputUrl}
          lassoPoints={lassoPoints}
          gifFrameCount={animatedGif.gifFrames?.length}
          gifProgress={animatedGif.gifProgress ?? undefined}
          lastSortMs={lastSortMs ?? undefined}
          sortProgress={sortProgress ?? undefined}
          onToggleMask={toggleMask}
          onSetMaskMode={setMaskMode}
          onSliderLoChange={setSliderLo}
          onSliderHiChange={setSliderHi}
          onAutoSortChange={setAutoSort}
          onReset={() => {
            setOpts(DEFAULTS);
            setSliderLo(DEFAULTS.lo);
            setSliderHi(DEFAULTS.hi);
            setMaskEnabled(false);
            setMaskModeState('rect');
            setLassoPoints([]);
            setLassoMask(null);
          }}
          onRun={run}
          onDownload={download}
          onUseAsInput={useOutputAsInput}
          onPublish={() => setPublishOpen(true)}
        />

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
                focalPoint={
                  opts.direction === 'radial' || opts.direction === 'spoke'
                    ? { x: opts.cx, y: opts.cy }
                    : null
                }
                onFocalPointSet={(x, y) => setOpts(prev => ({ ...prev, cx: x, cy: y }))}
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

      {!privacyDismissed && <PrivacyBanner onDismiss={dismissPrivacy} />}

      {publishOpen && outputUrl && (
        <PublishModal
          outputUrl={outputUrl}
          mimeType={mimeType}
          sortParams={opts}
          onClose={() => setPublishOpen(false)}
          onPublished={handlePublished}
        />
      )}
    </div>
  );
}
