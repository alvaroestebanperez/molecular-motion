// @vitest-environment happy-dom
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import { MOLECULAR_VOCABULARY, renderVocabularyGlyph } from '../src';

afterEach(() => { document.documentElement.removeAttribute('data-theme'); document.body.replaceChildren(); });

describe.each(['light', 'dark'] as const)('visual-language accessibility (%s)', theme => {
  it('has no automatically detectable axe violations', async () => {
    document.documentElement.lang = 'en';
    document.title = 'Molecular Motion Visual Language';
    document.documentElement.dataset.theme = theme;
    document.body.innerHTML = `<main><h1>Molecular Motion Visual Language</h1>${MOLECULAR_VOCABULARY.map(entry =>
      `<section><h2>${entry.label}</h2>${renderVocabularyGlyph(entry, { idPrefix: `${theme}-${entry.id}` })}</section>`
    ).join('')}</main>`;
    const result = await axe.run(document, {
      rules: {
        'color-contrast': { enabled: false },
        'landmark-unique': { enabled: false },
      },
    });
    expect(result.violations.map(violation => violation.id)).toEqual([]);
  });
});
