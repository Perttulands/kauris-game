// Compact authored pictograms. UI owns accessible labels, sizing and selected state.
const paths = {
  rock: '<path fill="#a5aa9a" d="m7 48 8-23 17-13 19 9 8 27-18 8-25-2z"/><path fill="#c2c2ac" d="m15 25 17-13 9 23-22 6z"/><path d="m41 35 10-14m-10 14 18 13M19 41l-3 13"/>',
  lookDown: '<path d="M5 20Q18 4 31 20Q18 36 5 20Z" fill="#eee0bd"/><circle cx="18" cy="20" r="5" fill="#527c68"/><path d="M46 15v27m-10-9 10 11 10-11M8 56h48" fill="none" stroke-width="4"/>',
  grass: '<path fill="#78a05b" stroke="#426c42" d="M14 56C17 36 9 20 6 15c14 6 19 21 20 41h-12ZM27 56C29 29 25 13 21 6c17 12 16 33 15 50h-9ZM37 56C38 33 47 18 59 14c-9 14-11 30-12 42H37Z"/><path d="M9 57h45" stroke="#806644" stroke-width="4"/>',
  shirt: '<path fill="#91b784" d="m20 10 12 5 12-5 15 12-9 12-7-5v28H21V29l-7 5-9-12z"/><path d="M24 12c0 11 16 11 16 0M24 37h13v10H24z" fill="#eee0bd"/>',
  sound: '<path fill="#dec398" d="M8 25h12L35 12v40L20 39H8z"/><path d="M43 23q9 9 0 18m7-27q17 18 0 36" fill="none" stroke="#91b784" stroke-width="4"/>',
  mute: '<path fill="#dec398" d="M8 25h12L35 12v40L20 39H8z"/><path d="m43 24 14 16m0-16L43 40" fill="none" stroke="#ce835d" stroke-width="5"/>',
  sparkle: '<path fill="#ffe092" d="m32 5 7 20 20 7-20 7-7 20-7-20-20-7 20-7z"/><path d="m49 5 2 7 7 2-7 2-2 7-2-7-7-2 7-2z" fill="#d5fff0"/>',
  butterfly: '<path fill="#ce835d" d="M30 29C8-9-6 27 22 37-1 62 30 64 31 39m3-10C56-9 70 27 42 37c23 25-8 27-9 2"/><path d="M32 25v23m-2-21-7-12m11 12 7-12" stroke="#493a31" stroke-width="4"/><path d="m15 21 9 9m25-9-9 9" stroke="#fff0c9" stroke-width="6"/>',
  bird: '<path fill="#618b9d" d="m8 43 9-16c4-11 17-11 24-5l10 2-2 14c-3 16-22 20-30 10L6 52z"/><path fill="#fff0c9" d="M21 35q20 11 27-4c6 20-25 30-27 4"/><path fill="#e4ba52" d="m48 26 12 7-12 3z"/><path d="M25 50v8m11-8v8m5-29v2" stroke-width="4"/>',
  deer: '<path fill="#b68a61" d="m18 24-9-14 13 5 10 9 10-9 13-5-9 14 2 20-16 14-16-14z"/><path fill="#e5c9a0" d="m21 40 11-4 11 4-2 12-9 6-9-6z"/><path d="M24 29v4m16-4v4m-12 9 4 4 4-4m-4 4v5" stroke-width="3.5"/>',
  resident: '<path fill="#527c68" d="M10 59V46c0-11 44-11 44 0v13z"/><path fill="#e7b790" d="M18 12h28v23c-3 12-25 12-28 0z"/><path fill="#573c2c" d="M16 21V9l10-5 21 5 2 13-9-7-20 5z"/><path d="M25 26v3m14-3v3m-13 6q6 6 12 0"/><path fill="#c77f50" d="m22 43 19-2-5 8 4 9-8 1-4-12z"/>',
  shovel: '<path fill="#bb8757" d="m28 19 7 1-5 25-7-1z"/><path fill="#b9d1d3" d="m18 39 18 3-2 10-11 7-8-11z"/><path d="m29 7 12 2-2 10-5 4-6-6z" fill="none"/>',
  seed: '<path fill="#dec398" d="m13 20 35-4 4 40-35 4z"/><path fill="#6b9d6b" d="m20 39 25-3 1 17-24 3z"/><path d="M33 43V28m0 8C18 36 21 24 21 24c10-1 12 7 12 7m0 1c0-10 12-12 12-12 2 11-9 14-12 14" fill="#91b784"/>',
  fill: '<path fill="#8b7561" d="m8 53 11-15 13 5 10-7 14 17z"/><path d="M32 6v23m-9-8 9 10 9-10" fill="none"/><path d="m17 45 7-3m17 3 4-2"/>',
  swim: '<path d="M5 46q7-7 14 0t14 0t14 0t12 0M7 55q7-7 14 0t14 0t14 0" stroke="#83e3db" stroke-width="4"/><circle cx="43" cy="21" r="7" fill="#dec398"/><path d="m10 33 14-14 13 9-11 10M24 19l9-9" stroke="#dec398" stroke-width="7"/>',
  reef: '<path d="M8 53h48M25 51V26m0 8-12-9V15m12 28 12-13V17m8 34V35l10-10m-10 16-8-6" stroke="#ecad91" stroke-width="6"/><path fill="#83e3db" d="m11 12 8-6 8 6-8 6zM52 7l7 5-7 5-7-5z"/>',
  hose: '<path fill="#91b784" d="M12 27h28l-3 28H17z"/><path d="M14 28C-3 8 17 6 20 26m4 2V14h13v14" fill="none" stroke="#c5d9a4" stroke-width="6"/><path fill="#c57946" d="m37 40 12-19 7 4-16 25z"/><path d="m47 18 11 8m-4 7 3 5m-9-8 2 5" stroke="#83e3db" stroke-width="4"/><path d="M25 47v-8m0 5-5-5m5 2 6-5" stroke="#426f50" stroke-width="3"/>',
  axe: '<path fill="#bb8757" d="m29 18 8 2-8 39-9-2z"/><path fill="#8295a1" d="m21 10 18 3 14-7 5 18-18 8-16-5z"/><path fill="#d8e6e3" d="m51 7 7 17-6 3-7-18z"/><path d="m23 45 8 2m-9 3 8 2"/>',
  build: '<path fill="#bb8757" d="m11 36 21-19 21 19v23H11z"/><path fill="#567e7a" d="m6 34 26-23 26 23-5 6-21-19-21 19z"/><path fill="#f0d6a0" d="M26 43h12v16H26z"/><path d="M45 8v15M38 8h17v7H38z" fill="#b9d1d3"/>',
  remove: '<path fill="#bb8757" d="M12 30h30v29H12z"/><path d="m12 30 10-9h28l-8 9m0 0 8-9v28l-8 10" fill="#dcaf74"/><path d="M26 43V8m-9 9 9-10 9 10" fill="none" stroke="#d7eee0" stroke-width="5"/>',
  grow: '<path d="M32 56V25"/><path fill="#6b9d6b" d="M32 43C12 45 9 30 9 25c17-2 25 6 23 18m0-12C32 13 47 10 54 11c-1 16-8 23-22 20"/><path d="M19 58h27"/>',
  hand: '<path fill="#dec398" d="M18 35V22c0-5 7-5 7 0V12c0-5 7-5 7 0v10-13c0-5 7-5 7 0v14-7c0-5 7-5 7 0v20l4-5c4-5 10 0 7 5L43 57H26L10 40c-5-6 1-11 5-7l3 2z"/>',
  check: '<path d="m11 33 13 13 29-30" fill="none" stroke="#8bd2a3" stroke-width="8"/>',
  lock: '<path d="M20 28V18c0-17 24-17 24 0v10" fill="none" stroke-width="6"/><rect x="12" y="27" width="40" height="31" rx="6" fill="#dec398"/><path d="M32 38v9" stroke-width="5"/>',
  footsteps: '<path fill="#dec398" d="M15 7c8 0 10 10 9 16l-3 13-11-3L9 19c0-7 2-12 6-12m-5 31 11 3-2 10c-1 7-12 5-11-2zm35-23c8 1 9 11 7 17l-4 13-11-4 1-14c0-7 3-12 7-12m-9 31 11 4-3 10c-2 6-12 3-10-3z"/>',
  play: '<path fill="#d9edb5" d="M20 10v44l34-22z"/>',
  back: '<path d="M53 32H12m16-16L11 32l17 16" fill="none" stroke-width="6"/>',
  book: '<path fill="#dec398" d="M6 12c12-3 19-1 26 5 7-6 14-8 26-5v42c-12-3-19-1-26 4-7-5-14-7-26-4z"/><path d="M32 17v41M14 25l10 3m-10 6 10 3m16-9 10-3m-10 12 10-3"/>',
  rotate: '<path d="M15 20a21 21 0 1 1-3 22M15 8v14H3" fill="none" stroke-width="5"/>',
  wood: '<path fill="#bb8757" d="m13 21 31-9 11 20-30 17z"/><ellipse cx="19" cy="36" rx="13" ry="17" fill="#dcaf74" transform="rotate(-27 19 36)"/><ellipse cx="19" cy="36" rx="6" ry="9" fill="none" transform="rotate(-27 19 36)"/><path d="m28 21 17-5m-13 13 17-6"/>',
  copper: '<path fill="#c57946" d="m11 19 21-11 22 14-4 25-26 10-17-20z"/><path fill="#e5a371" d="m11 19 21-11 8 19-20 9z"/><path fill="#60a593" d="m40 27 14-5-4 25-12-4z"/><path d="m20 36 4 21m-4-21 20-9" fill="none"/>',
  iron: '<path fill="#8295a1" d="m9 25 11-13h28l9 13-6 25H13z"/><path fill="#c4d3d1" d="m9 25 11-13h28l9 13z"/><path d="M22 25h26m-28 8 2 12m26-12-2 12"/>',
  diamond: '<path fill="#83e3db" d="M9 22 21 8h22l12 14-23 35z"/><path fill="#d5fff0" d="m21 8 11 14-23 0zm22 0-11 14h23z"/><path d="M9 22h46M21 8l11 49L43 8" fill="none"/>',
  fiber: '<path d="m20 56 8-44m5 44 2-48m11 48-6-41" fill="none" stroke="#91b784" stroke-width="4"/><path fill="#dec398" d="m24 28-10-9 3-9 11 10m7 0-7-11 7-6 7 10m1 18 10-10-4-9-10 12"/><path d="m16 40 32-1v8H16z" fill="#bb8757"/>',
};
export function icon(name) {
  const body = paths[name==='muted'?'mute':name];
  if (!body) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" class="pictogram" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
