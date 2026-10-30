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
    ]
});

// Limits the amount of diagnostic data retained in memory.
// This is NOT an anomaly-detection threshold.
const CAPACITY = 25;

let records = [];
let sequence = 0;

export function recordPlaybackDiagnostic(
    code,
    {
        now = Date.now(),
        emit = console.info
    } = {}
) {
    const definition = DEFINITIONS[code];

    // Reject unknown classifications rather than
    // storing arbitrary exception or request content.
    if (!definition) {
        return null;
    }

    const record = Object.freeze({
        sequence: ++sequence,
        observedAt: new Date(now).toISOString(),
        code,
        category: definition[0],
        preliminaryDisposition: definition[1],
        reviewStatus: "not_reviewed"
    });

    // Retain only the most recent 25 records.
    records = [
        ...records.slice(-(CAPACITY - 1)),
        record
    ];

    // Emit only the sanitized, allowlisted fields.
    emit(
        "[Soundwave] playback diagnostic",
        { ...record }
    );

    return { ...record };
}

export function getPlaybackDiagnostics() {
    return records.map((record) => ({
        ...record
    }));
}

export function clearPlaybackDiagnostics() {
    records = [];
    sequence = 0;
}
