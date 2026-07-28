// Shared sport → emoji map, used by the standalone /sports browser and the
// per-league Sports hub so the icon fallback is consistent across both.
export const SPORT_EMOJI: Record<string, string> = {
  basketball: '🏀',
  baseball: '⚾',
  football: '🏈',
  hockey: '🏒',
  'ice-hockey': '🏒',
  soccer: '⚽',
  tennis: '🎾',
  golf: '⛳',
  rugby: '🏉',
  'australian-football': '🏉',
  cricket: '🏏',
  volleyball: '🏐',
  lacrosse: '🥍',
  'field-hockey': '🏑',
  mma: '🥊',
  boxing: '🥊',
};

export function emojiFor(slug: string): string {
  return SPORT_EMOJI[slug] ?? '🏅';
}
