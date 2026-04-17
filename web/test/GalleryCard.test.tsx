import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GalleryCard } from '../app/gallery/GalleryCard';
import type { GalleryImage } from '../lib/db';

const MOCK_IMAGE: GalleryImage = {
  id: 'img-abc',
  title: 'Test Sort',
  sort_params: {
    direction: 'horizontal',
    key: 'brightness',
    mode: 'threshold',
    lo: 0.25,
    hi: 0.8,
    reverse: false,
    maxLen: 200,
    seed: undefined,
    cx: 0.5,
    cy: 0.5,
    channel: 'all',
    exclude: null,
    excludeInvert: false,
  } as never,
  sorted_url: 'https://blob.example.com/img.jpg',
  likes: 5,
  created_at: new Date(Date.now() - 120_000).toISOString(), // 2 min ago
};

const DEFAULT_PROPS = {
  image: MOCK_IMAGE,
  visitorId: 'visitor-xyz',
  onDelete: vi.fn(),
};

function mockLikeResponse(liked: boolean, likes: number) {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ liked, likes }),
  } as never);
}

// ─── Render ───────────────────────────────────────────────────────────────────

describe('GalleryCard — render', () => {
  it('renders the sorted image', () => {
    render(<GalleryCard {...DEFAULT_PROPS} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', MOCK_IMAGE.sorted_url);
  });

  it('renders title when present', () => {
    render(<GalleryCard {...DEFAULT_PROPS} />);
    expect(screen.getByText('Test Sort')).toBeInTheDocument();
  });

  it('does not render title element when title is null', () => {
    render(<GalleryCard {...DEFAULT_PROPS} image={{ ...MOCK_IMAGE, title: null }} />);
    expect(screen.queryByText('Test Sort')).not.toBeInTheDocument();
  });

  it('renders sort param badges', () => {
    render(<GalleryCard {...DEFAULT_PROPS} />);
    expect(screen.getByText('horizontal')).toBeInTheDocument();
    expect(screen.getByText('brightness')).toBeInTheDocument();
    expect(screen.getByText('threshold')).toBeInTheDocument();
  });

  it('renders reversed badge when reverse is true', () => {
    render(
      <GalleryCard
        {...DEFAULT_PROPS}
        image={{ ...MOCK_IMAGE, sort_params: { ...MOCK_IMAGE.sort_params, reverse: true } }}
      />,
    );
    expect(screen.getByText('reversed')).toBeInTheDocument();
  });

  it('does not render channel badge when channel is all', () => {
    render(<GalleryCard {...DEFAULT_PROPS} />);
    expect(screen.queryByText('all')).not.toBeInTheDocument();
  });

  it('renders channel badge when channel is not all', () => {
    render(
      <GalleryCard
        {...DEFAULT_PROPS}
        image={{ ...MOCK_IMAGE, sort_params: { ...MOCK_IMAGE.sort_params, channel: 'red' } }}
      />,
    );
    expect(screen.getByText('red')).toBeInTheDocument();
  });

  it('renders initial like count', () => {
    render(<GalleryCard {...DEFAULT_PROPS} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders sort this link with encoded image URL', () => {
    render(<GalleryCard {...DEFAULT_PROPS} />);
    const link = screen.getByRole('link', { name: /sort this/i });
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining(encodeURIComponent(MOCK_IMAGE.sorted_url)),
    );
  });
});

// ─── Delete button ────────────────────────────────────────────────────────────

describe('GalleryCard — delete button', () => {
  beforeEach(() => {
    localStorage.clear();
    DEFAULT_PROPS.onDelete = vi.fn();
    vi.clearAllMocks(); // reset fetch call history from previous tests
    // Default: confirm returns false so accidental clicks don't trigger deletes.
    // Tests that need confirm=true override this below.
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
  });

  it('does not show delete button without localStorage token', () => {
    render(<GalleryCard {...DEFAULT_PROPS} />);
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('shows delete button when localStorage has token for this image', async () => {
    localStorage.setItem('gallery-delete-img-abc', 'tok-123');
    render(<GalleryCard {...DEFAULT_PROPS} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument(),
    );
  });

  it('calls onDelete and clears token after successful delete', async () => {
    localStorage.setItem('gallery-delete-img-abc', 'tok-123');
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true } as never);

    render(<GalleryCard {...DEFAULT_PROPS} />);
    const btn = await screen.findByRole('button', { name: /delete/i });
    await userEvent.click(btn);

    await waitFor(() => expect(DEFAULT_PROPS.onDelete).toHaveBeenCalledWith('img-abc'));
    expect(localStorage.getItem('gallery-delete-img-abc')).toBeNull();
  });

  it('does not call onDelete when confirm is cancelled', async () => {
    localStorage.setItem('gallery-delete-img-abc', 'tok-123');
    // confirm is already stubbed to false by beforeEach

    render(<GalleryCard {...DEFAULT_PROPS} />);
    const btn = await screen.findByRole('button', { name: /delete/i });
    await userEvent.click(btn);

    expect(DEFAULT_PROPS.onDelete).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ─── Like button ──────────────────────────────────────────────────────────────

describe('GalleryCard — like button', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('optimistically increments count on like', async () => {
    mockLikeResponse(true, 6);
    render(<GalleryCard {...DEFAULT_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: /^like$/i }));
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('syncs to server count after API responds', async () => {
    mockLikeResponse(true, 7); // server says 7 (someone else liked concurrently)
    render(<GalleryCard {...DEFAULT_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: /^like$/i }));
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument());
  });

  it('reverts count on API error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as never);
    render(<GalleryCard {...DEFAULT_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: /^like$/i }));
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument());
  });

  it('stores liked state in localStorage after like', async () => {
    mockLikeResponse(true, 6);
    render(<GalleryCard {...DEFAULT_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: /^like$/i }));
    await waitFor(() => expect(localStorage.getItem('gallery-liked-img-abc')).toBe('1'));
  });

  it('reads existing liked state from localStorage on mount', async () => {
    localStorage.setItem('gallery-liked-img-abc', '1');
    render(<GalleryCard {...DEFAULT_PROPS} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /unlike/i })).toBeInTheDocument(),
    );
  });
});
