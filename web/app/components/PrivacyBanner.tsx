'use client';

export function PrivacyBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
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
        Your images never leave your device unless you choose to publish them — all processing
        happens locally in your browser.
      </span>
      <button
        onClick={onDismiss}
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
  );
}
