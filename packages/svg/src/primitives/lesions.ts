import { round } from './shared';

export type VisualLesion = 'damaged-base' | 'ap-site' | 'mismatch' | 'nick' | 'ssb' | 'dsb' | 'crosslink' | 'adduct';

export function renderLesionPrimitive(lesion: VisualLesion | undefined, at: { x: number; y: number }, width = 220): string {
  if (!lesion || lesion === 'nick' || lesion === 'ssb' || lesion === 'dsb') return '';
  const x = round(at.x); const y = round(at.y);
  switch (lesion) {
    case 'damaged-base': return `<g class="mm-lesion mm-lesion--damaged-base"><path d="M${x - 7} ${y - 8}l14 16m0-16-14 16"/></g>`;
    case 'ap-site': return `<circle class="mm-lesion mm-lesion--ap-site" cx="${x}" cy="${y}" r="7"/>`;
    case 'mismatch': return `<g class="mm-lesion mm-lesion--mismatch"><circle cx="${x - 5}" cy="${y - 7}" r="4"/><circle cx="${x + 7}" cy="${y + 7}" r="4"/></g>`;
    case 'crosslink': return `<path class="mm-lesion mm-lesion--crosslink" d="M${x - 11} ${y - 18}Q${x} ${y} ${x + 11} ${y + 18}M${x + 11} ${y - 18}Q${x} ${y} ${x - 11} ${y + 18}"/>`;
    case 'adduct': return `<g class="mm-lesion mm-lesion--adduct"><circle cx="${x}" cy="${y - 4}" r="6"/><circle cx="${x + 9}" cy="${y - 13}" r="5"/><circle cx="${x - 8}" cy="${y - 15}" r="4"/></g>`;
    default: return `<path class="mm-lesion" d="M${x - width * .03} ${y}h${width * .06}"/>`;
  }
}

/** DNA lesions. */
export const lesionCss = `.mm-lesion{stroke:#e5484d;stroke-width:3;fill:none}.mm-lesion--ap-site{fill:#fff}.mm-lesion--mismatch circle,.mm-lesion--adduct circle{fill:#e5484d;stroke:#fff;stroke-width:1}.mm-lesion--crosslink{stroke-width:4}`;
