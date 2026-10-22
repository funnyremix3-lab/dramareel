import { AppException } from '../errors/app-exception';
import { CursorQuery, decodeCursor, encodeCursor, offsetPage } from './cursor';

describe('cursor', () => {
  it('round-trips', () => {
    expect(decodeCursor(encodeCursor({ n: 12 }), { n: 'number' })).toEqual({ n: 12 });
  });

  it('returns null for a missing cursor', () => {
    expect(decodeCursor(undefined, { n: 'number' })).toBeNull();
  });

  it.each(['not-base64!!', encodeCursor({ n: 'x' }), encodeCursor({ n: -1 }), encodeCursor({}), Buffer.from('7').toString('base64url')])(
    'rejects tampered cursor %s',
    (bad) => {
      expect(() => decodeCursor(bad, { n: 'number' })).toThrow(AppException);
    },
  );
});

describe('offsetPage', () => {
  const data = Array.from({ length: 5 }, (_, i) => i);
  const fetch = async (skip: number, take: number) => data.slice(skip, skip + take);
  const q = (limit: number, cursor?: string) => Object.assign(new CursorQuery(), { limit, cursor });

  it('pages through all items exactly once', async () => {
    const first = await offsetPage(q(2), fetch);
    const second = await offsetPage(q(2, first.nextCursor!), fetch);
    const third = await offsetPage(q(2, second.nextCursor!), fetch);
    expect([...first.items, ...second.items, ...third.items]).toEqual(data);
    expect(third.nextCursor).toBeNull();
  });

  it('has no next cursor when the page is exactly full', async () => {
    expect((await offsetPage(q(5), fetch)).nextCursor).toBeNull();
  });
});
