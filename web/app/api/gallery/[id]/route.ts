import { NextRequest, NextResponse } from 'next/server';
import { deleteImage, getImageSortedUrl } from '../../../../lib/db';
import { del } from '@vercel/blob';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const deleteToken = body?.deleteToken as string | undefined;

  if (!deleteToken || typeof deleteToken !== 'string') {
    return NextResponse.json({ error: 'missing deleteToken' }, { status: 400 });
  }

  try {
    const sortedUrl = await getImageSortedUrl(id, deleteToken);

    if (!sortedUrl) {
      return NextResponse.json({ error: 'not found or invalid token' }, { status: 404 });
    }

    const deleted = await deleteImage(id, deleteToken);

    if (deleted) {
      // Best-effort blob cleanup — don't fail the request if this errors
      await del(sortedUrl).catch(err => console.error('blob delete error', err));
    }

    return NextResponse.json({ deleted });
  } catch (err) {
    console.error('delete error', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
