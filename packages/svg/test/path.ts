/** Test helpers that read rendered membrane markup back as geometry. */
export type Point = { x: number; y: number };

/**
 * Decodes the line-only path data written by the primitives (M/L/H/V/Z, absolute or relative, with
 * implicit command repetition and compact separators) into subpaths of absolute points.
 */
export function subpaths(d: string): Point[][] {
  const tokens = d.match(/[MLHVZmlhvz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const out: Point[][] = []; let x = 0; let y = 0; let command = ''; let i = 0;
  const next = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i]!)) command = tokens[i++]!;
    const relative = command === command.toLowerCase();
    switch (command.toUpperCase()) {
      case 'M': { const dx = next(); const dy = next(); x = relative ? x + dx : dx; y = relative ? y + dy : dy; out.push([{ x, y }]); command = relative ? 'l' : 'L'; break; }
      case 'L': { const dx = next(); const dy = next(); x = relative ? x + dx : dx; y = relative ? y + dy : dy; out.at(-1)!.push({ x, y }); break; }
      case 'H': { const dx = next(); x = relative ? x + dx : dx; out.at(-1)!.push({ x, y }); break; }
      case 'V': { const dy = next(); y = relative ? y + dy : dy; out.at(-1)!.push({ x, y }); break; }
      case 'Z': { const start = out.at(-1)![0]!; x = start.x; y = start.y; break; }
      default: throw new Error(`Unsupported path command ${command}`);
    }
  }
  return out.map(points => points.map(p => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 })));
}

/** Resamples a polyline so consecutive points are at most `step` apart (closing it back to the start if `closed`). */
export function densify(points: readonly Point[], closed: boolean, step = 2): Point[] {
  const out: Point[] = [];
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i]!; const b = points[(i + 1) % points.length]!; const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let s = 0; s < n; s++) out.push({ x: a.x + (b.x - a.x) * s / n, y: a.y + (b.y - a.y) * s / n });
  }
  if (!closed) out.push(points[points.length - 1]!);
  return out;
}

/** Every membrane drawn in `svg`: root classes, outer/inner head counts and its decoded layers. */
export function membranes(svg: string) {
  const pattern = /<g class="(mm-primitive mm-primitive--membrane[^"]*)" data-heads="(\d+) (\d+)"><path class="mm-membrane__core" d="([^"]+)"[^>]*\/><path class="mm-membrane__tails" d="([^"]+)"\/><path class="mm-membrane__head-rims" d="([^"]+)"[^>]*\/><path class="mm-membrane__heads" d="([^"]+)"[^>]*\/><\/g>/g;
  return [...svg.matchAll(pattern)].map(([, className, outer, inner, core, tails, rims, heads]) => {
    const centres = subpaths(heads!).map(points => points[0]!);
    return {
      className: className!, closed: /z$/i.test(core!), core: subpaths(core!)[0]!, tails: subpaths(tails!), rims: rims!, headPath: heads!,
      heads: { outer: centres.slice(0, Number(outer)), inner: centres.slice(Number(outer)) },
    };
  });
}
