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

export function createAccountProfileRepository(database) {
  if (
    !database ||
    typeof database.query !== "function"
  ) {
    throw new TypeError(
      "Account profile repository requires a database with query()."
    );
  }

  return {
    async findProfileByUserId(userId) {
      const result = await database.query(
        FIND_PROFILE_BY_USER_ID_SQL,
        [userId]
      );

      return result.rows[0] ?? null;
    }
  };
}
