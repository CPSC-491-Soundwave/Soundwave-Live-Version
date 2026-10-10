
export const LIST_USER_FAVORITES_SQL = `
  SELECT
    t.id AS track_id,
    t.title AS track_title,
    t.duration_ms,
    a.id AS album_id,
    a.title AS album_title,
    ar.id AS artist_id,
    ar.name AS artist_name,
    f.created_at AS favorited_at
  FROM favorites AS f
  JOIN tracks AS t ON t.id = f.track_id
  JOIN albums AS a ON a.id = t.album_id
  JOIN artists AS ar ON ar.id = a.artist_id
  WHERE f.user_id = $1
  ORDER BY f.created_at DESC, t.id ASC
`;

function normalizePrincipalId(principalId) {
  if (
    typeof principalId === "number" &&
    !Number.isSafeInteger(principalId)
  ) {
    throw new TypeError("Invalid principal ID");
  }

  if (
    typeof principalId !== "string" &&
    typeof principalId !== "number"
  ) {
    throw new TypeError("Invalid principal ID");
  }

  const id = String(principalId);

  if (
    !/^[0-9]+$/.test(id) ||
    BigInt(id) <= 0n ||
    BigInt(id) > 9223372036854775807n
  ) {
    throw new TypeError("Invalid principal ID");
  }

  return String(BigInt(id));
}

export function createFavoritesRepository(database) {
  if (!database || typeof database.query !== "function") {
    throw new TypeError(
      "Favorites repository requires database.query()"
    );
  }

  return {
    async listForPrincipal(principalId) {
      const userId = normalizePrincipalId(principalId);

      const result = await database.query(
        LIST_USER_FAVORITES_SQL,
        [userId]
      );

      return result.rows;
    }
  };
}
