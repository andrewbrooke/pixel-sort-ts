import 'server-only';
import { neon } from '@neondatabase/serverless';
import type { SortOptions } from '@core/types';

const sql = neon(process.env.DATABASE_URL!);

export interface GalleryImage {
  id: string;
  title: string | null;
  sort_params: SortOptions;
  sorted_url: string;
  likes: number;
  created_at: string;
}

export type SortOrder = 'top' | 'new';

const PAGE_SIZE = 20;

export async function listImages(sort: SortOrder, cursor?: string): Promise<GalleryImage[]> {
  if (sort === 'top') {
    // Cursor encodes "likes_id" for stable keyset pagination
    if (cursor) {
      const [likesStr, id] = cursor.split('_');
      const likes = parseInt(likesStr, 10);
      return (await sql`
        SELECT id, title, sort_params, sorted_url, likes, created_at
        FROM gallery_images
        WHERE (likes, id::text) < (${likes}, ${id})
        ORDER BY likes DESC, id DESC
        LIMIT ${PAGE_SIZE}
      `) as GalleryImage[];
    }
    return (await sql`
      SELECT id, title, sort_params, sorted_url, likes, created_at
      FROM gallery_images
      ORDER BY likes DESC, id DESC
      LIMIT ${PAGE_SIZE}
    `) as GalleryImage[];
  } else {
    if (cursor) {
      return (await sql`
        SELECT id, title, sort_params, sorted_url, likes, created_at
        FROM gallery_images
        WHERE created_at < ${cursor}::timestamptz
        ORDER BY created_at DESC
        LIMIT ${PAGE_SIZE}
      `) as GalleryImage[];
    }
    return (await sql`
      SELECT id, title, sort_params, sorted_url, likes, created_at
      FROM gallery_images
      ORDER BY created_at DESC
      LIMIT ${PAGE_SIZE}
    `) as GalleryImage[];
  }
}

export async function insertImage(params: {
  title: string | null;
  sortParams: SortOptions;
  sortedUrl: string;
  deleteToken: string;
}): Promise<GalleryImage> {
  const rows = await sql`
    INSERT INTO gallery_images (title, sort_params, sorted_url, delete_token)
    VALUES (${params.title}, ${JSON.stringify(params.sortParams)}, ${params.sortedUrl}, ${params.deleteToken})
    RETURNING id, title, sort_params, sorted_url, likes, created_at
  `;
  return rows[0] as GalleryImage;
}

export async function toggleLike(
  imageId: string,
  visitorId: string,
): Promise<{ liked: boolean; likes: number }> {
  const existing = await sql`
    SELECT 1 FROM gallery_likes WHERE image_id = ${imageId} AND visitor_id = ${visitorId}
  `;

  if (existing.length > 0) {
    await sql`
      DELETE FROM gallery_likes WHERE image_id = ${imageId} AND visitor_id = ${visitorId}
    `;
    const updated = await sql`
      UPDATE gallery_images SET likes = GREATEST(0, likes - 1)
      WHERE id = ${imageId}
      RETURNING likes
    `;
    return { liked: false, likes: (updated[0] as { likes: number }).likes };
  } else {
    await sql`
      INSERT INTO gallery_likes (image_id, visitor_id) VALUES (${imageId}, ${visitorId})
      ON CONFLICT DO NOTHING
    `;
    const updated = await sql`
      UPDATE gallery_images SET likes = likes + 1
      WHERE id = ${imageId}
      RETURNING likes
    `;
    return { liked: true, likes: (updated[0] as { likes: number }).likes };
  }
}

export async function deleteImage(imageId: string, deleteToken: string): Promise<boolean> {
  const result = await sql`
    DELETE FROM gallery_images
    WHERE id = ${imageId} AND delete_token = ${deleteToken}
    RETURNING id
  `;
  return result.length > 0;
}

export async function getImageSortedUrl(
  imageId: string,
  deleteToken: string,
): Promise<string | null> {
  const rows = await sql`
    SELECT sorted_url FROM gallery_images WHERE id = ${imageId} AND delete_token = ${deleteToken}
  `;
  return rows.length > 0 ? (rows[0] as { sorted_url: string }).sorted_url : null;
}
