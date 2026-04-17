import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { insertImage } from '../../../../lib/db';
import { randomUUID } from 'crypto';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const sortedFile = formData.get('sorted') as File | null;
  const sortParamsRaw = formData.get('sortParams') as string | null;
  const title = (formData.get('title') as string | null) || null;

  if (!sortedFile || !sortParamsRaw) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }

  if (sortedFile.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 5 MB)' }, { status: 413 });
  }

  let sortParams;
  try {
    sortParams = JSON.parse(sortParamsRaw);
  } catch {
    return NextResponse.json({ error: 'invalid sortParams' }, { status: 400 });
  }

  try {
    const blob = await put(`gallery/${randomUUID()}.${ext(sortedFile.type)}`, sortedFile, {
      access: 'public',
      contentType: sortedFile.type,
    });

    const deleteToken = randomUUID();
    const image = await insertImage({
      title: title ? title.trim().slice(0, 120) : null,
      sortParams,
      sortedUrl: blob.url,
      deleteToken,
    });

    return NextResponse.json({ image, deleteToken });
  } catch (err) {
    console.error('gallery upload error', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

function ext(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mimeType] ?? 'png';
}
