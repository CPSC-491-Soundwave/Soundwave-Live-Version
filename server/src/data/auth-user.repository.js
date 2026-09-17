export function createAuthUserRepository(database) {
  if (
    !database ||
    typeof database.query !== "function"
  ) {
    throw new TypeError(
      "Auth user repository requires a database with query()."
    );
  }

  return {
    async findUserByUsername(username) {
      if (typeof username !== "string") {
        return null;
      }

      const normalizedUsername = username.trim();

      if (normalizedUsername.length === 0) {
        return null;
      }

      const result = await database.query(
        `
        SELECT
          id,
          username,
          password_hash,
          role
        FROM users
        WHERE username = $1
        LIMIT 1
        `,
        [normalizedUsername]
      );

      return result.rows[0] ?? null;
    }
  };
}