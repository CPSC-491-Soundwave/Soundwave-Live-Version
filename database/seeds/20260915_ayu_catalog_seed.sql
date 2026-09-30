INSERT INTO artists (id, name)
VALUES
  (1001, 'Fixture Artist One'),
  (1002, 'Fixture Artist Two'),
  (1003, '<Buddha>')
ON CONFLICT (id)
DO UPDATE SET
  name = EXCLUDED.name;

INSERT INTO albums (id, artist_id, title)
VALUES
  (2001, 1001, 'Fixture Album Alpha'),
  (2002, 1002, 'Fixture Album Beta'),
  (2003, 1003, '<No Copyright>')
ON CONFLICT (id)
DO UPDATE SET
  artist_id = EXCLUDED.artist_id,
  title = EXCLUDED.title;

INSERT INTO tracks (
  id,
  album_id,
  title,
  duration_ms,
  media_path
)
VALUES
  (
    3001,
    2001,
    'Fixture Track One',
    180000,
    NULL
  ),
  (
    3002,
    2001,
    'Fixture Track Two',
    205000,
    NULL
  ),
  (
    3003,
    2002,
    'Fixture Track Three',
    195000,
    NULL
  ),
  (
    3004,
    2002,
    'Fixture Track Four',
    222000,
    NULL
  ),
  (
    3005,
    2003,
    '<Kontekst>',
    <Math.round(duration * 1000)>,
    'mediaFiles/test.mp3'
  )
ON CONFLICT (id)
DO UPDATE SET
  album_id = EXCLUDED.album_id,
  title = EXCLUDED.title,
  duration_ms = EXCLUDED.duration_ms,
  media_path = EXCLUDED.media_path;

SELECT setval(
  pg_get_serial_sequence('artists', 'id'),
  (SELECT MAX(id) FROM artists),
  true
);

SELECT setval(
  pg_get_serial_sequence('albums', 'id'),
  (SELECT MAX(id) FROM albums),
  true
);

SELECT setval(
  pg_get_serial_sequence('tracks', 'id'),
  (SELECT MAX(id) FROM tracks),
  true
);
