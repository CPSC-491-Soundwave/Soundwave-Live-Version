-- Sprint 3: Persistent JWT access-token revocation
-- Owner: Christian McGowan
--
-- Stores revoked JWT identifiers rather than raw tokens.
-- Roles remain in the existing users table.

CREATE TABLE revoked_access_tokens (
    jti UUID PRIMARY KEY,

    user_id BIGINT NOT NULL
        REFERENCES users(id),

    expires_at TIMESTAMPTZ NOT NULL,

    revoked_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);

-- Supports later cleanup of expired revocation records.
CREATE INDEX revoked_access_tokens_expires_at_idx
    ON revoked_access_tokens(expires_at);
