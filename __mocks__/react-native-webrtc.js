/**
 * Test-time stand-in for react-native-webrtc.
 *
 * The real module builds a native event emitter at import time, which Jest
 * cannot load. Tests must not open a microphone; `getUserMedia` rejects so an
 * accidental call fails loudly instead of pretending audio works.
 */
class FakePeerConnection {
  localDescription = null;
  remoteDescription = null;
  signalingState = 'stable';
  connectionState = 'new';
  iceConnectionState = 'new';
  onicecandidate = null;
  onconnectionstatechange = null;

  addTrack() {
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
    this.signalingState = 'have-local-offer';
    return Promise.resolve();
  }

  setRemoteDescription(description) {
    this.remoteDescription = description;
    this.signalingState = 'stable';
    return Promise.resolve();
  }

  addIceCandidate() {
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
    getUserMedia: () =>
      Promise.reject(new Error('react-native-webrtc is unavailable in Jest')),
  },
};
