// Shared formatting helpers for the messages inbox + thread pages.
import type { Conversation } from '@/lib/messaging';

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

export function clockTime(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function dayKey(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toDateString();
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Deterministic per-author colour for group-chat sender names.
const NAME_COLORS = [
  'text-violet-400', 'text-pink-400', 'text-teal-400', 'text-amber-400',
  'text-sky-400', 'text-emerald-400', 'text-fuchsia-400', 'text-orange-400',
];
export function senderColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}

export function conversationTitle(conv: Conversation, leagueNames: Record<string, string>): string {
  if (conv.type === 'league' && conv.league_id) return leagueNames[conv.league_id] ?? 'League chat';
  if (conv.other_user?.display_name) return conv.other_user.display_name;
  const author = conv.last_message?.author_name;
  return author ? `Chat with ${author}` : 'Direct message';
}
