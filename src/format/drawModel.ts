import { fmtNum, parseNum, type Num } from './num';

export interface DrawGroup {
  cmd: string;
  nums: Num[];
}
export interface Draw {
  groups: DrawGroup[];
  trail: boolean;
}
const CMDS = 'mnlbspc';

export const parseDraw = (s: string): Draw | null => {
  const trail = s.endsWith(' ');
  const core = trail ? s.slice(0, -1) : s;
  if (core === '') return null;
  const groups: DrawGroup[] = [];
  for (const tok of core.split(' ')) {
    if (tok.length === 1 && CMDS.includes(tok)) {
      groups.push({ cmd: tok, nums: [] });
      continue;
    }
    const n = parseNum(tok);
    if (!n || groups.length === 0) return null;
    groups[groups.length - 1].nums.push(n);
  }
  return { groups, trail };
};

export const printDraw = (d: Draw): string => {
  const parts: string[] = [];
  for (const g of d.groups) {
    parts.push(g.cmd);
    for (const n of g.nums) parts.push(fmtNum(n));
  }
  return parts.join(' ') + (d.trail ? ' ' : '');
};
