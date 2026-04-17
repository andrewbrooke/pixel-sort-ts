import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublishModal } from '../app/components/PublishModal';
import type { SortOptions } from '@core/types';

const SORT_PARAMS: SortOptions = {
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
};

const BASE_PROPS = {
  outputUrl: 'blob:mock',
  mimeType: 'image/png',
  sortParams: SORT_PARAMS,
  onClose: vi.fn(),
  onPublished: vi.fn(),
};

// Helper: mock fetch for the two-step upload (get blob → POST to API)
function mockUploadSuccess() {
  vi.mocked(fetch)
    .mockResolvedValueOnce({ blob: () => Promise.resolve(new Blob(['img'])) } as never)
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ image: { id: 'img-1' }, deleteToken: 'tok-1' }),
    } as never);
}

function mockUploadFailure(errorMsg = 'upload error') {
  vi.mocked(fetch)
    .mockResolvedValueOnce({ blob: () => Promise.resolve(new Blob(['img'])) } as never)
    .mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: errorMsg }),
    } as never);
}

// ─── Render ───────────────────────────────────────────────────────────────────

describe('PublishModal — render', () => {
  it('shows title input, publish, and cancel buttons', () => {
    render(<PublishModal {...BASE_PROPS} />);
    expect(screen.getByPlaceholderText(/leave blank to skip/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^publish$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('shows privacy note', () => {
    render(<PublishModal {...BASE_PROPS} />);
    expect(screen.getByText(/no account needed/i)).toBeInTheDocument();
  });
});

// ─── Dismissal ────────────────────────────────────────────────────────────────

describe('PublishModal — dismissal', () => {
  beforeEach(() => {
    BASE_PROPS.onClose = vi.fn();
  });

  it('calls onClose when cancel is clicked', async () => {
    render(<PublishModal {...BASE_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(BASE_PROPS.onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop is clicked', () => {
    const { container } = render(<PublishModal {...BASE_PROPS} />);
    fireEvent.click(container.firstChild as HTMLElement);
    expect(BASE_PROPS.onClose).toHaveBeenCalledOnce();
  });
});

// ─── Upload flow ──────────────────────────────────────────────────────────────

describe('PublishModal — upload flow', () => {
  beforeEach(() => {
    BASE_PROPS.onClose = vi.fn();
    BASE_PROPS.onPublished = vi.fn();
  });

  it('disables buttons and shows uploading… during upload', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ blob: () => Promise.resolve(new Blob(['img'])) } as never)
      .mockImplementationOnce(() => new Promise(() => {})); // never resolves
    render(<PublishModal {...BASE_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: /^publish$/i }));
    expect(screen.getByRole('button', { name: /uploading/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });

  it('shows success state and calls onPublished after upload', async () => {
    mockUploadSuccess();
    render(<PublishModal {...BASE_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: /^publish$/i }));
    await waitFor(() => expect(screen.getByText(/published ✓/i)).toBeInTheDocument());
    expect(BASE_PROPS.onPublished).toHaveBeenCalledWith({ imageId: 'img-1', deleteToken: 'tok-1' });
  });

  it('shows view gallery link in success state', async () => {
    mockUploadSuccess();
    render(<PublishModal {...BASE_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: /^publish$/i }));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /view gallery/i })).toBeInTheDocument(),
    );
  });

  it('shows close button in success state that calls onClose', async () => {
    mockUploadSuccess();
    render(<PublishModal {...BASE_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: /^publish$/i }));
    await waitFor(() => screen.getByText(/published ✓/i));
    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(BASE_PROPS.onClose).toHaveBeenCalledOnce();
  });

  it('shows error message on API failure', async () => {
    mockUploadFailure('file too large (max 5 MB)');
    render(<PublishModal {...BASE_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: /^publish$/i }));
    await waitFor(() => expect(screen.getByText(/file too large/i)).toBeInTheDocument());
    expect(BASE_PROPS.onPublished).not.toHaveBeenCalled();
  });

  it('shows generic error on network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'));
    render(<PublishModal {...BASE_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: /^publish$/i }));
    await waitFor(() => expect(screen.getByText(/upload failed/i)).toBeInTheDocument());
  });
});
