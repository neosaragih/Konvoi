/**
 * Deterministic mesh negotiation rules.
 *
 * For each pair of voice participants, the participant with the
 * lexicographically smaller ID creates the initial offer; the other answers.
 * That removes offer glare without a server-side coordinator. Renegotiation
 * uses the WebRTC perfect-negotiation pattern in the peer manager.
 */
export function shouldInitiateOffer(selfId: string, peerId: string): boolean {
  return selfId < peerId;
}

export interface VoicePeerPlan {
  /** Peers that need a new RTCPeerConnection. */
  connect: string[];
  /** Peers whose connection should be closed. */
  disconnect: string[];
  /** Newly connected peers this device should send an offer to. */
  offerTo: string[];
}

/**
 * Diff two voice rosters (participant IDs, excluding self is allowed but not
 * required) and decide which peers to connect, close, and offer to.
 */
export function planVoicePeers(
  selfId: string,
  previous: readonly string[],
  next: readonly string[],
): VoicePeerPlan {
  const previousIds = new Set(previous.filter(id => id !== selfId));
  const nextIds = next.filter(id => id !== selfId);
  const nextSet = new Set(nextIds);

  const connect = nextIds.filter(id => !previousIds.has(id));
  const disconnect = Array.from(previousIds).filter(id => !nextSet.has(id));
  const offerTo = connect.filter(id => shouldInitiateOffer(selfId, id));

  return { connect, disconnect, offerTo };
}
