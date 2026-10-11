CREATE TABLE favorites (
    user_id BIGINT NOT NULL,
    track_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT favorites_pkey PRIMARY KEY (user_id, track_id),
    CONSTRAINT favorites_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT favorites_track_id_fkey
        FOREIGN KEY (track_id) REFERENCES tracks (id) ON DELETE CASCADE
);

CREATE INDEX favorites_track_id_idx ON favorites (track_id);
