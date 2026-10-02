import { proteinCss } from './proteins';
import { modificationCss } from './modifications';
import { moleculeCss } from './molecules';
import { nucleicCss } from './nucleic-acids';
import { lesionCss } from './lesions';
import { membraneCss } from './membranes';
import { compartmentCss } from './compartments';
import { transmembraneCss } from './transmembrane';
import { interactionCss } from './interactions';
import { actionCss } from './actions';
import { unitChainCss } from './unit-chains';

/** Shared keyframes and the reduced-motion guard. Primitive-specific keyframes may also live in their own constant. */
export const motionCss = `@keyframes mm-primitive-breathe{50%{transform:scale(1.05);opacity:.23}}@keyframes mm-nucleic-grow{0%,12%{stroke-dashoffset:var(--mm-grow-from)}70%,100%{stroke-dashoffset:var(--mm-grow-to)}}@keyframes mm-nucleic-reveal{0%,68%{opacity:0}74%,100%{opacity:1}}@keyframes mm-nucleic-follow{0%,12%{transform:translateX(var(--mm-follow-from))}70%,100%{transform:none}}@media(prefers-reduced-motion:reduce){.mm-primitive *,.mm-action *,.mm-nucleic__follow{animation:none!important;transition:none!important}}`;

export const primitiveCss = `
${proteinCss}
${modificationCss}
${moleculeCss}
${nucleicCss}
${lesionCss}
${membraneCss}${compartmentCss}
${transmembraneCss}
${interactionCss}${actionCss}
${unitChainCss}
${motionCss}
`;
