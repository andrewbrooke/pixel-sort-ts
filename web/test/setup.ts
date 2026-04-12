import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Tell React that this environment supports act(). Must be done via vi.stubGlobal
// so Vitest's module isolation picks it up before any React code runs.
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

// ─── Worker ───────────────────────────────────────────────────────────────────
// PixelSorter creates a Web Worker for sort processing. We replace it with a
// no-op that immediately fires onmessage with an empty ArrayBuffer so tests
// can assert on state changes without running the real sort.
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;

  postMessage(data: { buffer: ArrayBuffer; width: number; height: number }) {
    // Fire synchronously so the entire onmessage → setOutputUrl → setProcessing(false)
    // chain completes within the same act() flush that called run(). A setTimeout
    // (macro-task) would fire after act() has already finished, causing React to warn
    // about state updates outside act() in auto-sort tests.
    const out = new ArrayBuffer(data.width * data.height * 4);
    this.onmessage?.({ data: out } as MessageEvent);
  }

  terminate() {}
}
vi.stubGlobal('Worker', MockWorker);

// ─── URL ─────────────────────────────────────────────────────────────────────
// Preserve the real URL constructor — the component uses `new URL(...)` to
// locate the worker. Only stub the static methods that touch the DOM/blob APIs.
vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

// ─── Canvas ──────────────────────────────────────────────────────────────────
// jsdom doesn't implement canvas. Stub getContext to return enough surface for
// drawImage / getImageData / putImageData / toBlob calls.
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({
    data: new Uint8ClampedArray(4),
    width: 1,
    height: 1,
  })),
  putImageData: vi.fn(),
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.toBlob = vi.fn(function (this: HTMLCanvasElement, cb: BlobCallback) {
  cb(new Blob());
});

// jsdom doesn't define ImageData — stub it so the worker onmessage handler
// can call new ImageData(...) without throwing.
vi.stubGlobal(
  'ImageData',
  class {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  },
);

// ─── localStorage ─────────────────────────────────────────────────────────────
// jsdom provides localStorage but vitest resets the DOM between tests,
// so we use a simple in-memory stub for predictability.
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    Object.keys(store).forEach(k => delete store[k]);
  },
});

// ─── fetch ───────────────────────────────────────────────────────────────────
// useOutputAsInput calls fetch(blobUrl).then(r => r.blob()). Stub so it
// resolves with a plain Blob instead of hitting the network/blob registry.
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    blob: () => Promise.resolve(new Blob(['img'], { type: 'image/png' })),
  }),
);

// ─── Image ───────────────────────────────────────────────────────────────────
// jsdom's Image doesn't fire onload automatically. Override so tests that call
// loadFile can trigger the image load callback.
class MockImage {
  naturalWidth = 100;
  naturalHeight = 80;
  onload: (() => void) | null = null;
  set src(_: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}
vi.stubGlobal('Image', MockImage);
