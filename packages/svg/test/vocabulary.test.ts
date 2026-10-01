import { describe, expect, it } from 'vitest';
import {
  MOLECULAR_VOCABULARY,
  VOCABULARY_CATEGORY_LABELS,
  renderVocabularyGlyph,
  type VocabularyCategory,
} from '../src';

describe('visual vocabulary', () => {
  it('has unique ids and covers every public category', () => {
    const ids = MOLECULAR_VOCABULARY.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const category of Object.keys(VOCABULARY_CATEGORY_LABELS) as VocabularyCategory[]) {
      expect(MOLECULAR_VOCABULARY.some(item => item.category === category)).toBe(true);
    }
  });

  it.each(MOLECULAR_VOCABULARY.map(item => [item.id, item] as const))('renders %s as an accessible, deterministic SVG', (_id, item) => {
    const first = renderVocabularyGlyph(item, { idPrefix: `test-${item.id}` });
    const second = renderVocabularyGlyph(item.id, { idPrefix: `test-${item.id}` });
    expect(first).toBe(second);
    expect(first).toContain('<svg class="mm-vocab__svg"');
    expect(first).toContain('role="img"');
    expect(first).toContain(`<title id="test-${item.id}-title">${item.label.replace('&', '&amp;')}</title>`);
    expect(first).not.toContain('undefined');
  });

  it('supports decorative output when the surrounding card supplies the accessible name', () => {
    const svg = renderVocabularyGlyph('kinase', { decorative: true });
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).not.toContain('<title');
    expect(svg).not.toContain('<desc');
  });

  it('rejects unknown built-in identifiers', () => {
    expect(() => renderVocabularyGlyph('not-a-molecule')).toThrow('Unknown molecular vocabulary item');
  });
});
