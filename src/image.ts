import { Jimp } from 'jimp';

export interface ImageData {
  data: Uint8Array;
  width: number;
  height: number;
}

export async function readImage(filePath: string): Promise<ImageData> {
  const img = await Jimp.read(filePath);
  return {
    data: new Uint8Array(img.bitmap.data),
    width: img.bitmap.width,
    height: img.bitmap.height,
  };
}

export async function writeImage(filePath: string, imageData: ImageData): Promise<void> {
  const { data, width, height } = imageData;
  const img = Jimp.fromBitmap({ data: new Uint8Array(data), width, height });

  // jimp 1.x types write() with a complex template literal type for the path;
  // cast to any to avoid it while keeping runtime behaviour correct.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (img as any).write(filePath);
}
