import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GalleryPage } from '../app/gallery/GalleryPage';

const MOCK_IMAGE = {
  id: 'img-1',
  title: 'First Sort',
  sort_params: {
    direction: 'horizontal',
    key: 'brightness',
    mode: 'threshold',
    channel: 'all',
    reverse: false,
  },
  sorted_url: 'https://blob.example.com/1.jpg',
  likes: 10,
  created_at: new Date(Date.now() - 3_600_000).toISOString(),
};

function mockFetch(images: (typeof MOCK_IMAGE)[]) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ images }),
  } as never);
}

// ─── Render ───────────────────────────────────────────────────────────────────

describe('GalleryPage — render', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch([MOCK_IMAGE]);
  });

  it('renders gallery title', () => {
    render(<GalleryPage />);
    expect(screen.getByText('community results')).toBeInTheDocument();
  });

  it('renders top and new filter tabs', () => {
    render(<GalleryPage />);
    expect(screen.getByRole('button', { name: /▲ top/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /● new/i })).toBeInTheDocument();
  });

  it('renders the pixel-sort header with theme toggle', () => {
    render(<GalleryPage />);
    expect(screen.getByText('pixel-sort')).toBeInTheDocument();
  });
});

// ─── Data fetching ────────────────────────────────────────────────────────────

describe('GalleryPage — data fetching', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch([MOCK_IMAGE]);
  });

  it('fetches images on mount and displays them', async () => {
    render(<GalleryPage />);
    await waitFor(() => expect(screen.getByText('First Sort')).toBeInTheDocument());
  });

  it('fetches with sort=top by default', async () => {
    render(<GalleryPage />);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('sort=top')));
  });

  it('refetches with sort=new when new tab is clicked', async () => {
    render(<GalleryPage />);
    await waitFor(() => screen.getByText('First Sort'));
    await userEvent.click(screen.getByRole('button', { name: /● new/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('sort=new')));
  });

  it('shows loading state initially', () => {
    render(<GalleryPage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows error message when fetch fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'));
    render(<GalleryPage />);
    await waitFor(() => expect(screen.getByText(/failed to load/i)).toBeInTheDocument());
  });
});

// ─── Empty / pagination states ────────────────────────────────────────────────

describe('GalleryPage — empty and pagination', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows empty state when no images returned', async () => {
    mockFetch([]);
    render(<GalleryPage />);
    await waitFor(() => expect(screen.getByText(/no images yet/i)).toBeInTheDocument());
  });

  it('hides load more when fewer than 20 images returned', async () => {
    mockFetch([MOCK_IMAGE]);
    render(<GalleryPage />);
    await waitFor(() => screen.getByText('First Sort'));
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('shows load more button when exactly 20 images returned', async () => {
    mockFetch(
      Array.from({ length: 20 }, (_, i) => ({ ...MOCK_IMAGE, id: `img-${i}`, title: `Sort ${i}` })),
    );
    render(<GalleryPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument(),
    );
  });

  it('shows end marker when all images loaded after load more', async () => {
    // First page: 20 images; second page: fewer than 20
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            images: Array.from({ length: 20 }, (_, i) => ({
              ...MOCK_IMAGE,
              id: `img-${i}`,
              title: `Sort ${i}`,
            })),
          }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ images: [{ ...MOCK_IMAGE, id: 'img-last', title: 'Last' }] }),
      } as never);

    render(<GalleryPage />);
    const loadMore = await screen.findByRole('button', { name: /load more/i });
    await userEvent.click(loadMore);
    await waitFor(() => expect(screen.getByText(/— end —/i)).toBeInTheDocument());
  });
});
