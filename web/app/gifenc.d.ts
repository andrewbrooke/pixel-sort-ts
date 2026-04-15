declare module 'gifenc' {
  type RGBColor = [number, number, number];

  interface GIFEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: {
        palette?: RGBColor[];
        delay?: number;
        repeat?: number;
        transparent?: number;
        dispose?: number;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
    bytesView(): Uint8Array<ArrayBuffer>;
  }

  export function GIFEncoder(): GIFEncoderInstance;
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: Record<string, unknown>,
  ): RGBColor[];
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: RGBColor[],
    format?: string,
  ): Uint8Array<ArrayBuffer>;
}
