-- Run this once to set up the gallery tables.
-- Connect to your Vercel Postgres database and execute this file.

CREATE TABLE IF NOT EXISTS gallery_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT,
  sort_params   JSONB NOT NULL,
  sorted_url    TEXT NOT NULL,
  likes         INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delete_token  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gallery_likes (
  image_id    UUID NOT NULL REFERENCES gallery_images(id) ON DELETE CASCADE,
  visitor_id  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (image_id, visitor_id)
);

CREATE INDEX IF NOT EXISTS gallery_images_created_at ON gallery_images(created_at DESC);
CREATE INDEX IF NOT EXISTS gallery_images_likes      ON gallery_images(likes DESC);
