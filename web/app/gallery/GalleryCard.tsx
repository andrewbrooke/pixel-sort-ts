'use client';

import { useState, useEffect } from 'react';
import type { GalleryImage } from '../../lib/db';

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function ParamBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        fontSize: '10px',
        padding: '2px 6px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        color: 'var(--muted)',
        fontFamily: 'var(--font)',
      }}
    >
      {label}
    </span>
  );
}

export function GalleryCard({
  image,
  visitorId,
  onDelete,
}: {
  image: GalleryImage;
  visitorId: string;
  onDelete: (id: string) => void;
}) {
  const [likes, setLikes] = useState(image.likes);
  const [liked, setLiked] = useState(false);
  const [liking, setLiking] = useState(false);
  const [deleteToken, setDeleteToken] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setDeleteToken(localStorage.getItem(`gallery-delete-${image.id}`));
    const likedKey = `gallery-liked-${image.id}`;
    setLiked(localStorage.getItem(likedKey) === '1');
  }, [image.id]);

  const toggleLike = async () => {
    if (liking) return;
    setLiking(true);
    const optimisticLiked = !liked;
    const optimisticLikes = optimisticLiked ? likes + 1 : Math.max(0, likes - 1);
    setLiked(optimisticLiked);
    setLikes(optimisticLikes);

    try {
      const res = await fetch(`/api/gallery/${image.id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId }),
      });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.liked);
        setLikes(data.likes);
        localStorage.setItem(`gallery-liked-${image.id}`, data.liked ? '1' : '0');
      } else {
        // Revert on error
        setLiked(!optimisticLiked);
        setLikes(likes);
      }
    } catch {
      setLiked(!optimisticLiked);
      setLikes(likes);
    } finally {
      setLiking(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteToken || deleting) return;
    if (!confirm('Delete this image from the gallery?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/gallery/${image.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteToken }),
      });
      if (res.ok) {
        localStorage.removeItem(`gallery-delete-${image.id}`);
        localStorage.removeItem(`gallery-liked-${image.id}`);
        onDelete(image.id);
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  };

  const p = image.sort_params;

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Image */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: 'auto' }}>
        <img
          src={image.sorted_url}
          alt={image.title ?? 'pixel-sorted image'}
          style={{ width: '100%', display: 'block', objectFit: 'cover' }}
          loading="lazy"
        />
      </div>

      {/* Card body */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {image.title && (
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text)',
              fontFamily: 'var(--font)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {image.title}
          </span>
        )}

        {/* Param badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          <ParamBadge label={p.direction} />
          <ParamBadge label={p.key} />
          <ParamBadge label={p.mode} />
          {p.channel !== 'all' && <ParamBadge label={p.channel} />}
          {p.reverse && <ParamBadge label="reversed" />}
        </div>

        {/* Footer row 1: likes + timestamp */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
          <button
            onClick={toggleLike}
            disabled={liking}
            aria-label={liked ? 'Unlike' : 'Like'}
            style={{
              background: 'none',
              border: 'none',
              cursor: liking ? 'default' : 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: liked ? 'var(--accent)' : 'var(--muted)',
              fontSize: '12px',
              fontFamily: 'var(--font)',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => {
              if (!liked) e.currentTarget.style.color = 'var(--text)';
            }}
            onMouseLeave={e => {
              if (!liked) e.currentTarget.style.color = 'var(--muted)';
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill={liked ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {likes}
          </button>
          <span style={{ color: 'var(--muted)', fontSize: '11px', marginLeft: 'auto' }}>
            {relativeTime(image.created_at)}
          </span>
        </div>

        {/* Footer row 2: actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <a
            href={`/?imageUrl=${encodeURIComponent(image.sorted_url)}`}
            style={{
              color: 'var(--muted)',
              fontSize: '11px',
              fontFamily: 'var(--font)',
              textDecoration: 'none',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
          >
            sort this →
          </a>

          {deleteToken && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              aria-label="Delete"
              title="Delete your upload"
              style={{
                background: 'none',
                border: 'none',
                cursor: deleting ? 'default' : 'pointer',
                padding: 0,
                color: 'var(--muted)',
                fontSize: '11px',
                fontFamily: 'var(--font)',
                marginLeft: 'auto',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#e05555')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
            >
              {deleting ? '…' : 'delete'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
