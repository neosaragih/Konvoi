import type { ClientMessage, ServerMessage } from './messageTypes';

/** Serialize one protocol message as a single NDJSON line. */
export function encodeNdjson(message: ClientMessage | ServerMessage): string {
  return `${JSON.stringify(message)}\n`;
}
