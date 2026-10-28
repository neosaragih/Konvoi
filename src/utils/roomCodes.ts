/**
 * Room ID and PIN generation.
 *
 * Uses the platform CSPRNG when available and falls back to Math.random.
 * The PIN is a convenience gate, not strong authentication; see docs/SPEC.md.
 */
const ROOM_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const ROOM_CODE_LENGTH = 8;
const PIN_LENGTH = 6;

export type ByteSource = (length: number) => number[];

function defaultByteSource(length: number): number[] {
  const cryptoApi = (
    globalThis as {
      crypto?: {
        getRandomValues?: (array: Uint8Array) => Uint8Array;
      };
    }
  ).crypto;

  if (cryptoApi?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes);
  }

  return Array.from({ length }, () => Math.floor(Math.random() * 256));
}

export function generateRoomId(bytes: ByteSource = defaultByteSource): string {
  const values = bytes(ROOM_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_ALPHABET[(values[i] ?? 0) % ROOM_ALPHABET.length];
  }
  return `room-${code}`;
}

export function generatePin(bytes: ByteSource = defaultByteSource): string {
  const values = bytes(PIN_LENGTH);
  let pin = '';
  for (let i = 0; i < PIN_LENGTH; i++) {
    pin += String((values[i] ?? 0) % 10);
  }
  return pin;
}
