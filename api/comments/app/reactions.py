"""The shared reaction vocabulary — keep in sync with web/lib/reactions.ts.

Seven sports-flavored reactions; the backend validates the key, the web renders
the emoji. One reaction per user per post (the post_likes unique constraint).
"""

REACTIONS = ["like", "love", "haha", "wow", "fire", "money", "rekt"]
REACTION_SET = set(REACTIONS)
DEFAULT_REACTION = "like"

REACTION_EMOJI = {
    "like": "👍",
    "love": "❤️",
    "haha": "😂",
    "wow": "😮",
    "fire": "🔥",
    "money": "💰",
    "rekt": "😭",
}
