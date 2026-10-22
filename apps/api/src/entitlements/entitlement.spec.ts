import { evaluateAccess, EntitlementInput, unlockPrice } from './entitlement';

const now = new Date('2026-10-22T12:00:00Z');
const base: EntitlementInput = {
  episode: { number: 8, access: 'PREMIUM' },
  drama: { freeEpisodeCount: 5 },
  hasActiveSubscription: false,
  unlock: null,
  now,
};

describe('evaluateAccess', () => {
  it('allows FREE episodes for everyone', () => {
    expect(evaluateAccess({ ...base, episode: { number: 30, access: 'FREE' } })).toEqual({ allowed: true, reason: 'FREE' });
  });

  it('allows premium episodes inside the free preview window', () => {
    expect(evaluateAccess({ ...base, episode: { number: 5, access: 'PREMIUM' } }).reason).toBe('FREE_PREVIEW');
  });

  it('locks the first premium episode after the preview window', () => {
    expect(evaluateAccess({ ...base, episode: { number: 6, access: 'PREMIUM' } })).toEqual({ allowed: false, reason: 'LOCKED' });
  });

  it('allows subscribers', () => {
    expect(evaluateAccess({ ...base, hasActiveSubscription: true }).reason).toBe('SUBSCRIPTION');
  });

  it('allows permanent unlocks', () => {
    expect(evaluateAccess({ ...base, unlock: { expiresAt: null } }).reason).toBe('UNLOCKED');
  });

  it('allows unexpired time-limited unlocks and rejects expired ones', () => {
    expect(evaluateAccess({ ...base, unlock: { expiresAt: new Date(now.getTime() + 1000) } }).allowed).toBe(true);
    expect(evaluateAccess({ ...base, unlock: { expiresAt: new Date(now.getTime() - 1000) } }).allowed).toBe(false);
    expect(evaluateAccess({ ...base, unlock: { expiresAt: now } }).allowed).toBe(false);
  });

  it('treats freeEpisodeCount 0 as no preview', () => {
    expect(evaluateAccess({ ...base, drama: { freeEpisodeCount: 0 }, episode: { number: 1, access: 'PREMIUM' } }).allowed).toBe(false);
  });
});

describe('unlockPrice', () => {
  it('uses the episode override when present', () => {
    expect(unlockPrice({ unlockCoins: 45 }, { defaultUnlockCoins: 30 })).toBe(45);
  });
  it('falls back to the drama default', () => {
    expect(unlockPrice({ unlockCoins: null }, { defaultUnlockCoins: 30 })).toBe(30);
  });
  it('respects an explicit zero override', () => {
    expect(unlockPrice({ unlockCoins: 0 }, { defaultUnlockCoins: 30 })).toBe(0);
  });
});
