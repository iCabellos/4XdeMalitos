/** Shared visual language for both 3D scenes and the HUD. */
export const PALETTE = {
  background: 0x0e1116,
  fogHidden: 0x323b47,
  gridLine: 0x2a3340,
  selection: 0xffffff,
  reachable: 0x4da3ff,
  attack: 0xff5c5c,
  buildGhost: 0x63d471,
  objective: 0xe470c8,
  gate: 0xffd166,
  facility: 0x7fd4d4,
  cache: 0xc8a165,
};

export function hexToCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
