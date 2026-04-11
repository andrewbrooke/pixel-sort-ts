import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PixelSorter from '../app/components/PixelSorter';

// Helper: simulate dropping a file onto an element
function dropFile(element: HTMLElement, file: File) {
  fireEvent.drop(element, {
    dataTransfer: { files: [file] },
  });
}

function makeImageFile(name = 'photo.jpg', type = 'image/jpeg') {
  return new File(['img'], name, { type });
}

// ─── Initial render ───────────────────────────────────────────────────────────

describe('PixelSorter — initial render', () => {
  it('shows the upload drop zone before any file is loaded', () => {
    render(<PixelSorter />);
    expect(screen.getByText(/drop image or click to upload/i)).toBeInTheDocument();
  });

  it('shows the sort button in a disabled state', () => {
    render(<PixelSorter />);
    expect(screen.getByRole('button', { name: /^sort$/i })).toBeDisabled();
  });

  it('shows placeholder text in the output pane after a file is loaded', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    await waitFor(() => expect(screen.getByText(/run sort to see output/i)).toBeInTheDocument());
  });

  it('renders the header with the app name', () => {
    render(<PixelSorter />);
    expect(screen.getByText('pixel-sort')).toBeInTheDocument();
  });

  it('renders the GitHub and Ko-fi links', () => {
    render(<PixelSorter />);
    expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute(
      'href',
      'https://github.com/andrewbrooke/pixel-sort-ts',
    );
    expect(screen.getByRole('link', { name: /leave a tip/i })).toHaveAttribute(
      'href',
      'https://ko-fi.com/andrewbrooke',
    );
  });
});

// ─── Privacy banner ───────────────────────────────────────────────────────────

describe('PixelSorter — privacy banner', () => {
  beforeEach(() => localStorage.clear());

  it('shows the banner when localStorage has no dismissal entry', async () => {
    render(<PixelSorter />);
    await waitFor(() =>
      expect(screen.getByText(/your images never leave your device/i)).toBeInTheDocument(),
    );
  });

  it('hides the banner after clicking dismiss', async () => {
    render(<PixelSorter />);
    await waitFor(() =>
      expect(screen.getByText(/your images never leave your device/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(/your images never leave your device/i)).not.toBeInTheDocument();
  });

  it('does not show the banner when already dismissed', async () => {
    localStorage.setItem('privacy-dismissed', '1');
    render(<PixelSorter />);
    // Give the useEffect time to run
    await act(async () => {});
    expect(screen.queryByText(/your images never leave your device/i)).not.toBeInTheDocument();
  });
});

// ─── File loading ─────────────────────────────────────────────────────────────

describe('PixelSorter — file loading', () => {
  it('hides the drop zone and enables sort after a file is loaded', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    // Wait for Image onload mock to fire
    await waitFor(() =>
      expect(screen.queryByText(/drop image or click to upload/i)).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());
  });

  it('shows the original image pane label after loading', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    await waitFor(() => expect(screen.getByText(/original/i)).toBeInTheDocument());
  });

  it('shows a replace button after loading', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument(),
    );
  });
});

// ─── Controls ─────────────────────────────────────────────────────────────────

describe('PixelSorter — controls', () => {
  it('renders direction, key, and mode selects with correct defaults', () => {
    render(<PixelSorter />);
    expect(screen.getByDisplayValue('horizontal')).toBeInTheDocument();
    expect(screen.getByDisplayValue('brightness')).toBeInTheDocument();
    expect(screen.getByDisplayValue('threshold')).toBeInTheDocument();
  });

  it('shows lo/hi sliders only in threshold mode', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    // threshold is default — sliders visible
    expect(screen.getAllByRole('slider').length).toBeGreaterThanOrEqual(2);
    // switch to full — sliders gone
    await user.selectOptions(screen.getByDisplayValue('threshold'), 'full');
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('shows max-len input only in random mode', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByDisplayValue('threshold'), 'random');
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
  });

  it('reset button restores default select values', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    await user.selectOptions(screen.getByDisplayValue('horizontal'), 'vertical');
    await user.selectOptions(screen.getByDisplayValue('brightness'), 'hue');
    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
    expect(screen.getByDisplayValue('horizontal')).toBeInTheDocument();
    expect(screen.getByDisplayValue('brightness')).toBeInTheDocument();
  });
});

// ─── Mask UI ──────────────────────────────────────────────────────────────────

describe('PixelSorter — mask controls', () => {
  it('mask checkbox is off by default', () => {
    render(<PixelSorter />);
    const checkboxes = screen.getAllByRole('checkbox');
    // First checkbox is "reverse", second is "exclude" — both unchecked by default
    expect(checkboxes.every(cb => !(cb as HTMLInputElement).checked)).toBe(true);
  });

  it('enabling mask shows rect/lasso mode buttons', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    const [, excludeCheckbox] = screen.getAllByRole('checkbox');
    await user.click(excludeCheckbox);
    expect(screen.getByRole('button', { name: /^rect$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^lasso$/i })).toBeInTheDocument();
  });

  it('enabling mask shows invert checkbox', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    const [, excludeCheckbox] = screen.getAllByRole('checkbox');
    await user.click(excludeCheckbox);
    expect(screen.getByText(/invert \(sort inside only\)/i)).toBeInTheDocument();
  });

  it('disabling mask hides mode buttons', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    const [, excludeCheckbox] = screen.getAllByRole('checkbox');
    await user.click(excludeCheckbox);
    await user.click(excludeCheckbox);
    expect(screen.queryByRole('button', { name: /^rect$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^lasso$/i })).not.toBeInTheDocument();
  });

  it('reset button disables mask and hides mode buttons', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    const [, excludeCheckbox] = screen.getAllByRole('checkbox');
    await user.click(excludeCheckbox);
    expect(screen.getByRole('button', { name: /^rect$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
    expect(screen.queryByRole('button', { name: /^rect$/i })).not.toBeInTheDocument();
  });
});

// ─── Sort flow ────────────────────────────────────────────────────────────────

describe('PixelSorter — sort flow', () => {
  it('shows processing state then download button after sort completes', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^sort$/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument(),
    );
  });

  it('download button is absent before first sort', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    await waitFor(() => expect(screen.getByText(/original/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
  });
});
