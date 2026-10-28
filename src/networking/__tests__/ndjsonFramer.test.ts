import { utf8 } from '../../test-support/utf8';
import { NdjsonFramer } from '../ndjsonFramer';

describe('NdjsonFramer', () => {
  it('parses one complete line', () => {
    const framer = new NdjsonFramer();
    const events = framer.push(utf8('{"type":"PING"}\n'));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'message',
      value: { type: 'PING' },
    });
  });

  it('parses several lines from one chunk', () => {
    const framer = new NdjsonFramer();
    const events = framer.push(utf8('{"a":1}\n{"b":2}\n{"c":3}\n'));

    expect(events.map(event => event.type)).toEqual([
      'message',
      'message',
      'message',
    ]);
    expect(
      events.map(event => (event.type === 'message' ? event.value : null)),
    ).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it('buffers a line split across chunks', () => {
    const framer = new NdjsonFramer();

    expect(framer.push(utf8('{"type":"PI'))).toEqual([]);
    expect(framer.pendingBytes).toBe(11);

    const events = framer.push(utf8('NG"}\n'));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'message',
      value: { type: 'PING' },
    });
    expect(framer.pendingBytes).toBe(0);
  });

  it('keeps multi-byte characters intact when a chunk splits them', () => {
    const framer = new NdjsonFramer();
    const bytes = utf8('{"name":"Rafi 👋"}\n');
    const emojiStart = bytes.indexOf(0xf0);

    expect(emojiStart).toBeGreaterThan(0);
    expect(framer.push(bytes.subarray(0, emojiStart + 2))).toEqual([]);

    const events = framer.push(bytes.subarray(emojiStart + 2));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'message',
      value: { name: 'Rafi 👋' },
    });
  });

  it('accepts CRLF line endings', () => {
    const framer = new NdjsonFramer();
    const events = framer.push(utf8('{"a":1}\r\n'));

    expect(events[0]).toMatchObject({ type: 'message', value: { a: 1 } });
  });

  it('ignores empty lines', () => {
    const framer = new NdjsonFramer();
    const events = framer.push(utf8('\n\r\n{"a":1}\n'));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'message', value: { a: 1 } });
  });

  it('reports invalid JSON and keeps parsing the next line', () => {
    const framer = new NdjsonFramer();
    const events = framer.push(utf8('{"a":}\n{"b":2}\n'));

    expect(events[0]).toMatchObject({ type: 'error', code: 'INVALID_JSON' });
    expect(events[1]).toMatchObject({ type: 'message', value: { b: 2 } });
  });

  it('rejects invalid UTF-8 without throwing', () => {
    const framer = new NdjsonFramer();
    const events = framer.push(new Uint8Array([0x7b, 0xff, 0x7d, 0x0a]));

    expect(events[0]).toMatchObject({ type: 'error', code: 'INVALID_UTF8' });
  });

  it('reports an oversized frame once and resynchronizes at the next line', () => {
    const framer = new NdjsonFramer(12);

    const first = framer.push(utf8('1234567890123'));
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      type: 'error',
      code: 'OVERSIZED_FRAME',
    });

    const second = framer.push(utf8('discard-me\n{"ok":true}\n'));
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ type: 'message', value: { ok: true } });
  });

  it('does not report oversize again while discarding a long line', () => {
    const framer = new NdjsonFramer(8);

    expect(framer.push(utf8('123456789'))).toHaveLength(1);
    expect(framer.push(utf8('67890'))).toHaveLength(0);
    expect(framer.push(utf8('\n{"a":1}\n'))).toHaveLength(1);
  });

  it('reset clears a partial frame', () => {
    const framer = new NdjsonFramer();
    framer.push(utf8('{"partial":'));
    expect(framer.pendingBytes).toBeGreaterThan(0);

    framer.reset();
    expect(framer.pendingBytes).toBe(0);
    expect(framer.push(utf8('{"a":1}\n'))).toHaveLength(1);
  });

  it('rejects a non-positive frame limit', () => {
    expect(() => new NdjsonFramer(0)).toThrow();
    expect(() => new NdjsonFramer(-1)).toThrow();
  });
});
