import * as webrtcModule from 'react-native-webrtc';
import type { VoiceSignal } from '../../protocol/messageTypes';
import { VoiceManager, type VoiceManagerHandlers } from '../voiceManager';

interface WebrtcTesting {
  createTestStream(): {
    track: { stopped: boolean; enabled: boolean };
    released: boolean;
    getAudioTracks(): Array<{ stopped: boolean; enabled: boolean }>;
    release(): void;
  };
  getPeerConnections(): Array<{
    remoteDescription: { type: string; sdp: string } | null;
    addedTracks: unknown[];
    addedCandidates: unknown[];
    closed: boolean;
  }>;
  reset(): void;
  setGetUserMedia(impl: () => Promise<unknown>): void;
}

const webrtc = webrtcModule as unknown as {
  __testing: WebrtcTesting;
};

function createHandlers() {
  const signals: Array<{ targetId: string; signal: VoiceSignal }> = [];
  const handlers: VoiceManagerHandlers = {
    sendSignal: (targetId, signal) => signals.push({ targetId, signal }),
  };
  return { signals, handlers };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise<void>(resolve => {
    setTimeout(() => resolve(), 0);
  });
}

beforeEach(() => {
  webrtc.__testing.reset();
  webrtc.__testing.setGetUserMedia(() =>
    Promise.resolve(webrtc.__testing.createTestStream()),
  );
});

describe('VoiceManager', () => {
  it('opens the microphone without creating peers before the roster is synced', async () => {
    const { signals, handlers } = createHandlers();
    const manager = new VoiceManager(handlers);

    await expect(manager.start('a-self')).resolves.toBe(true);
    expect(webrtc.__testing.getPeerConnections()).toHaveLength(0);

    manager.syncPeers(['a-self', 'b-peer']);
    await flushMicrotasks();

    expect(webrtc.__testing.getPeerConnections()).toHaveLength(1);
    expect(signals).toEqual([
      { targetId: 'b-peer', signal: { kind: 'offer', sdp: 'v=0' } },
    ]);

    manager.stop();
  });

  it('queues an offer that arrives before the mic is ready, then answers it', async () => {
    const mic = deferred<unknown>();
    webrtc.__testing.setGetUserMedia(() => mic.promise);
    const { signals, handlers } = createHandlers();
    const manager = new VoiceManager(handlers);

    // This offer races the permission prompt: there is not even a local ID yet.
    await manager.handleSignal('b-peer', { kind: 'offer', sdp: 'remote-sdp' });
    const start = manager.start('a-self');

    expect(signals).toEqual([]);

    const stream = webrtc.__testing.createTestStream();
    mic.resolve(stream);
    await expect(start).resolves.toBe(true);

    expect(signals).toContainEqual({
      targetId: 'b-peer',
      signal: { kind: 'answer', sdp: 'v=0' },
    });
    const [peer] = webrtc.__testing.getPeerConnections();
    expect(peer.remoteDescription).toMatchObject({
      type: 'offer',
      sdp: 'remote-sdp',
    });

    manager.stop();
    expect(stream.track.stopped).toBe(true);
    expect(stream.released).toBe(true);
  });

  it('holds early ICE candidates until the remote offer arrives', async () => {
    const mic = deferred<unknown>();
    webrtc.__testing.setGetUserMedia(() => mic.promise);
    const { signals, handlers } = createHandlers();
    const manager = new VoiceManager(handlers);

    await manager.handleSignal('b-peer', {
      kind: 'ice-candidate',
      candidate: 'candidate:1 1 udp 1 192.168.1.2 50000 typ host',
      sdpMid: '0',
      sdpMLineIndex: 0,
    });
    await manager.handleSignal('b-peer', { kind: 'offer', sdp: 'remote-sdp' });

    const start = manager.start('a-self');
    mic.resolve(webrtc.__testing.createTestStream());
    await expect(start).resolves.toBe(true);

    const [peer] = webrtc.__testing.getPeerConnections();
    expect(peer.addedCandidates).toHaveLength(1);
    expect(signals).toContainEqual({
      targetId: 'b-peer',
      signal: { kind: 'answer', sdp: 'v=0' },
    });

    manager.stop();
  });

  it('does not offer when the other participant wins the pair tie-break', async () => {
    const { signals, handlers } = createHandlers();
    const manager = new VoiceManager(handlers);

    await manager.start('b-self');
    manager.syncPeers(['a-peer', 'b-self']);
    await flushMicrotasks();

    expect(webrtc.__testing.getPeerConnections()).toHaveLength(1);
    expect(signals).toEqual([]);

    manager.stop();
  });
});
