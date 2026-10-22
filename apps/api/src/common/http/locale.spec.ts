import { localized, parseLocale } from './locale';

describe('parseLocale', () => {
  it.each([
    [undefined, 'en'],
    ['hi-IN,hi;q=0.9,en;q=0.8', 'hi'],
    ['en-US,en;q=0.9', 'en'],
    ['fr-FR, hi;q=0.5', 'hi'],
    ['de', 'en'],
  ])('%s → %s', (header, expected) => {
    expect(parseLocale(header)).toBe(expected);
  });
});

describe('localized', () => {
  it('picks the locale and falls back to English', () => {
    expect(localized({ en: 'Romance', hi: 'रोमांस' }, 'hi')).toBe('रोमांस');
    expect(localized({ en: 'Romance' }, 'hi')).toBe('Romance');
    expect(localized(null, 'en')).toBe('');
  });
});
