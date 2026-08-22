import { describe, expect, it } from 'vitest';
import { PRECISION_SHOTS, buildPayload } from '../scanProtocol';

describe('buildPayload', () => {
  it('requires a front shot', () => {
    expect(buildPayload('precision', {})).toBeNull();
  });

  it('packs tilt shots as extraFrames and keeps straight-on as front/back', () => {
    const captured = {
      front: { spec: PRECISION_SHOTS[0], image: 'front.jpg', preview: 'front.jpg' },
      'front-left': { spec: PRECISION_SHOTS[1], image: 'fl.jpg', preview: 'fl.jpg' },
      'front-right': { spec: PRECISION_SHOTS[2], image: 'fr.jpg', preview: 'fr.jpg' },
      back: { spec: PRECISION_SHOTS[3], image: 'back.jpg', preview: 'back.jpg' },
    };
    const payload = buildPayload('precision', captured);
    expect(payload).not.toBeNull();
    expect(payload?.mode).toBe('precision');
    expect(payload?.front).toBe('front.jpg');
    expect(payload?.back).toBe('back.jpg');
    expect(payload?.extraFrames).toEqual([
      { role: 'front-left', image: 'fl.jpg' },
      { role: 'front-right', image: 'fr.jpg' },
    ]);
  });
});
