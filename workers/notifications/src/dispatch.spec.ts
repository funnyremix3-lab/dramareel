import { audienceWhere, localise } from './dispatch';
import { classifyFcmError } from './fcm';

describe('audienceWhere', () => {
  it('always limits to active users with push enabled', () => {
    const w = audienceWhere({ all: true });
    expect(w.user).toMatchObject({ status: 'ACTIVE', deletionRequestedAt: null, profile: { pushEnabled: true } });
    expect((w.user as { id?: unknown }).id).toBeUndefined();
  });

  it('targets explicit users or languages', () => {
    expect(audienceWhere({ userIds: ['a', 'b'] }).user).toMatchObject({ id: { in: ['a', 'b'] } });
    expect(audienceWhere({ languages: ['hi'] }).user).toMatchObject({ locale: { in: ['hi'] } });
  });

  it('sends to nobody when the audience is malformed', () => {
    expect(audienceWhere({}).user).toMatchObject({ id: { in: [] } });
  });
});

describe('localise', () => {
  it('uses the user language with English fallback', () => {
    expect(localise({ en: 'New episode', hi: 'नया एपिसोड' }, 'hi')).toBe('नया एपिसोड');
    expect(localise({ en: 'New episode' }, 'hi')).toBe('New episode');
    expect(localise(null, 'en')).toBe('');
  });
});

describe('classifyFcmError', () => {
  it.each([
    [404, 'UNREGISTERED', 'invalid'],
    [400, 'INVALID_ARGUMENT', 'invalid'],
    [429, 'QUOTA_EXCEEDED', 'retry'],
    [503, 'UNAVAILABLE', 'retry'],
    [403, 'SENDER_ID_MISMATCH', 'failed'],
  ])('%i %s → %s', (status, code, expected) => {
    expect(classifyFcmError(status, code)).toBe(expected);
  });
});
