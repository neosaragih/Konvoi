/**
 * Test-time stand-in for react-native-webrtc.
 *
 * The real module builds a native event emitter at import time, which Jest
 * cannot load. Tests must not open a microphone by default; `getUserMedia`
 * rejects so an accidental call fails loudly instead of pretending audio
 * works. Voice-manager tests opt in through `__testing`.
 */
const peerConnections = [];

function defaultGetUserMedia() {
  return Promise.reject(
    new Error('react-native-webrtc is unavailable in Jest'),
  );
}

let getUserMediaImpl = defaultGetUserMedia;

class FakeMediaStreamTrack {
  constructor() {
    this.enabled = true;
    this.stopped = false;
    this.onended = null;
  }

  stop() {
    this.stopped = true;
  }
}

function createTestStream() {
  const track = new FakeMediaStreamTrack();
  return {
    track,
    released: false,
    getAudioTracks() {
      return [track];
    },
    release() {
      this.released = true;
    },
  };
}

class FakePeerConnection {
  constructor() {
    this.localDescription = null;
    this.remoteDescription = null;
    this.signalingState = 'stable';
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this.onicecandidate = null;
    this.onconnectionstatechange = null;
    this.ontrack = null;
    this.addedTracks = [];
    this.addedCandidates = [];
    this.listeners = new Map();
    peerConnections.push(this);
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      handlers.filter(candidate => candidate !== handler),
    );
  }

  emit(type) {
    for (const handler of this.listeners.get(type) ?? []) {
      handler();
    }
  }

  addTrack(track, stream) {
    this.addedTracks.push({ track, stream });
    return {};
  }

  createOffer() {
    return Promise.resolve({ type: 'offer', sdp: 'v=0' });
  }

  createAnswer() {
    return Promise.resolve({ type: 'answer', sdp: 'v=0' });
  }

  setLocalDescription(description) {
    this.localDescription = description;
    this.signalingState =
      description.type === 'offer' ? 'have-local-offer' : 'stable';
    return Promise.resolve();
  }

  setRemoteDescription(description) {
    this.remoteDescription = description;
    this.signalingState =
      description.type === 'offer' ? 'have-remote-offer' : 'stable';
    return Promise.resolve();
  }

  addIceCandidate(candidate) {
    this.addedCandidates.push(candidate);
    return Promise.resolve();
  }

  close() {
    this.connectionState = 'closed';
  }
}

module.exports = {
  __esModule: true,
  RTCPeerConnection: FakePeerConnection,
  RTCSessionDescription: class {
    constructor(info) {
      Object.assign(this, info);
    }
  },
  RTCIceCandidate: class {
    constructor(info) {
      Object.assign(this, info);
    }
  },
  mediaDevices: {
    getUserMedia: (...args) => getUserMediaImpl(...args),
  },
  __testing: {
    createTestStream,
    getPeerConnections: () => peerConnections,
    reset() {
      peerConnections.length = 0;
      getUserMediaImpl = defaultGetUserMedia;
    },
    setGetUserMedia(impl) {
      getUserMediaImpl = impl;
    },
  },
};
