import { decodeSigningKey, isServableMediaPath, signPlaybackToken, verifyPlaybackToken } from './playback-token';

const key = decodeSigningKey(Buffer.alloc(32, 7).toString('base64'));
const asset = '3cbce07b-af4b-498c-a492-1d6d77e16072';
const now = 1_800_000_000;

describe('playback tokens', () => {
  it('verifies a token for its own asset before expiry', async () => {
    const token = await signPlaybackToken(key, { a: asset, e: now + 60, u: 'abc' });
    await expect(verifyPlaybackToken(key, token, asset, now)).resolves.toEqual({ a: asset, e: now + 60, u: 'abc' });
  });

  it('rejects expired tokens (including exactly at expiry)', async () => {
    const token = await signPlaybackToken(key, { a: asset, e: now, u: 'abc' });
    await expect(verifyPlaybackToken(key, token, asset, now)).resolves.toBeNull();
  });

  it('rejects a token used for a different asset', async () => {
    const token = await signPlaybackToken(key, { a: asset, e: now + 60, u: 'abc' });
    await expect(verifyPlaybackToken(key, token, '00000000-0000-0000-0000-000000000000', now)).resolves.toBeNull();
  });

  it('rejects a token signed with another key', async () => {
    const other = decodeSigningKey(Buffer.alloc(32, 8).toString('base64'));
    const token = await signPlaybackToken(other, { a: asset, e: now + 60, u: 'abc' });
    await expect(verifyPlaybackToken(key, token, asset, now)).resolves.toBeNull();
  });

  it('rejects a payload edited to extend expiry', async () => {
    const token = await signPlaybackToken(key, { a: asset, e: now + 60, u: 'abc' });
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ a: asset, e: now + 999_999, u: 'abc' })).toString('base64url');
    await expect(verifyPlaybackToken(key, `${forged}.${sig}`, asset, now)).resolves.toBeNull();
  });

  it.each(['', 'abc', 'a.b.c', '.x', 'x.', '%%%.%%%', 'a'.repeat(600)])('rejects malformed token %p', async (bad) => {
    await expect(verifyPlaybackToken(key, bad, asset, now)).resolves.toBeNull();
  });
});

describe('isServableMediaPath', () => {
  it.each(['master.m3u8', '720p/index.m3u8', '720p/seg_000.ts', 'thumb.jpg', 'subs/hi.vtt'])('allows %s', (p) => {
    expect(isServableMediaPath(p)).toBe(true);
  });

  it.each(['../originals/source.mp4', '/etc/passwd', '720p/../../x.ts', 'source.mov', 'a b.ts', '720p//seg.ts', 'x.m3u8?y', ''])(
    'blocks %s',
    (p) => {
      expect(isServableMediaPath(p)).toBe(false);
    },
  );
});
