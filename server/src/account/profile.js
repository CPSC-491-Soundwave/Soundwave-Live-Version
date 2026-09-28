import {
  authenticateRequest,
  write401Response
} from "../auth/auth.js";

export async function handleAccountProfile(
  req,
  res,
  {
    tokenService,
    findProfileByUserId
  } = {}
) {
  if (typeof findProfileByUserId !== "function") {
    throw new TypeError(
      "Account profile handler requires findProfileByUserId."
    );
  }

  const principal =
    authenticateRequest(
      req,
      tokenService
    );

  if (!principal) {
    write401Response(res);
    return;
  }

  const profile =
    await findProfileByUserId(
      principal.userId
    );

  if (!profile) {
    res.writeHead(404, {
      "Content-Type":
        "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });

    res.end(
      JSON.stringify({
        error: "profile_not_found"
      })
    );

    return;
  }

  if (
    String(profile.user_id) !==
    principal.userId
  ) {
    throw new Error(
      "Account profile repository returned a mismatched user."
    );
  }

  const responseBody = {
    user: {
      id: String(profile.user_id),
      username: profile.username,
      role: profile.role
    },

    preferences: {
      audioQualityPreference:
        profile.audio_quality_preference ?? null
    }
  };

  res.writeHead(200, {
    "Content-Type":
      "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(
    JSON.stringify(responseBody)
  );
}
