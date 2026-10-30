function failure(
    code,
    message,
    retryable = false,
    invalidateSession = false
) {
    return {
        code,
        message,
        retryable,
        invalidateSession
    };
}

export function classifyMediaAccessStatus(status) {
    switch (status) {
        case 401:
            return failure(
                "AUTHENTICATION_REQUIRED",
                "Please log in to play this track.",
                false,
                true
            );

        case 403:
            return failure(
                "ACCESS_DENIED",
                "You do not have access to play this track."
            );

        case 404:
            return failure(
                "MEDIA_UNAVAILABLE",
                "Unable to prepare playback."
            );

        case 503:
            return failure(
                "SERVICE_UNAVAILABLE",
                "Playback authentication is temporarily unavailable.",
                true
            );

        case 502:
        case 504:
            return failure(
                "TEMPORARY_SERVER_FAILURE",
                "Playback service is temporarily unavailable.",
                true
            );

        default:
            return failure(
                "MEDIA_ACCESS_FAILED",
                "Unable to prepare playback."
            );
    }
}

export function classifyMediaAccessRequestError(error) {
    if (error?.name === "AbortError") {
        return failure(
            "REQUEST_CANCELLED",
            "",
            false
        );
    }

    // Never expose raw exception messages to the user.
    return failure(
        "NETWORK_FAILURE",
        "Unable to prepare playback.",
        true
    );
}

export function canRetryPlayback(
    failureState,
    isLoading = false
) {
    return (
        failureState?.retryable === true &&
        !isLoading
    );
}
