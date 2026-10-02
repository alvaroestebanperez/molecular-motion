import { molecularMotionCss, renderSvg, THEME_TOKENS, type RenderOptions } from './render';
import type { SvgScene } from './scene';

export interface ExportOptions extends Pick<RenderOptions, 'idPrefix' | 'compact'> {
  /** Colours to resolve; the file never depends on the viewer's theme or OS preference. Default `light`. */
  theme?: keyof typeof THEME_TOKENS;
  /** Fill behind the figure: `true` (default) uses the theme canvas colour, a string is any CSS colour, `false` is transparent. */
  background?: boolean | string;
  /** Pixel size relative to the viewBox (sets `width`/`height`). Default 1. */
  scale?: number;
}

/** XML text escaping for the embedded stylesheet: valid for every SVG consumer, unlike CDATA in some. */
const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const escapeAttribute = (value: string) => value.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]!));

/** Approximate advance of callout text (13 px Inter): enough to keep it inside the file, never to place it. */
const TEXT_ADVANCE = 7.4;

/**
 * The viewBox grown to contain every callout. The viewer lets labels overflow the canvas (`overflow:
 * visible`); a file is clipped to its viewBox, so the box only ever grows, keeping the figure's scale.
 */
function calloutBox(markup: string): [number, number, number, number] {
  const [x, y, width, height] = markup.match(/viewBox="([^"]+)"/)![1]!.split(' ').map(Number) as [number, number, number, number];
  let [x0, y0, x1, y1] = [x, y, x + width, y + height];
  const grow = (left: number, top: number, right: number, bottom: number) => { x0 = Math.min(x0, left); y0 = Math.min(y0, top); x1 = Math.max(x1, right); y1 = Math.max(y1, bottom); };
  for (const label of markup.matchAll(/<g class="mm-label[^"]*"[^>]*style="transform:translate\(([-\d.]+)px,([-\d.]+)px\)[^"]*"[^>]*>(.*?)<\/g>/g)) {
    const [dx, dy] = [Number(label[1]), Number(label[2])];
    for (const rect of label[3]!.matchAll(/<rect class="mm-pill" x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
      const [rx, ry, rw, rh] = rect.slice(1, 5).map(Number) as [number, number, number, number];
      grow(dx + rx, dy + ry, dx + rx + rw, dy + ry + rh);
    }
    for (const text of label[3]!.matchAll(/<text class="mm-callout" x="([-\d.]+)" y="([-\d.]+)"( text-anchor="end")?>([^<]*)<\/text>/g)) {
      const [tx, ty] = [Number(text[1]), Number(text[2])];
      const advance = text[4]!.length * TEXT_ADVANCE;
      grow(dx + tx - (text[3] ? advance : 0), dy + ty - 13, dx + tx + (text[3] ? 0 : advance), dy + ty + 4);
    }
  }
  // Where a callout overflows, leave it a small margin; untouched sides keep the canvas edge.
  const left = x0 < x ? x0 - 8 : x;
  const top = y0 < y ? y0 - 8 : y;
  const right = x1 > x + width ? x1 + 8 : x + width;
  const bottom = y1 > y + height ? y1 + 8 : y + height;
  const round = (value: number) => Math.round(value * 10) / 10;
  return [round(left), round(top), round(right - left), round(bottom - top)];
}

/**
 * A standalone SVG file of a scene: styles embedded, theme resolved, explicit pixel size, no
 * interactive roles, and every animation frozen in its final state (so beads, glows and growth are
 * drawn as they end, not as they start). Title and description are kept for accessibility.
 */
export function exportSvg(scene: SvgScene, options: ExportOptions = {}): string {
  const rendered = renderSvg(scene, { idPrefix: options.idPrefix, compact: options.compact, interactive: false });
  const [x, y, width, height] = calloutBox(rendered);
  const markup = rendered.replace(/viewBox="[^"]+"/, `viewBox="${x} ${y} ${width} ${height}"`);
  const scale = options.scale ?? 1;
  const theme = options.theme ?? 'light';
  // Declared after the stylesheet and more specific than `.mm-svg`, so the chosen theme always wins.
  const css = `${molecularMotionCss}\nsvg.mm-svg.mm-export{${THEME_TOKENS[theme]};width:auto;height:auto}`
    + `\n.mm-export *{animation:none!important;transition:none!important}`;
  const fill = options.background === false ? undefined : options.background === true || options.background === undefined ? 'var(--mm-canvas)' : options.background;
  const background = fill ? `<rect class="mm-export__background" x="${x}" y="${y}" width="${width}" height="${height}" fill="${escapeAttribute(fill)}"/>` : '';
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + markup
    .replace(/^<svg class="mm-svg/, `<svg width="${Math.round(width * scale)}" height="${Math.round(height * scale)}" data-theme="${theme}" class="mm-svg mm-export`)
    // After <title>/<desc>, so they stay the first children for assistive technology.
    .replace('</desc>', `</desc><style>${escapeText(css)}</style>${background}`);
}

export interface PngOptions {
  /** Device pixels per SVG pixel on top of the SVG's own size. Default 2 (sharp on high-density screens and slides). */
  pixelRatio?: number;
}

/**
 * Rasterise an exported SVG (from `exportSvg`) to a PNG in the browser. Uses the SVG's `width`/`height`
 * times `pixelRatio`. Needs a DOM with Image and canvas; in Node, render the SVG with any SVG rasteriser.
 */
export async function exportPng(svg: string, options: PngOptions = {}): Promise<Blob> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') throw new Error('exportPng needs a browser (Image and canvas)');
  const width = Number(svg.match(/<svg[^>]*\swidth="(\d+)"/)?.[1]);
  const height = Number(svg.match(/<svg[^>]*\sheight="(\d+)"/)?.[1]);
  if (!width || !height) throw new Error('exportPng expects an SVG from exportSvg (with width and height)');
  const ratio = options.pixelRatio ?? 2;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('the SVG could not be loaded as an image'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas 2D context is not available');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
