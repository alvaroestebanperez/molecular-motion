/**
 * Styles for the React building blocks. Everything reads CSS custom properties, so hosts theme the
 * components by overriding `--mm-*` tokens; light values are the default, dark values apply under
 * `[data-theme=dark]`, `.mm-theme-dark`, or the OS preference when no light theme is forced.
 */
const dark = '--mm-ui-bg:#0b1020;--mm-ui-surface:#111829;--mm-ui-raised:#161f33;--mm-ui-canvas:#0e1422;--mm-ui-ink:#e7ecf6;--mm-ui-muted:#93a1b8;--mm-ui-faint:#5f6c84;--mm-ui-line:#232d44;--mm-ui-accent:#6ea0ff;--mm-ui-accent-soft:#6ea0ff1f;--mm-ui-on-accent:#0b1020;--mm-ui-alert:#ff6b6b';

export const uiCss = `
:root{--mm-ui-bg:#f6f8fb;--mm-ui-surface:#ffffff;--mm-ui-raised:#f9fafc;--mm-ui-canvas:#f5f7fb;--mm-ui-ink:#15213b;--mm-ui-muted:#4f5d75;--mm-ui-faint:#98a3b5;--mm-ui-line:#e3e8f0;--mm-ui-accent:#2563eb;--mm-ui-accent-soft:#2563eb14;--mm-ui-on-accent:#ffffff;--mm-ui-alert:#e5484d}
:root[data-theme=dark],.mm-theme-dark{${dark}}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){${dark}}}

.mm-stage{position:relative;background:var(--mm-ui-canvas);border-radius:inherit;outline:none}
.mm-stage:focus-visible{box-shadow:inset 0 0 0 2px var(--mm-ui-accent)}
.mm-stage .mm-svg{--mm-accent:var(--mm-ui-accent)}

.mm-icon-button,.mm-controls__play{display:inline-grid;place-items:center;flex:none;border:0;background:transparent;color:var(--mm-ui-ink);cursor:pointer;transition:background .2s,color .2s,transform .2s}
.mm-icon-button{width:36px;height:36px;border-radius:9px}.mm-icon-button:hover:not(:disabled){background:var(--mm-ui-accent-soft);color:var(--mm-ui-accent)}.mm-icon-button:disabled{opacity:.3;cursor:default}
.mm-controls__play{width:48px;height:48px;border-radius:50%;background:var(--mm-ui-accent);color:var(--mm-ui-on-accent);box-shadow:0 6px 18px -8px var(--mm-ui-accent)}.mm-controls__play:hover{transform:scale(1.04)}
:is(.mm-icon-button,.mm-controls__play,.mm-timeline__step,.mm-thumbnail,.mm-tabs button,.mm-scrubber button):focus-visible{outline:2px solid var(--mm-ui-accent);outline-offset:2px}

.mm-controls{display:flex;align-items:center;gap:6px;min-width:0}
.mm-scrubber{position:relative;flex:1;min-width:120px;margin:0 14px;padding-top:18px}
.mm-scrubber__count{position:absolute;top:-2px;left:50%;transform:translateX(-50%);color:var(--mm-ui-ink);font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.mm-scrubber__track{display:flex;justify-content:space-between;align-items:center;margin:0;padding:0;list-style:none;background:linear-gradient(var(--mm-ui-line),var(--mm-ui-line)) center/100% 2px no-repeat}
.mm-scrubber__track button{display:block;width:12px;height:12px;padding:0;border:2px solid var(--mm-ui-surface);border-radius:50%;background:var(--mm-ui-line);box-shadow:0 0 0 1px var(--mm-ui-line);cursor:pointer;transition:transform .2s,background .2s}
.mm-scrubber__track button.is-past{background:color-mix(in srgb,var(--mm-ui-accent) 45%,var(--mm-ui-line));box-shadow:none}
.mm-scrubber__track button.is-active{transform:scale(1.35);background:var(--mm-ui-accent);box-shadow:0 0 0 3px var(--mm-ui-accent-soft)}
.mm-scrubber__track button:hover{transform:scale(1.25)}

.mm-switch{display:inline-flex;align-items:center;gap:8px;margin:0 6px;color:var(--mm-ui-muted);font-size:13px;cursor:pointer;user-select:none}
.mm-switch input{position:absolute;opacity:0;pointer-events:none}.mm-switch i{position:relative;width:34px;height:20px;border-radius:99px;background:var(--mm-ui-line);transition:background .2s}
.mm-switch i::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--mm-ui-surface);box-shadow:0 1px 2px #0003;transition:transform .2s}
.mm-switch input:checked+i{background:var(--mm-ui-accent)}.mm-switch input:checked+i::after{transform:translateX(14px)}.mm-switch input:focus-visible+i{outline:2px solid var(--mm-ui-accent);outline-offset:2px}

.mm-timeline{margin:0;padding:0;list-style:none}
.mm-timeline__step{display:flex;gap:12px;width:100%;padding:9px 10px;border:0;border-radius:10px;background:transparent;color:inherit;text-align:left;cursor:pointer;transition:background .2s}
.mm-timeline__step:hover{background:var(--mm-ui-raised)}
.mm-timeline__step.is-active{background:var(--mm-ui-accent-soft)}
.mm-timeline__number{display:grid;place-items:center;flex:none;width:24px;height:24px;margin-top:1px;border-radius:50%;background:var(--mm-ui-line);color:var(--mm-ui-muted);font-size:11.5px;font-weight:650;font-variant-numeric:tabular-nums;transition:background .2s,color .2s}
.mm-timeline__step.is-past .mm-timeline__number{background:color-mix(in srgb,var(--mm-ui-accent) 16%,var(--mm-ui-line));color:var(--mm-ui-accent)}
.mm-timeline__step.is-active .mm-timeline__number{background:var(--mm-ui-accent);color:var(--mm-ui-on-accent)}
.mm-timeline__text{display:grid;gap:2px;min-width:0}.mm-timeline__text strong{color:var(--mm-ui-ink);font-size:14px;font-weight:600}.mm-timeline__text small{color:var(--mm-ui-muted);font-size:12.5px;line-height:1.35}

.mm-thumbnails{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(200px,1fr);gap:12px;margin:0;padding:2px 2px 8px;overflow-x:auto;list-style:none;scroll-snap-type:x proximity;scrollbar-width:thin}
.mm-thumbnails li{scroll-snap-align:start}
.mm-thumbnail{display:grid;width:100%;padding:0;overflow:hidden;border:1px solid var(--mm-ui-line);border-radius:12px;background:var(--mm-ui-canvas);color:inherit;text-align:left;cursor:pointer;transition:border-color .2s,box-shadow .2s}
.mm-thumbnail:hover{border-color:color-mix(in srgb,var(--mm-ui-accent) 40%,var(--mm-ui-line))}
.mm-thumbnail.is-active{border-color:var(--mm-ui-accent);box-shadow:0 0 0 1px var(--mm-ui-accent)}
.mm-thumbnail__title{display:flex;align-items:center;gap:8px;padding:10px 12px 0;color:var(--mm-ui-ink);font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mm-thumbnail__number{display:grid;place-items:center;flex:none;width:20px;height:20px;border-radius:50%;background:var(--mm-ui-line);color:var(--mm-ui-muted);font-size:10.5px}
.mm-thumbnail.is-active .mm-thumbnail__number{background:var(--mm-ui-accent);color:var(--mm-ui-on-accent)}
.mm-thumbnail__art{aspect-ratio:2/1;overflow:hidden}.mm-thumbnail__art .mm-svg{height:100%}

.mm-details{display:flex;flex-direction:column;min-height:0}
.mm-tabs{display:flex;gap:4px;border-bottom:1px solid var(--mm-ui-line)}
.mm-tabs button{position:relative;padding:12px 10px 11px;border:0;background:transparent;color:var(--mm-ui-muted);font-size:13.5px;font-weight:550;cursor:pointer;white-space:nowrap}
.mm-tabs button[aria-selected=true]{color:var(--mm-ui-accent)}.mm-tabs button[aria-selected=true]::after{content:"";position:absolute;inset:auto 6px -1px;height:2px;border-radius:2px;background:var(--mm-ui-accent)}
.mm-tabpanel{padding:18px 4px 4px;outline:none;overflow:auto}
.mm-prose{margin:0 0 20px;color:var(--mm-ui-ink);font-size:14.5px;line-height:1.65}
.mm-empty{margin:0 0 16px;color:var(--mm-ui-faint);font-size:13.5px}
.mm-events{margin-bottom:22px;padding:14px 16px;border:1px solid var(--mm-ui-line);border-radius:12px}
.mm-events h3,.mm-subheading{margin:0 0 12px;color:var(--mm-ui-ink);font-size:14.5px;font-weight:650}.mm-subheading{margin-top:4px}
.mm-events ol{display:grid;gap:10px;margin:0;padding:0;list-style:none}
.mm-events li{display:flex;gap:11px;color:var(--mm-ui-ink);font-size:13.5px;line-height:1.45}
.mm-events li span{display:grid;place-items:center;flex:none;width:22px;height:22px;border-radius:50%;background:var(--mm-ui-accent);color:var(--mm-ui-on-accent);font-size:11px;font-weight:650}
.mm-references{display:grid;gap:14px;margin:0 0 20px;padding:0;list-style:none}.mm-references li{display:flex;gap:11px}
.mm-references__index{display:grid;place-items:center;flex:none;width:22px;height:22px;border-radius:50%;border:1px solid var(--mm-ui-line);color:var(--mm-ui-muted);font-size:11px}
.mm-references__ids{display:flex;flex-wrap:wrap;gap:2px 12px}
.mm-references a{display:inline-flex;align-items:center;gap:4px;color:var(--mm-ui-accent);font-size:13.5px;font-weight:600;text-decoration:none}.mm-references a:hover{text-decoration:underline}.mm-references a svg{opacity:.55}
.mm-references cite{display:block;margin-top:2px;color:var(--mm-ui-muted);font-size:12.5px}
.mm-actors{display:grid;gap:10px;margin:0 0 20px;padding:0;list-style:none}
.mm-actors li{padding:12px 14px;border:1px solid var(--mm-ui-line);border-radius:12px;transition:border-color .2s}.mm-actors li.is-selected{border-color:var(--mm-ui-accent)}
.mm-actors strong{display:flex;align-items:center;gap:8px;color:var(--mm-ui-ink);font-size:14px}.mm-actors strong i{width:10px;height:10px;border-radius:50%;background:var(--mm-actor)}
.mm-actors p{margin:4px 0 0;color:var(--mm-ui-muted);font-size:13px;line-height:1.45}
.mm-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.mm-chip{padding:3px 8px;border-radius:99px;background:var(--mm-ui-raised);box-shadow:inset 0 0 0 1px var(--mm-ui-line);color:var(--mm-ui-ink);font-size:11.5px;font-weight:550}
.mm-chip--active{background:#16a34a1a;box-shadow:none;color:#15803d}.mm-chip--inhibited{background:#e5484d1a;box-shadow:none;color:var(--mm-ui-alert)}.mm-chip--inactive,.mm-chip--muted{color:var(--mm-ui-muted)}.mm-chip--alert{background:#e5484d14;box-shadow:none;color:var(--mm-ui-alert)}
:where([data-theme=dark],.mm-theme-dark) .mm-chip--active{color:#4ade80}
.mm-plain{margin:0;padding:0;list-style:none;color:var(--mm-ui-muted);font-size:13px}

.mm-player{overflow:hidden;border:1px solid var(--mm-ui-line);border-radius:16px;background:var(--mm-ui-surface);color:var(--mm-ui-ink);font-family:var(--mm-font,Inter,system-ui,sans-serif)}
.mm-player__header{padding:18px 20px 12px}.mm-player__eyebrow{margin:0 0 4px;color:var(--mm-ui-muted);font-size:12.5px}.mm-player__header h2{margin:0;font-size:clamp(18px,2.4vw,24px);letter-spacing:-.01em}.mm-player__header p{margin:6px 0 0;color:var(--mm-ui-muted);font-size:14px}
.mm-player .mm-stage{border-block:1px solid var(--mm-ui-line)}
.mm-player .mm-controls{padding:12px 14px}
@media(max-width:640px){.mm-controls{flex-wrap:wrap}.mm-scrubber{order:-1;flex-basis:100%;margin:0 4px 6px}.mm-switch span{display:none}}
`;
