import en from '@/lib/i18n/en.json';
import hi from '@/lib/i18n/hi.json';

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'string' ? { ...acc, [key]: v } : { ...acc, ...flatten(v, key) };
  }, {});
}

const placeholders = (s: string) => (s.match(/{{\s*\w+\s*}}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort();

describe('translations', () => {
  const enFlat = flatten(en as Tree);
  const hiFlat = flatten(hi as Tree);

  it('Hindi and English have exactly the same keys', () => {
    expect(Object.keys(hiFlat).sort()).toEqual(Object.keys(enFlat).sort());
  });

  it('every translation keeps the same {{placeholders}}', () => {
    for (const key of Object.keys(enFlat)) {
      expect({ key, p: placeholders(hiFlat[key]) }).toEqual({ key, p: placeholders(enFlat[key]) });
    }
  });

  it('has no empty strings', () => {
    for (const [key, value] of Object.entries({ ...enFlat, ...hiFlat })) {
      expect({ key, empty: value.trim() === '' }).toEqual({ key, empty: false });
    }
  });
});
