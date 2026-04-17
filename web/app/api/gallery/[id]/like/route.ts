import { NextRequest, NextResponse } from 'next/server';
import { toggleLike } from '../../../../../lib/db';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const visitorId = body?.visitorId as string | undefined;

  if (!visitorId || typeof visitorId !== 'string' || visitorId.length > 128) {
    return NextResponse.json({ error: 'missing visitorId' }, { status: 400 });
  }

  try {
    const result = await toggleLike(id, visitorId);
    return NextResponse.json(result);
  } catch (err) {
    console.error('like error', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
