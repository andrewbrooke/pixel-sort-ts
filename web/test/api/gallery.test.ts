// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('../../lib/db', () => ({
  listImages: vi.fn(),
  insertImage: vi.fn(),
  toggleLike: vi.fn(),
  deleteImage: vi.fn(),
  getImageSortedUrl: vi.fn(),
}));
vi.mock('@vercel/blob', () => ({ put: vi.fn(), del: vi.fn() }));

import { GET } from '../../app/api/gallery/route';
import { POST as upload } from '../../app/api/gallery/upload/route';
import { POST as like } from '../../app/api/gallery/[id]/like/route';
import { DELETE } from '../../app/api/gallery/[id]/route';
import { listImages, insertImage, toggleLike, deleteImage, getImageSortedUrl } from '../../lib/db';
import { put, del } from '@vercel/blob';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const BLOB_URL = 'https://blob.example.com/gallery/img.jpg';
const SORT_PARAMS = JSON.stringify({
  direction: 'horizontal',
  key: 'brightness',
  mode: 'threshold',
});
const MOCK_IMAGE = {
  id: 'img-1',
  title: 'Test',
  sort_params: {},
  sorted_url: BLOB_URL,
  likes: 0,
  created_at: '2024-01-15T10:00:00Z',
};

function uploadRequest(
  opts: { fileBytes?: number; sortParams?: string | null; title?: string } = {},
) {
  const fd = new FormData();
  const bytes = opts.fileBytes ?? 100;
  fd.append('sorted', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'sorted.jpg');
  const sp = opts.sortParams === undefined ? SORT_PARAMS : opts.sortParams;
  if (sp !== null) fd.append('sortParams', sp);
  if (opts.title !== undefined) fd.append('title', opts.title);
  return new NextRequest('http://localhost/api/gallery/upload', { method: 'POST', body: fd });
}

function jsonRequest(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const LIKE_PARAMS = Promise.resolve({ id: 'img-abc' });
const DELETE_PARAMS = Promise.resolve({ id: 'img-abc' });

// ─── GET /api/gallery ─────────────────────────────────────────────────────────

describe('GET /api/gallery', () => {
  beforeEach(() => {
    vi.mocked(listImages).mockResolvedValue([MOCK_IMAGE] as never);
  });

  it('returns images, defaults to sort=top', async () => {
    const res = await GET(new NextRequest('http://localhost/api/gallery'));
    expect(res.status).toBe(200);
    expect((await res.json()).images).toEqual([MOCK_IMAGE]);
    expect(listImages).toHaveBeenCalledWith('top', undefined);
  });

  it('passes sort=new and cursor', async () => {
    await GET(
      new NextRequest('http://localhost/api/gallery?sort=new&cursor=2024-01-01T00%3A00%3A00Z'),
    );
    expect(listImages).toHaveBeenCalledWith('new', '2024-01-01T00:00:00Z');
  });

  it('returns 400 for unknown sort value', async () => {
    expect((await GET(new NextRequest('http://localhost/api/gallery?sort=hot'))).status).toBe(400);
  });

  it('returns 500 when db throws', async () => {
    vi.mocked(listImages).mockRejectedValueOnce(new Error('db error'));
    expect((await GET(new NextRequest('http://localhost/api/gallery'))).status).toBe(500);
  });
});

// ─── POST /api/gallery/upload ─────────────────────────────────────────────────

describe('POST /api/gallery/upload', () => {
  beforeEach(() => {
    vi.mocked(put).mockResolvedValue({ url: BLOB_URL } as never);
    vi.mocked(insertImage).mockResolvedValue(MOCK_IMAGE as never);
  });

  it('returns image and deleteToken on success', async () => {
    const res = await upload(uploadRequest({ title: 'Test' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.image).toEqual(MOCK_IMAGE);
    expect(typeof data.deleteToken).toBe('string');
  });

  it('passes null title when omitted', async () => {
    await upload(uploadRequest());
    expect(insertImage).toHaveBeenCalledWith(expect.objectContaining({ title: null }));
  });

  it('trims title', async () => {
    await upload(uploadRequest({ title: '  My Sort  ' }));
    expect(insertImage).toHaveBeenCalledWith(expect.objectContaining({ title: 'My Sort' }));
  });

  it('returns 400 when sorted file is missing', async () => {
    const fd = new FormData();
    fd.append('sortParams', SORT_PARAMS);
    expect(
      (
        await upload(
          new NextRequest('http://localhost/api/gallery/upload', { method: 'POST', body: fd }),
        )
      ).status,
    ).toBe(400);
  });

  it('returns 400 when sortParams is missing', async () => {
    const fd = new FormData();
    fd.append('sorted', new Blob(['img']), 'sorted.jpg');
    expect(
      (
        await upload(
          new NextRequest('http://localhost/api/gallery/upload', { method: 'POST', body: fd }),
        )
      ).status,
    ).toBe(400);
  });

  it('returns 415 for disallowed file type', async () => {
    const fd = new FormData();
    fd.append('sorted', new Blob(['<html>'], { type: 'text/html' }), 'evil.html');
    fd.append('sortParams', SORT_PARAMS);
    expect(
      (
        await upload(
          new NextRequest('http://localhost/api/gallery/upload', { method: 'POST', body: fd }),
        )
      ).status,
    ).toBe(415);
  });

  it('returns 400 for malformed sortParams JSON', async () => {
    expect((await upload(uploadRequest({ sortParams: 'not-json' }))).status).toBe(400);
  });

  it('returns 413 when file exceeds 5 MB', async () => {
    expect((await upload(uploadRequest({ fileBytes: 6 * 1024 * 1024 }))).status).toBe(413);
  });

  it('returns 500 when blob put throws', async () => {
    vi.mocked(put).mockRejectedValueOnce(new Error('blob error'));
    expect((await upload(uploadRequest())).status).toBe(500);
  });
});

// ─── POST /api/gallery/[id]/like ──────────────────────────────────────────────

describe('POST /api/gallery/[id]/like', () => {
  beforeEach(() => {
    vi.mocked(toggleLike).mockResolvedValue({ liked: true, likes: 6 });
  });

  it('returns toggled like state and calls toggleLike', async () => {
    const res = await like(
      jsonRequest('http://localhost/api/gallery/img-abc/like', 'POST', { visitorId: 'v-1' }),
      { params: LIKE_PARAMS },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ liked: true, likes: 6 });
    expect(toggleLike).toHaveBeenCalledWith('img-abc', 'v-1');
  });

  it('returns 400 when visitorId is missing', async () => {
    expect(
      (
        await like(jsonRequest('http://localhost/api/gallery/img-abc/like', 'POST', {}), {
          params: LIKE_PARAMS,
        })
      ).status,
    ).toBe(400);
  });

  it('returns 400 when visitorId exceeds 128 chars', async () => {
    expect(
      (
        await like(
          jsonRequest('http://localhost/api/gallery/img-abc/like', 'POST', {
            visitorId: 'x'.repeat(129),
          }),
          { params: LIKE_PARAMS },
        )
      ).status,
    ).toBe(400);
  });

  it('returns 400 for malformed JSON body', async () => {
    const req = new NextRequest('http://localhost/api/gallery/img-abc/like', {
      method: 'POST',
      body: 'bad',
    });
    expect((await like(req, { params: LIKE_PARAMS })).status).toBe(400);
  });

  it('returns 500 when db throws', async () => {
    vi.mocked(toggleLike).mockRejectedValueOnce(new Error('db error'));
    expect(
      (
        await like(
          jsonRequest('http://localhost/api/gallery/img-abc/like', 'POST', { visitorId: 'v-1' }),
          { params: LIKE_PARAMS },
        )
      ).status,
    ).toBe(500);
  });
});

// ─── DELETE /api/gallery/[id] ─────────────────────────────────────────────────

describe('DELETE /api/gallery/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getImageSortedUrl).mockResolvedValue(BLOB_URL);
    vi.mocked(deleteImage).mockResolvedValue(true);
    vi.mocked(del).mockResolvedValue(undefined as never);
  });

  it('deletes image and blob, returns deleted=true', async () => {
    const res = await DELETE(
      jsonRequest('http://localhost/api/gallery/img-abc', 'DELETE', { deleteToken: 'tok-1' }),
      { params: DELETE_PARAMS },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toBe(true);
    expect(deleteImage).toHaveBeenCalledWith('img-abc', 'tok-1');
    expect(del).toHaveBeenCalledWith(BLOB_URL);
  });

  it('does not call del when deleteImage returns false', async () => {
    vi.mocked(deleteImage).mockResolvedValueOnce(false);
    await DELETE(
      jsonRequest('http://localhost/api/gallery/img-abc', 'DELETE', { deleteToken: 'tok-1' }),
      { params: DELETE_PARAMS },
    );
    expect(del).not.toHaveBeenCalled();
  });

  it('returns 404 when token does not match', async () => {
    vi.mocked(getImageSortedUrl).mockResolvedValueOnce(null);
    const res = await DELETE(
      jsonRequest('http://localhost/api/gallery/img-abc', 'DELETE', { deleteToken: 'wrong' }),
      { params: DELETE_PARAMS },
    );
    expect(res.status).toBe(404);
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it('returns 400 when deleteToken is missing', async () => {
    expect(
      (
        await DELETE(jsonRequest('http://localhost/api/gallery/img-abc', 'DELETE', {}), {
          params: DELETE_PARAMS,
        })
      ).status,
    ).toBe(400);
  });

  it('returns 500 when db throws', async () => {
    vi.mocked(deleteImage).mockRejectedValueOnce(new Error('db error'));
    expect(
      (
        await DELETE(
          jsonRequest('http://localhost/api/gallery/img-abc', 'DELETE', { deleteToken: 'tok-1' }),
          { params: DELETE_PARAMS },
        )
      ).status,
    ).toBe(500);
  });
});
