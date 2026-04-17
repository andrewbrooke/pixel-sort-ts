'use client';

import { useState, useEffect, useCallback } from 'react';
import { GalleryCard } from './GalleryCard';
import { Header } from '../components/Header';
import type { GalleryImage, SortOrder } from '../../lib/db';

function getOrCreateVisitorId(): string {
  const key = 'gallery-visitor-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function nextCursor(images: GalleryImage[], sort: SortOrder): string | null {
  if (images.length === 0) return null;
  const last = images[images.length - 1];
  if (sort === 'top') return `${last.likes}_${last.id}`;
  return last.created_at;
}

export function GalleryPage() {
  const [sort, setSort] = useState<SortOrder>('top');
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [visitorId, setVisitorId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVisitorId(getOrCreateVisitorId());
  }, []);

  const fetchImages = useCallback(
    async (newSort: SortOrder, newCursor: string | null, append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ sort: newSort });
        if (newCursor) params.set('cursor', newCursor);
        const res = await fetch(`/api/gallery?${params}`);
        if (!res.ok) throw new Error('fetch failed');
        const data: { images: GalleryImage[] } = await res.json();
        const fetched = data.images;
        setImages(prev => (append ? [...prev, ...fetched] : fetched));
        setHasMore(fetched.length === 20);
        setCursor(nextCursor(fetched, newSort));
      } catch {
        setError('Failed to load images. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Initial load + re-load on sort change
  useEffect(() => {
    setImages([]);
    setCursor(null);
    setHasMore(true);
    fetchImages(sort, null, false);
  }, [sort, fetchImages]);

  const loadMore = () => {
    if (!loading && hasMore && cursor) fetchImages(sort, cursor, true);
  };

  const handleDelete = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  return (
    <div
      style={{
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <Header page="gallery" />

      {/* Page subtitle */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
        <span style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--accent)' }}>
          gallery
        </span>
        <span style={{ color: 'var(--muted)', fontSize: '13px' }}>community results</span>
      </div>

      {/* Sort tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {(['top', 'new'] as SortOrder[]).map(s => (
          <button
            key={s}
            onClick={() => setSort(s)}
            style={{
              background: sort === s ? 'var(--accent)' : 'transparent',
              color: sort === s ? '#000' : 'var(--muted)',
              border: `1px solid ${sort === s ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              padding: '4px 12px',
              fontSize: '12px',
              fontFamily: 'var(--font)',
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {s === 'top' ? '▲ top' : '● new'}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: '#e05555', fontSize: '12px', marginBottom: '16px' }}>{error}</div>
      )}

      {/* Empty state */}
      {!loading && images.length === 0 && !error && (
        <div
          style={{
            textAlign: 'center',
            color: 'var(--muted)',
            padding: '60px 0',
            fontSize: '13px',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>✦</div>
          No images yet. Sort something and publish it!
        </div>
      )}

      {/* Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '16px',
        }}
      >
        {images.map(img => (
          <GalleryCard key={img.id} image={img} visitorId={visitorId} onDelete={handleDelete} />
        ))}
      </div>

      {/* Load more / loading */}
      <div style={{ textAlign: 'center', marginTop: '32px', minHeight: '40px' }}>
        {loading && <span style={{ color: 'var(--muted)', fontSize: '12px' }}>loading...</span>}
        {!loading && hasMore && images.length > 0 && (
          <button onClick={loadMore} className="btn-ghost" style={{ padding: '6px 24px' }}>
            load more
          </button>
        )}
        {!loading && !hasMore && images.length > 0 && (
          <span style={{ color: 'var(--muted)', fontSize: '11px' }}>— end —</span>
        )}
      </div>
    </div>
  );
}
