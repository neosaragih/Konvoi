import {
  mediaDevices,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  type MediaStream,
  type MediaStreamTrack,
} from 'react-native-webrtc';
import type { VoiceSignal } from '../protocol/messageTypes';
import { planVoicePeers, shouldInitiateOffer } from './voiceSignaling';

export type VoicePeerState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

export interface VoiceManagerHandlers {
  /** Send a validated signaling payload to one participant via the host. */
  sendSignal: (targetId: string, signal: VoiceSignal) => void;
  onError?: (message: string) => void;
  onPeerState?: (peerId: string, state: VoicePeerState) => void;
  /** The mic track ended outside the app's control (permission revoked). */
  onEnded?: () => void;
}

interface Peer {
  pc: RTCPeerConnection;
  /** The polite peer rolls back on offer collision instead of ignoring. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingRemoteAnswerPending: boolean;
  remoteDescriptionSet: boolean;
  pendingCandidates: RTCIceCandidate[];
  reportedFailure: boolean;
}

/**
 * Audio-only WebRTC mesh.
 *
 * This is the only file allowed to import `react-native-webrtc`. The host
 * relays signaling over the TCP room; media is peer-to-peer with
 * `iceServers: []` (no STUN/TURN, no internet).
 */
export class VoiceManager {
  private stream: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private readonly peers = new Map<string, Peer>();
  private roster: string[] = [];
  private localId: string | null = null;
  private started = false;
  private disposed = false;
  private muted = false;

  constructor(private readonly handlers: VoiceManagerHandlers) {}

  get isActive(): boolean {
    return this.started;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /**
   * Open the microphone and connect to the current voice roster.
   *
   * Resolves false when `stop()` was called while the permission prompt or
   * `getUserMedia` was still pending; the caller must not join the voice
   * roster in that case.
   */
  async start(
    localId: string,
    voiceParticipantIds: readonly string[],
  ): Promise<boolean> {
    if (this.started) {
      return true;
    }
    if (this.disposed) {
      return false;
    }
    this.localId = localId;

    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    if (this.disposed) {
      stream.release();
      return false;
    }

    const track = stream.getAudioTracks()[0];
    if (!track) {
      stream.release();
      throw new Error('no audio track');
    }

    this.stream = stream;
    this.track = track;
    this.started = true;
    this.muted = false;
    track.enabled = true;
    track.onended = () => {
      this.handlers.onError?.(
        'Mikrofon berhenti. Periksa izin mikrofon, lalu mulai suara lagi.',
      );
      this.stop();
      this.handlers.onEnded?.();
    };

    this.syncPeers(voiceParticipantIds);
    return true;
  }

  /** Add and remove peers as the host's voice roster changes. */
  syncPeers(voiceParticipantIds: readonly string[]): void {
    if (!this.started || !this.localId) {
      return;
    }
    const next = voiceParticipantIds.filter(id => id !== this.localId);
    const plan = planVoicePeers(this.localId, this.roster, next);
    this.roster = next;

    for (const peerId of plan.disconnect) {
      this.closePeer(peerId);
    }
    for (const peerId of plan.connect) {
      const peer = this.createPeer(peerId);
      this.peers.set(peerId, peer);
      if (shouldInitiateOffer(this.localId, peerId)) {
        this.makeOffer(peerId, peer);
      }
    }
  }

  async handleSignal(fromId: string, signal: VoiceSignal): Promise<void> {
    if (!this.started || !this.localId || fromId === this.localId) {
      return;
    }

    let peer = this.peers.get(fromId);
    if (!peer) {
      // The roster update and the first offer can arrive in either order.
      peer = this.createPeer(fromId);
      this.peers.set(fromId, peer);
      if (!this.roster.includes(fromId)) {
        this.roster = [...this.roster, fromId];
      }
    }

    try {
      if (signal.kind === 'ice-candidate') {
        const candidate = new RTCIceCandidate({
          candidate: signal.candidate,
          sdpMid: signal.sdpMid,
          sdpMLineIndex: signal.sdpMLineIndex,
        });
        if (!peer.remoteDescriptionSet) {
          peer.pendingCandidates.push(candidate);
          return;
        }
        await peer.pc.addIceCandidate(candidate);
        return;
      }

      if (signal.kind === 'offer') {
        const readyForOffer =
          !peer.makingOffer &&
          (peer.pc.signalingState === 'stable' ||
            peer.settingRemoteAnswerPending);
        const offerCollision = !readyForOffer;
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) {
          return;
        }
        if (offerCollision) {
          await peer.pc.setLocalDescription({
            type: 'rollback',
            sdp: '',
          });
        }

        await peer.pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }),
        );
        peer.remoteDescriptionSet = true;
        await this.flushCandidates(peer);

        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.handlers.sendSignal(fromId, {
          kind: 'answer',
          sdp: String(answer.sdp),
        });
        return;
      }

      peer.settingRemoteAnswerPending = true;
      try {
        await peer.pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }),
        );
        peer.remoteDescriptionSet = true;
        await this.flushCandidates(peer);
      } finally {
        peer.settingRemoteAnswerPending = false;
      }
    } catch {
      if (this.disposed) {
        return;
      }
      this.handlers.onError?.(
        'Sinyal suara gagal diproses. Coba keluar lalu mulai suara lagi.',
      );
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.track) {
      this.track.enabled = !muted;
    }
  }

  /** Stop the mic and close every peer connection. Idempotent. */
  stop(): void {
    this.disposed = true;
    this.started = false;

    for (const peerId of Array.from(this.peers.keys())) {
      this.closePeer(peerId);
    }
    this.roster = [];

    if (this.track) {
      this.track.onended = null;
      try {
        this.track.stop();
      } catch {
        // The native track may already be gone.
      }
    }
    if (this.stream) {
      try {
        this.stream.release();
      } catch {
        // Already released.
      }
    }

    this.track = null;
    this.stream = null;
    this.localId = null;
    this.muted = false;
  }

  private createPeer(peerId: string): Peer {
    const pc = new RTCPeerConnection({ iceServers: [] });
    const peer: Peer = {
      pc,
      polite: !shouldInitiateOffer(this.localId as string, peerId),
      makingOffer: false,
      ignoreOffer: false,
      settingRemoteAnswerPending: false,
      remoteDescriptionSet: false,
      pendingCandidates: [],
      reportedFailure: false,
    };

    pc.onicecandidate = event => {
      // The library's typings model this as a generic Event even though the
      // runtime event carries an RTCIceCandidate (or null when gathering ends).
      const { candidate } = event as unknown as {
        candidate?: RTCIceCandidate | null;
      };
      if (!candidate) {
        return;
      }
      this.handlers.sendSignal(peerId, {
        kind: 'ice-candidate',
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid ?? null,
        sdpMLineIndex: candidate.sdpMLineIndex ?? null,
      });
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState as VoicePeerState;
      this.handlers.onPeerState?.(peerId, state);
      if (state === 'failed' && !peer.reportedFailure) {
        peer.reportedFailure = true;
        this.handlers.onError?.(
          'Koneksi suara gagal. Pastikan Wi-Fi tidak memakai client isolation, lalu coba lagi.',
        );
      }
    };

    pc.ontrack = event => {
      const anyEvent = event as unknown as { track?: { enabled: boolean } };
      if (anyEvent?.track) {
        anyEvent.track.enabled = true;
      }
    };

    if (this.track && this.stream) {
      pc.addTrack(this.track, this.stream);
    }

    return peer;
  }

  private async makeOffer(peerId: string, peer: Peer): Promise<void> {
    try {
      peer.makingOffer = true;
      const offer = await peer.pc.createOffer({ offerToReceiveAudio: true });
      if (this.peers.get(peerId) !== peer) {
        return;
      }
      await peer.pc.setLocalDescription(offer);
      this.handlers.sendSignal(peerId, {
        kind: 'offer',
        sdp: String(offer.sdp),
      });
    } catch {
      if (!this.disposed) {
        this.handlers.onError?.(
          'Gagal memulai koneksi suara ke peserta lain. Coba lagi.',
        );
      }
    } finally {
      peer.makingOffer = false;
    }
  }

  private async flushCandidates(peer: Peer): Promise<void> {
    const candidates = peer.pendingCandidates;
    peer.pendingCandidates = [];
    for (const candidate of candidates) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch {
        // A candidate can be invalid after a rollback; the next one may work.
      }
    }
  }

  private closePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return;
    }
    this.peers.delete(peerId);
    peer.pc.onicecandidate = null;
    peer.pc.onconnectionstatechange = null;
    try {
      peer.pc.close();
    } catch {
      // Already closed.
    }
    this.handlers.onPeerState?.(peerId, 'closed');
  }
}
