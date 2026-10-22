import { checkComment, normalizeComment } from './comment-text';

describe('normalizeComment', () => {
  it('strips invisible and bidi-override characters and collapses whitespace', () => {
    expect(normalizeComment('  so​good‮   episode \u0007 ')).toBe('sogood episode');
  });

  it('keeps Hindi text and single blank lines', () => {
    expect(normalizeComment('बहुत बढ़िया\n\n\n\nअगला एपिसोड?')).toBe('बहुत बढ़िया\n\nअगला एपिसोड?');
  });
});

describe('checkComment', () => {
  it('accepts normal comments', () => {
    expect(checkComment('Arjun is the best! ❤️')).toBeNull();
    expect(checkComment('मीरा को सच बता देना चाहिए')).toBeNull();
  });

  it('rejects links', () => {
    expect(checkComment('watch free at https://spam.example')).toBe('LINK');
    expect(checkComment('go to www.spam.example')).toBe('LINK');
  });

  it('rejects listed abuse in English, Hinglish and Hindi', () => {
    expect(checkComment('you BITCH')).toBe('PROFANITY');
    expect(checkComment('tu chutiya hai')).toBe('PROFANITY');
    expect(checkComment('चूतिया')).toBe('PROFANITY');
  });

  it('rejects empty text', () => {
    expect(checkComment('')).toBe('EMPTY');
  });
});
