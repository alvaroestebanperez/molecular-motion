export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

export const esc = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

export const round = (value: number) => Math.round(value * 10) / 10;

/** Mix two colours; hex values are mixed exactly, anything else falls back to CSS color-mix(). */
export function mix(color: string, other: string, amount: number): string {
  const parse = (hex: string) => {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) return undefined;
    const value = match[1]!.length === 3 ? match[1]!.split('').map(char => char + char).join('') : match[1]!;
    return [0, 2, 4].map(offset => parseInt(value.slice(offset, offset + 2), 16));
  };
  const a = parse(color);
  const b = parse(other);
  if (!a || !b) return `color-mix(in srgb, ${esc(color)} ${Math.round((1 - amount) * 100)}%, ${other})`;
  return `#${a.map((channel, index) => Math.round(channel + (b[index]! - channel) * amount).toString(16).padStart(2, '0')).join('')}`;
}

export function seededRandom(seed: string) {
  let state = hashString(seed) || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507) ^ Math.imul(state ^ (state >>> 13), 3266489909);
    return ((state ^= state >>> 16) >>> 0) / 4294967296;
  };
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
