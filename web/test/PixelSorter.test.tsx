import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PixelSorter from '../app/components/PixelSorter';

// ─── Module mocks ─────────────────────────────────────────────────────────────
// These are hoisted before imports so dynamic `await import(...)` calls inside
// the component pick them up.

vi.mock('gifuct-js', () => ({
  parseGIF: vi.fn(() => ({ lsd: { width: 100, height: 80 } })),
  decompressFrames: vi.fn(() => [
    {
      dims: { top: 0, left: 0, width: 100, height: 80 },
      patch: new Uint8ClampedArray(100 * 80 * 4),
      delay: 10,
      disposalType: 1,
    },
    {
      dims: { top: 0, left: 0, width: 100, height: 80 },
      patch: new Uint8ClampedArray(100 * 80 * 4),
      delay: 10,
      disposalType: 1,
    },
  ]),
}));

vi.mock('gifenc', () => ({
  GIFEncoder: vi.fn(() => ({
    writeFrame: vi.fn(),
    finish: vi.fn(),
    bytes: vi.fn(() => new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])),
  })),
  quantize: vi.fn(() => [[0, 0, 0]]),
  applyPalette: vi.fn(() => new Uint8Array(100 * 80)),
}));

// Helper: simulate dropping a file onto an element
function dropFile(element: HTMLElement, file: File) {
  fireEvent.drop(element, {
    dataTransfer: { files: [file] },
  });
}

function makeImageFile(name = 'photo.jpg', type = 'image/jpeg') {
  return new File(['img'], name, { type });
}

function makeGifFile(name = 'anim.gif') {
  // Content doesn't matter — parseGIF/decompressFrames are mocked.
  return new File(['GIF89a'], name, { type: 'image/gif' });
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
  it('renders direction, key, mode, and channel selects with correct defaults', () => {
    render(<PixelSorter />);
    expect(screen.getByDisplayValue('horizontal')).toBeInTheDocument();
    expect(screen.getByDisplayValue('brightness')).toBeInTheDocument();
    expect(screen.getByDisplayValue('threshold')).toBeInTheDocument();
    expect(screen.getByDisplayValue('all')).toBeInTheDocument();
  });

  it('channel select contains all four options', () => {
    render(<PixelSorter />);
    const select = screen.getByDisplayValue('all');
    const options = Array.from((select as HTMLSelectElement).options).map(o => o.value);
    expect(options).toEqual(['all', 'red', 'green', 'blue']);
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

  it('shows max-len and seed inputs only in random mode', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByDisplayValue('threshold'), 'random');
    expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
  });

  it('seed input retains a typed value', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    await user.selectOptions(screen.getByDisplayValue('threshold'), 'random');
    await user.type(screen.getByPlaceholderText('random'), '42');
    expect(screen.getByPlaceholderText('random')).toHaveValue(42);
  });

  it('clearing the seed field leaves it blank, not NaN', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    await user.selectOptions(screen.getByDisplayValue('threshold'), 'random');
    await user.type(screen.getByPlaceholderText('random'), '42');
    await user.clear(screen.getByPlaceholderText('random'));
    expect(screen.getByPlaceholderText('random')).toHaveValue(null);
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

  it('reset button restores channel to all', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    await user.selectOptions(screen.getByDisplayValue('all'), 'red');
    expect(screen.getByDisplayValue('red')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
    expect(screen.getByDisplayValue('all')).toBeInTheDocument();
  });
});

// ─── Radial / spoke ───────────────────────────────────────────────────────────

describe('PixelSorter — radial/spoke controls', () => {
  it('focal point section is absent for default direction', () => {
    render(<PixelSorter />);
    expect(screen.queryByText(/focal point/i)).not.toBeInTheDocument();
  });

  it('focal point section appears when direction is radial', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    await user.selectOptions(screen.getByDisplayValue('horizontal'), 'radial');
    expect(screen.getByText(/focal point/i)).toBeInTheDocument();
  });

  it('focal point section appears when direction is spoke', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    await user.selectOptions(screen.getByDisplayValue('horizontal'), 'spoke');
    expect(screen.getByText(/focal point/i)).toBeInTheDocument();
  });

  it('reset to centre button is present when direction is radial', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    await user.selectOptions(screen.getByDisplayValue('horizontal'), 'radial');
    expect(screen.getByRole('button', { name: /reset to centre/i })).toBeInTheDocument();
  });

  it('focal point section disappears when switching back to horizontal', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    await user.selectOptions(screen.getByDisplayValue('horizontal'), 'radial');
    expect(screen.getByText(/focal point/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByDisplayValue('radial'), 'horizontal');
    expect(screen.queryByText(/focal point/i)).not.toBeInTheDocument();
  });

  it('sort completes when direction is radial', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());
    const user = userEvent.setup();
    await user.selectOptions(screen.getByDisplayValue('horizontal'), 'radial');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^sort$/i }));
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument(),
    );
  });
});

// ─── Animated GIF ─────────────────────────────────────────────────────────────

describe('PixelSorter — animated GIF', () => {
  it('loading an animated GIF enables the sort button', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeGifFile()));
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());
  });

  it('sorting an animated GIF shows the download button', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeGifFile()));
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^sort$/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument(),
    );
  });

  it('sorting an animated GIF shows the "use as input" button', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeGifFile()));
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^sort$/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /use as input/i })).toBeInTheDocument(),
    );
  });

  it('the original pane is shown after an animated GIF is loaded', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeGifFile()));
    await waitFor(() => expect(screen.getByText(/original/i)).toBeInTheDocument());
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

  it('shows sort duration after sort completes', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^sort$/i }));
    });

    await waitFor(() => expect(screen.getByText(/sorted in/i)).toBeInTheDocument());
  });

  it('download button is absent before first sort', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    await waitFor(() => expect(screen.getByText(/original/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
  });
});

// ─── Use as input ─────────────────────────────────────────────────────────────

describe('PixelSorter — use as input', () => {
  it('"use as input" button is absent before first sort', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    await waitFor(() => expect(screen.getByText(/original/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /use as input/i })).not.toBeInTheDocument();
  });

  it('"use as input" button appears after sort completes', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^sort$/i }));
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /use as input/i })).toBeInTheDocument(),
    );
  });

  it('"use as input" clears the output pane', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^sort$/i }));
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /use as input/i })).toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /use as input/i }));
    });
    await waitFor(() => expect(screen.getByText(/run sort to see output/i)).toBeInTheDocument());
  });
});

// ─── Auto sort ────────────────────────────────────────────────────────────────

describe('PixelSorter — auto sort', () => {
  it('auto sort checkbox is unchecked by default', () => {
    render(<PixelSorter />);
    const checkbox = screen.getByRole('checkbox', { name: /auto sort/i });
    expect(checkbox).not.toBeChecked();
  });

  it('checking auto sort triggers a sort when an image is loaded', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());

    await act(async () => {
      await user.click(screen.getByRole('checkbox', { name: /auto sort/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument(),
    );
  });

  it('changing a setting triggers a sort when auto sort is enabled', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());

    // Enable auto sort
    await user.click(screen.getByRole('checkbox', { name: /auto sort/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument(),
    );

    // Change a setting — should trigger another sort
    await act(async () => {
      await user.selectOptions(screen.getByDisplayValue('horizontal'), 'vertical');
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument(),
    );
  });

  it('sorts after a pending sort is unblocked when processing finishes', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());

    // Enable auto sort — first sort starts
    await user.click(screen.getByRole('checkbox', { name: /auto sort/i }));

    // Immediately change direction while the first sort may still be in flight
    await act(async () => {
      await user.selectOptions(screen.getByDisplayValue('horizontal'), 'vertical');
    });

    // Both the in-flight sort and the pending sort should eventually resolve
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument(),
    );
  });

  it('switching to radial direction and changing key both trigger auto sort', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());

    await user.click(screen.getByRole('checkbox', { name: /auto sort/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument(),
    );

    await act(async () => {
      await user.selectOptions(screen.getByDisplayValue('horizontal'), 'radial');
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument(),
    );

    await act(async () => {
      await user.selectOptions(screen.getByDisplayValue('brightness'), 'hue');
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument(),
    );
  });

  it('changing channel triggers auto sort', async () => {
    const user = userEvent.setup();
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeImageFile()));
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());

    await user.click(screen.getByRole('checkbox', { name: /auto sort/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument(),
    );

    await act(async () => {
      await user.selectOptions(screen.getByDisplayValue('all'), 'red');
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument(),
    );
  });
});

// ─── Animated GIF ─────────────────────────────────────────────────────────────

describe('PixelSorter — animated GIF', () => {
  it('loading an animated GIF enables the sort button', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeGifFile()));
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());
  });

  it('sorting an animated GIF shows the download button', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeGifFile()));
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^sort$/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument(),
    );
  });

  it('sorting an animated GIF shows the "use as input" button', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeGifFile()));
    await waitFor(() => expect(screen.getByRole('button', { name: /^sort$/i })).not.toBeDisabled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^sort$/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /use as input/i })).toBeInTheDocument(),
    );
  });

  it('the original pane is shown after an animated GIF is loaded', async () => {
    render(<PixelSorter />);
    const dropZone = screen.getByText(/drop image or click to upload/i).parentElement!;
    await act(async () => dropFile(dropZone, makeGifFile()));
    await waitFor(() => expect(screen.getByText(/original/i)).toBeInTheDocument());
  });
});
