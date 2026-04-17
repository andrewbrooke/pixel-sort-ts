import { NextRequest, NextResponse } from 'next/server';
import { listImages } from '../../../lib/db';
import type { SortOrder } from '../../../lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const sort = (searchParams.get('sort') ?? 'top') as SortOrder;
  const cursor = searchParams.get('cursor') ?? undefined;

  if (sort !== 'top' && sort !== 'new') {
    return NextResponse.json({ error: 'invalid sort' }, { status: 400 });
  }

  try {
    const images = await listImages(sort, cursor);
    return NextResponse.json({ images });
  } catch (err) {
    console.error('gallery list error', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
