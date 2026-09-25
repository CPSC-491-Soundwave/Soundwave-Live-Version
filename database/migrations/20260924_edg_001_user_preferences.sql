CREATE TABLE user_preferences (
    user_id BIGINT PRIMARY KEY,

    audio_quality_preference TEXT,

    CONSTRAINT user_preferences_user_fk
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT user_preferences_audio_quality_nonblank
        CHECK (
            audio_quality_preference IS NULL
            OR char_length(trim(audio_quality_preference)) > 0
        )
);
