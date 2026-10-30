import {
    describe,
    expect,
    it
} from "vitest";

import {
    canRetryPlayback,
    classifyMediaAccessRequestError,
    classifyMediaAccessStatus
} from "./streamFailure.js";

describe("SCRUM-288 protected-playback failure policy", () => {

    it("treats 401 as session-invalidating and non-retryable", () => {
        expect(
            classifyMediaAccessStatus(401)
        ).toMatchObject({
            code: "AUTHENTICATION_REQUIRED",
            retryable: false,
            invalidateSession: true
        });
    });

    it("treats 403 as non-retryable without invalidating the session", () => {
        expect(
            classifyMediaAccessStatus(403)
        ).toMatchObject({
            code: "ACCESS_DENIED",
            retryable: false,
            invalidateSession: false
        });
    });

    it("does not retry unavailable media", () => {
        expect(
            classifyMediaAccessStatus(404)
        ).toMatchObject({
            code: "MEDIA_UNAVAILABLE",
            retryable: false
        });
    });

    it.each([502, 503, 504])(
        "permits manual retry for transient HTTP %i",
        (status) => {
            const result =
                classifyMediaAccessStatus(status);

            expect(result.retryable).toBe(true);

            expect(result.invalidateSession).toBe(false);
        }
    );

    it("does not automatically classify HTTP 500 as retryable", () => {
        expect(
            classifyMediaAccessStatus(500).retryable
        ).toBe(false);
    });

    it("permits retry after a network failure without exposing errors", () => {
        const result =
            classifyMediaAccessRequestError(
                new TypeError("secret-token-in-exception")
            );

        expect(result.code).toBe("NETWORK_FAILURE");

        expect(result.retryable).toBe(true);

        expect(result.message).not.toContain(
            "secret-token-in-exception"
        );
    });

    it("does not retry intentionally cancelled requests", () => {
        expect(
            classifyMediaAccessRequestError({
                name: "AbortError"
            })
        ).toMatchObject({
            code: "REQUEST_CANCELLED",
            retryable: false
        });
    });

    it("does not allow another retry while a request is loading", () => {
        const result =
            classifyMediaAccessStatus(503);

        expect(
            canRetryPlayback(result, true)
        ).toBe(false);

        expect(
            canRetryPlayback(result, false)
        ).toBe(true);

        expect(
            canRetryPlayback(
                classifyMediaAccessStatus(401)
            )
        ).toBe(false);
    });

});
