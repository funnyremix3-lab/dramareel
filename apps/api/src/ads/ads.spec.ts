import { generateKeyPairSync, KeyObject, sign } from 'node:crypto';
import { loadEnv } from '../config/env';
import { AdmobSsvVerifier, SsvKeySource } from './admob-ssv.verifier';
import { campaignIsLive, spentPaise, targetingMatches } from './ads.service';
import { adUnitMatches } from './rewards.service';
import { serveIdOf, signServeToken, verifyServeToken } from './serve-token';

describe('AdmobSsvVerifier', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const keys: SsvKeySource = { getKey: async (id) => (id === '3335741209' ? (publicKey as KeyObject) : undefined) };
  const verifier = new AdmobSsvVerifier(keys, loadEnv({ DATABASE_URL: 'x' }));

  /** Builds a callback query exactly as AdMob does: signature over everything before &signature=. */
  function callback(overrides: Record<string, string> = {}, keyId = '3335741209', signer = privateKey) {
    const params = new URLSearchParams({
      ad_network: '5450213213286189855',
      ad_unit: '5224354917',
      custom_data: 'a'.repeat(32),
      reward_amount: '1',
      reward_item: 'Reward',
      timestamp: String(Date.now()),
      transaction_id: '123456789',
      user_id: 'user-1',
      ...overrides,
    });
    const content = params.toString();
    const signature = sign('sha256', Buffer.from(content), signer).toString('base64url');
    return `${content}&signature=${signature}&key_id=${keyId}`;
  }

  it('accepts a correctly signed callback and parses it', async () => {
    const result = await verifier.verify(callback());
    expect(result).toMatchObject({ ok: true, params: { adUnit: '5224354917', userId: 'user-1', transactionId: '123456789' } });
  });

  it('rejects a callback whose parameters were altered after signing', async () => {
    const tampered = callback().replace('user_id=user-1', 'user_id=attacker');
    expect(await verifier.verify(tampered)).toEqual({ ok: false, reason: 'bad signature' });
  });

  it('rejects a signature from a different key', async () => {
    const other = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
    expect((await verifier.verify(callback({}, '3335741209', other))).ok).toBe(false);
  });

  it('rejects unknown key ids and missing signatures', async () => {
    expect((await verifier.verify(callback({}, '999'))).ok).toBe(false);
    expect((await verifier.verify('ad_unit=1&user_id=x')).ok).toBe(false);
  });

  it('rejects stale callbacks', async () => {
    const old = callback({ timestamp: String(Date.now() - 7 * 3600 * 1000) });
    expect(await verifier.verify(old)).toEqual({ ok: false, reason: 'stale or missing timestamp' });
  });
});

describe('adUnitMatches', () => {
  it('matches the full id or the numeric suffix AdMob reports', () => {
    expect(adUnitMatches('ca-app-pub-3940256099942544/5224354917', '5224354917')).toBe(true);
    expect(adUnitMatches('ca-app-pub-3940256099942544/5224354917', 'ca-app-pub-3940256099942544/5224354917')).toBe(true);
    expect(adUnitMatches('ca-app-pub-3940256099942544/5224354917', '1033173712')).toBe(false);
    expect(adUnitMatches('ca-app-pub-3940256099942544/5224354917', '')).toBe(false);
  });
});

describe('serve tokens', () => {
  const key = Buffer.alloc(32, 3);
  const now = 1_800_000_000;
  const claims = { c: 'camp', k: 'creative', p: 'place', u: null, f: 'ANDROID' as const, t: now, n: 'abc' };

  it('round-trips and yields a 64-char dedupe id', () => {
    const token = signServeToken(key, claims);
    expect(verifyServeToken(key, token, now + 10)).toEqual(claims);
    expect(serveIdOf(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects forged, expired and future tokens', () => {
    const token = signServeToken(key, claims);
    expect(verifyServeToken(Buffer.alloc(32, 4), token, now)).toBeNull();
    expect(verifyServeToken(key, token, now + 3601)).toBeNull();
    expect(verifyServeToken(key, signServeToken(key, { ...claims, t: now + 3600 }), now)).toBeNull();
    const [, sig] = token.split('.');
    const edited = Buffer.from(JSON.stringify({ ...claims, c: 'other' })).toString('base64url');
    expect(verifyServeToken(key, `${edited}.${sig}`, now)).toBeNull();
  });
});

describe('campaign rules', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  const window = { startAt: new Date('2026-10-01'), endAt: new Date('2026-11-01') };

  it('is live only when active/scheduled and inside its window', () => {
    expect(campaignIsLive({ status: 'ACTIVE', ...window }, now)).toBe(true);
    expect(campaignIsLive({ status: 'SCHEDULED', ...window }, now)).toBe(true);
    expect(campaignIsLive({ status: 'PAUSED', ...window }, now)).toBe(false);
    expect(campaignIsLive({ status: 'ACTIVE', startAt: new Date('2026-10-23'), endAt: window.endAt }, now)).toBe(false);
    expect(campaignIsLive({ status: 'ACTIVE', startAt: window.startAt, endAt: now }, now)).toBe(false);
  });

  it('applies language and platform targeting', () => {
    expect(targetingMatches({}, { locale: 'hi', platform: 'ANDROID' })).toBe(true);
    expect(targetingMatches({ languages: ['hi'] }, { locale: 'en', platform: 'ANDROID' })).toBe(false);
    expect(targetingMatches({ platforms: ['IOS'] }, { locale: 'hi', platform: 'ANDROID' })).toBe(false);
    expect(targetingMatches({ languages: ['hi', 'en'], platforms: ['ANDROID'] }, { locale: 'en', platform: 'ANDROID' })).toBe(true);
  });

  it('computes spend by pricing model', () => {
    expect(spentPaise({ pricingModel: 'CPM', ratePaise: 15000n }, 2500, 0)).toBe(37500n);
    expect(spentPaise({ pricingModel: 'CPC', ratePaise: 200n }, 0, 7)).toBe(1400n);
    expect(spentPaise({ pricingModel: 'FLAT', ratePaise: 999n }, 1e6, 1e4)).toBe(0n);
  });
});
