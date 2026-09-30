ALTER TABLE tracks
ADD COLUMN media_path TEXT;

ALTER TABLE tracks
ADD CONSTRAINT tracks_media_path_nonblank_chk
CHECK (
  media_path IS NULL
  OR char_length(trim(media_path)) > 0
);
