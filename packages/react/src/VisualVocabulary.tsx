import { useId, useMemo } from 'react';
import {
  MOLECULAR_VOCABULARY,
  VOCABULARY_CATEGORY_LABELS,
  renderVocabularyGlyph,
  type VocabularyCategory,
  type VocabularyItem,
} from '@molecular-motion/svg';
import { useMolecularMotionStyles } from './MechanismStage';

export interface MolecularGlyphProps {
  item: VocabularyItem | string;
  className?: string;
  decorative?: boolean;
  /** Presentation state for animated editors and mechanism UIs. */
  state?: 'idle' | 'active' | 'inactive';
}

/** A standalone visual-vocabulary glyph suitable for legends, editors and mechanism UIs. */
export function MolecularGlyph({ item, className = '', decorative = false, state = 'idle' }: MolecularGlyphProps) {
  useMolecularMotionStyles();
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const markup = useMemo(
    () => renderVocabularyGlyph(item, { idPrefix: `mmvg${reactId}`, decorative }),
    [item, reactId, decorative],
  );
  return <span className={`mm-vocabulary-glyph ${className}`.trim()} data-state={state} dangerouslySetInnerHTML={{ __html: markup }} />;
}

export interface VocabularyCardProps {
  item: VocabularyItem;
}

export function VocabularyCard({ item }: VocabularyCardProps) {
  return <article className="mm-vocabulary-card" data-vocabulary-id={item.id}>
    <header>
      <h3>{item.label}</h3>
      <p>{item.description}</p>
    </header>
    <MolecularGlyph item={item} decorative />
  </article>;
}

export interface VisualVocabularyProps {
  items?: readonly VocabularyItem[];
  categories?: readonly VocabularyCategory[];
  className?: string;
}

/** Responsive, themeable gallery of the built-in visual language. */
export function VisualVocabulary({ items = MOLECULAR_VOCABULARY, categories, className = '' }: VisualVocabularyProps) {
  useMolecularMotionStyles();
  const selected = categories ? new Set(categories) : null;
  const groups = (Object.keys(VOCABULARY_CATEGORY_LABELS) as VocabularyCategory[])
    .filter(category => !selected || selected.has(category))
    .map(category => ({ category, items: items.filter(item => item.category === category) }))
    .filter(group => group.items.length > 0);

  return <div className={`mm-vocabulary ${className}`.trim()}>
    {groups.map(({ category, items: entries }) => <section className={`mm-vocabulary-section mm-vocabulary-section--${category}`} key={category}>
      <h2>{VOCABULARY_CATEGORY_LABELS[category]}</h2>
      <div className="mm-vocabulary-grid">
        {entries.map(entry => <VocabularyCard item={entry} key={entry.id} />)}
      </div>
    </section>)}
  </div>;
}
