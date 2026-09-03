"""Internal comments operations (service-to-service)."""
from app.extensions import db
from app.models.comment import Comment
from app.models.post_like import PostLike


def purge_user(data: dict) -> tuple[dict, int]:
    """Account deletion in the comments service.

    Reactions (`post_likes`) are personal — hard-deleted. Comments are shared
    content (they hang on posts other members read), so they're KEPT; the author
    display name resolves live from the users service, which returns the
    "Deleted user" tombstone after the account is gone. Idempotent.
    """
    try:
        uid = str(data["user_id"])
    except (KeyError, ValueError, TypeError):
        return {"error": "user_id is required"}, 400
    likes = PostLike.query.filter(PostLike.user_id == uid).delete(synchronize_session=False)
    kept = Comment.query.filter(Comment.author_id == uid).count()
    db.session.commit()
    return {"purged": {"post_likes": likes}, "kept": {"comments": kept}}, 200
