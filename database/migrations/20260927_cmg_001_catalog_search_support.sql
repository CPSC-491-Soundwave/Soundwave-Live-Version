CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX artists_name_trgm_idx
    ON artists
    USING GIN (name gin_trgm_ops);

CREATE INDEX albums_title_trgm_idx
    ON albums
    USING GIN (title gin_trgm_ops);

CREATE INDEX tracks_title_trgm_idx
    ON tracks
    USING GIN (title gin_trgm_ops);
