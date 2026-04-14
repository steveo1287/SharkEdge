export const MAIN_NAV_ITEMS = [
  { href: '/', label: 'Command' },
  { href: '/board', label: 'Live Board' },
  { href: '/trends', label: 'Trends' },
  { href: '/props', label: 'Props' },
  { href: '/sim', label: 'Sim Lab' },
];

export const LEAGUE_NAV_ITEMS = [
  { href: '/board?league=NBA', label: 'NBA' },
  { href: '/board?league=MLB', label: 'MLB' },
  { href: '/board?league=NHL', label: 'NHL' },
  { href: '/board?league=NFL', label: 'NFL' },
];

export const SECONDARY_NAV_ITEMS = [
  { href: '/players', label: 'Player Desk' },
  { href: '/props', label: 'Prop Scanner' },
  { href: '/sim', label: 'Model Workbench' },
];

export const RESEARCH_NAV_ITEMS = [
  { href: '/trends', label: 'Trend Diagnostics' },
  { href: '/sim', label: 'Confidence Curves' },
];

export function isActivePath(pathname: string, href: string) {
  const path = href.split('?')[0];
  return pathname === path || (path !== '/' && pathname.startsWith(path));
}
