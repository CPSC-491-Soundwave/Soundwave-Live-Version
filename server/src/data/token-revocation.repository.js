const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateJti(jti) {
  if (
    typeof jti !== "string" ||
    !UUID_V4_PATTERN.test(jti)
  ) {
    throw new TypeError(
      "A valid UUID v4 token identifier is required."
    );
  }
}

export function createTokenRevocationRepository(database) {
  if (
    !database ||
    typeof database.query !== "function"
  ) {
    throw new TypeError(
      "Token revocation repository requires database.query()."
    );
  }

  return {
    async revokeToken({
      jti,
      userId,
      expiresAt
    } = {}) {
      validateJti(jti);

      const normalizedUserId =
        String(userId ?? "").trim();

      if (!/^[1-9]\d*$/.test(normalizedUserId)) {
        throw new TypeError(
          "A valid positive user ID is required."
        );
      }

      if (
        !(expiresAt instanceof Date) ||
        Number.isNaN(expiresAt.getTime())
      ) {
        throw new TypeError(
          "A valid expiration Date is required."
        );
      }

      const result = await database.query(
        `
        INSERT INTO revoked_access_tokens (
          jti,
          user_id,
          expires_at
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (jti) DO NOTHING
        `,
        [
          jti,
          normalizedUserId,
          expiresAt
        ]
      );

      return result.rowCount === 1;
    },

    async isTokenRevoked(jti) {
      validateJti(jti);

      const result = await database.query(
        `
        SELECT EXISTS (
          SELECT 1
          FROM revoked_access_tokens
          WHERE jti = $1
            AND expires_at > NOW()
        ) AS revoked
        `,
        [jti]
      );

      return result.rows[0]?.revoked === true;
    }
  };
}
