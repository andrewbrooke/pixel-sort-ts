'use client';

import { useState } from 'react';
import type { SortOptions } from '@core/types';

export interface PublishResult {
  imageId: string;
  deleteToken: string;
}

export function PublishModal({
  outputUrl,
  mimeType,
  sortParams,
  onClose,
  onPublished,
}: {
  outputUrl: string;
  mimeType: string;
  sortParams: SortOptions;
  onClose: () => void;
  onPublished: (result: PublishResult) => void;
}) {
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);

  const publish = async () => {
    setUploading(true);
    setError(null);
    try {
      const blob = await fetch(outputUrl).then(r => r.blob());
      const formData = new FormData();
      formData.append('sorted', blob, `sorted.${extFromMime(mimeType)}`);
      formData.append('sortParams', JSON.stringify(sortParams));
      if (title.trim()) formData.append('title', title.trim());
      const res = await fetch('/api/gallery/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Upload failed. Try again.');
        return;
      }
      const data = await res.json();
      onPublished({ imageId: data.image.id, deleteToken: data.deleteToken });
      setPublished(true);
    } catch {
      setError('Upload failed. Check your connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Publish to gallery"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '24px',
          width: '320px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          fontFamily: 'var(--font)',
        }}
      >
        {published ? (
          <>
            <span style={{ fontWeight: 'bold', color: 'var(--accent)', fontSize: '14px' }}>
              published ✓
            </span>
            <p style={{ color: 'var(--muted)', fontSize: '12px', margin: 0 }}>
              Your image is live in the gallery. You can delete it from this browser at any time.
            </p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button onClick={onClose} className="btn-ghost" style={{ flex: 1 }}>
                close
              </button>
              <a
                href="/gallery"
                className="btn-accent"
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none',
                  borderRadius: 'var(--radius)',
                  padding: '8px',
                  fontSize: '13px',
                }}
              >
                view gallery →
              </a>
            </div>
          </>
        ) : (
          <>
            <span style={{ fontWeight: 'bold', color: 'var(--accent)', fontSize: '14px' }}>
              publish to gallery
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span className="field-label">title (optional)</span>
              <input
                type="text"
                maxLength={120}
                placeholder="leave blank to skip"
                value={title}
                onChange={e => setTitle(e.target.value)}
                disabled={uploading}
                style={{
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '6px 8px',
                  fontSize: '13px',
                  fontFamily: 'var(--font)',
                  width: '100%',
                }}
                autoFocus
              />
            </div>

            <p style={{ color: 'var(--muted)', fontSize: '11px', margin: 0 }}>
              Your sorted image will be public. No account needed. You can delete it later from this
              browser.
            </p>

            {error && <span style={{ color: '#e05555', fontSize: '11px' }}>{error}</span>}

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                onClick={onClose}
                disabled={uploading}
                className="btn-ghost"
                style={{ flex: 1 }}
              >
                cancel
              </button>
              <button
                onClick={publish}
                disabled={uploading}
                className="btn-accent"
                style={{ flex: 1 }}
              >
                {uploading ? 'uploading…' : 'publish'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mime] ?? 'png';
}
