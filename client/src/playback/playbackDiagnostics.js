const DEFINITIONS = Object.freeze({
    AUTHENTICATION_REQUIRED: [
        "authentication_denial",
        "expected_denial"
    ],

    ACCESS_DENIED: [
        "authorization_denial",
        "expected_denial"
    ],

    MEDIA_UNAVAILABLE: [
        "unavailable_media",
        "media_failure"
    ],

    SERVICE_UNAVAILABLE: [
        "authentication_service_outage",
        "service_fault"
    ],

    TEMPORARY_SERVER_FAILURE: [
        "temporary_server_outage",
        "service_fault"
    ],

    NETWORK_FAILURE: [
        "network_interruption",
        "service_fault"
    ],

    MEDIA_ACCESS_FAILED: [
        "media_access_failure",
        "undetermined"
    ],

    TRACK_METADATA_FAILED: [
        "metadata_failure",
        "media_failure"
    ],

    STALE_OPERATION_DROPPED: [
        "stale_operation",
        "safety_event"
    ],

    REPEATED_ACCESS_DENIAL: [
        "repeated_denial_burst",
        "potential_security_event"
    ]
});

const CAPACITY = 25;

// Team-approved Sprint 4 anomaly policy.
const DENIAL_THRESHOLD = 3;
const DENIAL_WINDOW_MS = 60_000;

const DENIAL_CODES = new Set([
    "AUTHENTICATION_REQUIRED",
    "ACCESS_DENIED"
]);

let records = [];
let sequence = 0;

let denialTimes = [];
let burstReported = false;

function appendRecord(code, now, emit) {
    const definition = DEFINITIONS[code];

    const record = Object.freeze({
        sequence: ++sequence,
        observedAt: new Date(now).toISOString(),
        code,
        category: definition[0],
        preliminaryDisposition: definition[1],
        reviewStatus: "not_reviewed"
    });

    records = [
        ...records.slice(-(CAPACITY - 1)),
        record
    ];

    emit(
        "[Soundwave] playback diagnostic",
        { ...record }
    );

    return { ...record };
}

export function recordPlaybackDiagnostic(
    code,
    {
        now = Date.now(),
        emit = console.info
    } = {}
) {
    // Unknown codes cannot enter the diagnostic history.
    // The derived burst marker cannot be submitted directly.
    if (
        !DEFINITIONS[code] ||
        code === "REPEATED_ACCESS_DENIAL"
    ) {
        return null;
    }

    const record = appendRecord(code, now, emit);

    if (DENIAL_CODES.has(code)) {
        // Retain only denial times inside the rolling window.
        denialTimes = denialTimes.filter(
            (time) =>
                time >= now - DENIAL_WINDOW_MS &&
                time <= now
        );

        // Only the three most recent timestamps are needed.
        denialTimes = [
            ...denialTimes,
            now
        ].slice(-DENIAL_THRESHOLD);

        if (denialTimes.length < DENIAL_THRESHOLD) {
            burstReported = false;
        } else if (!burstReported) {
            // Emit one marker for this continuous burst.
            appendRecord(
                "REPEATED_ACCESS_DENIAL",
                now,
                emit
            );

            burstReported = true;
        }
    }

    return record;
}

export function getPlaybackDiagnostics() {
    return records.map((record) => ({
        ...record
    }));
}

export function clearPlaybackDiagnostics() {
    records = [];
    sequence = 0;

    denialTimes = [];
    burstReported = false;
}
