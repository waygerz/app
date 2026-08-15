// The shared reaction vocabulary — mirror of api/comments/app/reactions.py.
// Seven sports-flavored reactions; backend validates the key, web renders emoji.

export type ReactionKey = 'like' | 'love' | 'haha' | 'wow' | 'fire' | 'money' | 'rekt';

export const REACTIONS: { key: ReactionKey; emoji: string; label: string }[] = [
  { key: 'like', emoji: '👍', label: 'Like' },
  { key: 'love', emoji: '❤️', label: 'Love' },
  { key: 'haha', emoji: '😂', label: 'Haha' },
  { key: 'wow', emoji: '😮', label: 'Wow' },
  { key: 'fire', emoji: '🔥', label: 'Fire' },
  { key: 'money', emoji: '💰', label: 'Money' },
  { key: 'rekt', emoji: '😭', label: 'Rekt' },
];

export const REACTION_EMOJI = Object.fromEntries(
  REACTIONS.map((r) => [r.key, r.emoji]),
) as Record<ReactionKey, string>;

export const REACTION_LABEL = Object.fromEntries(
  REACTIONS.map((r) => [r.key, r.label]),
) as Record<ReactionKey, string>;
