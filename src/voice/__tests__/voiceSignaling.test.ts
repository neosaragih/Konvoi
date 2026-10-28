import { planVoicePeers, shouldInitiateOffer } from '../voiceSignaling';

describe('shouldInitiateOffer', () => {
  it('is deterministic and asymmetric', () => {
    expect(shouldInitiateOffer('a', 'b')).toBe(true);
    expect(shouldInitiateOffer('b', 'a')).toBe(false);
    expect(shouldInitiateOffer('a', 'a')).toBe(false);
  });
});

describe('planVoicePeers', () => {
  it('connects to new peers and offers only when this device wins the tie-break', () => {
    const plan = planVoicePeers('p2', [], ['host', 'p2', 'p3']);

    expect(plan.connect).toEqual(['host', 'p3']);
    expect(plan.disconnect).toEqual([]);
    expect(plan.offerTo).toEqual(['p3']);
  });

  it('does not offer to existing peers or to peers that offer to us', () => {
    const plan = planVoicePeers('p3', ['host', 'p2'], ['host', 'p2', 'p3']);

    expect(plan.connect).toEqual([]);
    expect(plan.offerTo).toEqual([]);
  });

  it('closes peers that left the voice roster', () => {
    const plan = planVoicePeers('p2', ['host', 'p3', 'p4'], ['host', 'p2']);

    expect(plan.connect).toEqual([]);
    expect(plan.disconnect).toEqual(['p3', 'p4']);
  });

  it('ignores self and duplicate roster entries for connections', () => {
    const plan = planVoicePeers('p2', [], ['p2', 'p3']);

    expect(plan.connect).toEqual(['p3']);
    expect(plan.offerTo).toEqual(['p3']);
  });
});
