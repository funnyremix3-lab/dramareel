import { api, ApiError, buildUrl, configureApiClient } from '@/lib/api/client';

const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, statusText: 'x', json: async () => body }) as unknown as Response;

describe('buildUrl', () => {
  it('drops empty params and encodes values', () => {
    expect(buildUrl('https://api.test/api/v1', '/dramas/search', { q: 'मेरा बॉस', cursor: undefined, limit: 20 })).toBe(
      'https://api.test/api/v1/dramas/search?q=%E0%A4%AE%E0%A5%87%E0%A4%B0%E0%A4%BE%20%E0%A4%AC%E0%A5%89%E0%A4%B8&limit=20',
    );
  });
});

describe('api()', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    configureApiClient({ token: async () => 'tok', locale: () => 'hi', unauthorized: jest.fn() });
  });

  it('sends auth, language and platform headers', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await api('/me');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok', 'Accept-Language': 'hi', 'x-platform': 'ios' });
  });

  it('omits the token for public calls', async () => {
    fetchMock.mockResolvedValue(json(200, []));
    await api('/categories', { auth: false });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('maps the error envelope to ApiError with code and details', async () => {
    fetchMock.mockResolvedValue(json(403, { error: { code: 'EPISODE_LOCKED', message: 'locked', details: { unlockOptions: { coins: 30 } }, requestId: 'r1' } }));
    const err = (await api('/episodes/x/playback').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 403, code: 'EPISODE_LOCKED', requestId: 'r1', details: { unlockOptions: { coins: 30 } } });
  });

  it('reports network failures as NETWORK', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const err = (await api('/home').catch((e) => e)) as ApiError;
    expect(err.code).toBe('NETWORK');
    expect(err.isNetwork).toBe(true);
  });

  it('signals 401s so the app can sign out', async () => {
    const unauthorized = jest.fn();
    configureApiClient({ unauthorized });
    fetchMock.mockResolvedValue(json(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } }));
    await api('/me').catch(() => undefined);
    expect(unauthorized).toHaveBeenCalled();
  });

  it('returns undefined for 204', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 } as Response);
    await expect(api('/ads/serve')).resolves.toBeUndefined();
  });
});
