/* eslint-disable no-bitwise -- UTF-8 decoding is inherently bitwise */
import { MAX_FRAME_BYTES } from '../protocol/protocolVersion';

export type FramingErrorCode =
  | 'INVALID_JSON'
  | 'OVERSIZED_FRAME'
  | 'INVALID_UTF8';

export type FrameEvent =
  | { type: 'message'; value: unknown; byteLength: number }
  | { type: 'error'; code: FramingErrorCode; byteLength: number };

const NEWLINE = 0x0a;
const CARRIAGE_RETURN = 0x0d;

/**
 * Incremental UTF-8 NDJSON framer.
 *
 * TCP is a byte stream: one `data` event can contain half a line, several
 * lines, or a split multi-byte character. Buffer bytes per connection and only
 * decode complete lines. On oversized lines, drop through the next newline so
 * the stream can resynchronize instead of growing without bound.
 */
export class NdjsonFramer {
  private line: number[] = [];
  private discarding = false;

  constructor(private readonly maxFrameBytes: number = MAX_FRAME_BYTES) {
    if (!Number.isInteger(maxFrameBytes) || maxFrameBytes <= 0) {
      throw new Error('maxFrameBytes must be a positive integer');
    }
  }

  get pendingBytes(): number {
    return this.line.length;
  }

  push(chunk: Uint8Array): FrameEvent[] {
    const events: FrameEvent[] = [];
    let start = 0;

    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] === NEWLINE) {
        this.finishLine(chunk.subarray(start, i), events);
        start = i + 1;
      }
    }

    if (start < chunk.length) {
      this.appendPartial(chunk.subarray(start), events);
    }

    return events;
  }

  reset(): void {
    this.line = [];
    this.discarding = false;
  }

  private finishLine(segment: Uint8Array, events: FrameEvent[]): void {
    if (this.discarding) {
      this.discarding = false;
      this.line = [];
      return;
    }

    let end = segment.length;
    if (end > 0 && segment[end - 1] === CARRIAGE_RETURN) {
      end--;
    }

    const total = this.line.length + end;
    if (total > this.maxFrameBytes) {
      this.line = [];
      events.push({
        type: 'error',
        code: 'OVERSIZED_FRAME',
        byteLength: total,
      });
      return;
    }

    for (let i = 0; i < end; i++) {
      this.line.push(segment[i]);
    }

    if (this.line.length === 0) {
      return;
    }

    const bytes = this.line;
    this.line = [];
    const text = decodeUtf8(bytes);
    if (text === null) {
      events.push({
        type: 'error',
        code: 'INVALID_UTF8',
        byteLength: bytes.length,
      });
      return;
    }

    try {
      events.push({
        type: 'message',
        value: JSON.parse(text) as unknown,
        byteLength: bytes.length,
      });
    } catch {
      events.push({
        type: 'error',
        code: 'INVALID_JSON',
        byteLength: bytes.length,
      });
    }
  }

  private appendPartial(segment: Uint8Array, events: FrameEvent[]): void {
    if (this.discarding) {
      return;
    }

    const total = this.line.length + segment.length;
    if (total > this.maxFrameBytes) {
      this.line = [];
      this.discarding = true;
      events.push({
        type: 'error',
        code: 'OVERSIZED_FRAME',
        byteLength: total,
      });
      return;
    }

    for (let i = 0; i < segment.length; i++) {
      this.line.push(segment[i]);
    }
  }
}

/**
 * Minimal strict UTF-8 decoder. Avoids depending on TextDecoder, which is not
 * guaranteed in every React Native/Hermes configuration.
 */
function decodeUtf8(bytes: readonly number[]): string | null {
  let out = '';
  let i = 0;

  while (i < bytes.length) {
    const b0 = bytes[i];

    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i += 1;
      continue;
    }

    let codePoint: number;
    let extra: number;

    if ((b0 & 0xe0) === 0xc0) {
      codePoint = b0 & 0x1f;
      extra = 1;
    } else if ((b0 & 0xf0) === 0xe0) {
      codePoint = b0 & 0x0f;
      extra = 2;
    } else if ((b0 & 0xf8) === 0xf0) {
      codePoint = b0 & 0x07;
      extra = 3;
    } else {
      return null;
    }

    if (i + extra >= bytes.length) {
      return null;
    }

    for (let j = 1; j <= extra; j++) {
      const b = bytes[i + j];
      if ((b & 0xc0) !== 0x80) {
        return null;
      }
      codePoint = (codePoint << 6) | (b & 0x3f);
    }

    if (
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      (extra === 1 && codePoint < 0x80) ||
      (extra === 2 && codePoint < 0x800) ||
      (extra === 3 && codePoint < 0x10000)
    ) {
      return null;
    }

    out += String.fromCodePoint(codePoint);
    i += extra + 1;
  }

  return out;
}
