/**
 * Wire protocol constants shared by host and clients.
 *
 * Bump PROTOCOL_VERSION for any breaking envelope change. The host rejects
 * joins from clients with a different version instead of guessing.
 */
export const PROTOCOL_VERSION = 1;

/** Room capacity includes the host. */
export const DEFAULT_ROOM_CAPACITY = 16;

/**
 * Voice mesh cap. Increased to 16 to support 12+ riders talking concurrently.
 */
export const DEFAULT_VOICE_CAPACITY = 16;

export const PIN_LENGTH = 6;
export const MAX_DISPLAY_NAME_LENGTH = 32;
export const MAX_ROOM_NAME_LENGTH = 64;

/** Hard cap for one NDJSON line, including the newline. */
export const MAX_FRAME_BYTES = 64 * 1024;

/** SDP offers/answers are larger than chat-sized payloads but still bounded. */
export const MAX_SDP_LENGTH = 24 * 1024;
export const MAX_ICE_CANDIDATE_LENGTH = 1024;

export const LOCATION_MIN_INTERVAL_MS = 3_000;
export const LOCATION_STALE_AFTER_MS = 15_000;
export const LOCATION_MAX_AGE_MS = 60_000;
export const LOCATION_MIN_MOVEMENT_METERS = 5;

export const HEARTBEAT_INTERVAL_MS = 10_000;
export const CONNECTION_TIMEOUT_MS = 30_000;

export const VOICE_SIGNAL_WINDOW_MS = 10_000;
export const VOICE_SIGNAL_MAX_PER_WINDOW = 300;
export const LOCATION_UPDATES_MAX_PER_WINDOW = 6;
export const JOIN_ATTEMPTS_WINDOW_MS = 60_000;
export const JOIN_ATTEMPTS_MAX = 5;
