const FIND_PROFILE_BY_USER_ID_SQL = `
  SELECT
    u.id AS user_id,
    u.username,
    u.role,
    up.audio_quality_preference
  FROM users u
  LEFT JOIN user_preferences up
    ON up.user_id = u.id
  WHERE u.id = $1
`;

export class UsernameConflictError extends Error {
  constructor() {
    super("Username is unavailable.");
    this.name = "UsernameConflictError";
  }
}

export function createAccountProfileRepository(database) {
  if (!database || typeof database.query !== "function") {
    throw new TypeError(
      "Account profile repository requires a database with query()."
    );
  }

  return {
    async findProfileByUserId(userId) {
      const result = await database.query(FIND_PROFILE_BY_USER_ID_SQL, [userId]);
      return result.rows[0] ?? null;
    },

    async updateProfileByUserId(userId, updates) {
      if (typeof database.connect !== "function") {
        throw new TypeError("Account profile updates require database.connect().");
      }
      if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
        throw new TypeError("Account profile updates must be an object.");
      }

      const client = await database.connect();
      let inTransaction = false;
      try {
        await client.query("BEGIN");
        inTransaction = true;

        // Serialize updates to the same account and verify it still exists.
        const account = await client.query(
          "SELECT id FROM users WHERE id = $1 FOR UPDATE",
          [userId]
        );
        if (account.rows.length === 0) {
          await client.query("ROLLBACK");
          inTransaction = false;
          return null;
        }

        if (Object.hasOwn(updates, "username")) {
          await client.query(
            "UPDATE users SET username = $1 WHERE id = $2",
            [updates.username, userId]
          );
        }
        if (Object.hasOwn(updates, "audioQualityPreference")) {
          await client.query(
            `INSERT INTO user_preferences (user_id, audio_quality_preference)
             VALUES ($1, $2)
             ON CONFLICT (user_id) DO UPDATE
             SET audio_quality_preference = EXCLUDED.audio_quality_preference`,
            [userId, updates.audioQualityPreference]
          );
        }

        const result = await client.query(FIND_PROFILE_BY_USER_ID_SQL, [userId]);
        if (!result.rows[0] || String(result.rows[0].user_id) !== String(userId)) {
          throw new Error("Account profile update returned an invalid result.");
        }
        await client.query("COMMIT");
        inTransaction = false;
        return result.rows[0];
      } catch (error) {
        if (inTransaction) {
          // Never mask a failed rollback with a successful-looking update.
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            throw new AggregateError(
              [error, rollbackError],
              "Account profile transaction and rollback failed."
            );
          }
        }
        if (error.code === "23505" && error.constraint === "users_username_unique") {
          throw new UsernameConflictError();
        }
        throw error;
      } finally {
        client.release();
      }
    }
  };
}
