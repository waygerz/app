import '../config.dart';
import 'api_client.dart';

/// The shared reaction vocabulary (api/comments/app/reactions.py, web
/// lib/reactions.ts): key → (emoji, label), in display order.
const reactions = <String, (String, String)>{
  'like': ('👍', 'Like'),
  'love': ('❤️', 'Love'),
  'haha': ('😂', 'Haha'),
  'wow': ('😮', 'Wow'),
  'fire': ('🔥', 'Fire'),
  'money': ('💰', 'Money'),
  'rekt': ('😭', 'Rekt'),
};

/// Reactions + comment count (+ the newest comment) for one feed post.
class PostEngagement {
  const PostEngagement({this.reactions = const {}, this.total = 0, this.mine, this.commentCount = 0, this.latestComment});
  final Map<String, int> reactions;
  final int total;
  final String? mine;
  final int commentCount;

  /// The newest comment, shown inline on the feed row (no replies).
  final PostComment? latestComment;

  static const empty = PostEngagement();

  factory PostEngagement.fromJson(Map<String, dynamic> j) => PostEngagement(
        reactions: {for (final e in ((j['reactions'] as Map?) ?? const {}).entries) '${e.key}': (e.value as num).toInt()},
        total: (j['total_reactions'] as int?) ?? 0,
        mine: j['my_reaction'] as String?,
        commentCount: (j['comment_count'] as int?) ?? 0,
        latestComment: j['latest_comment'] is Map
            ? PostComment.fromJson((j['latest_comment'] as Map).cast<String, dynamic>())
            : null,
      );

  /// Up to three most-used reaction emoji (web topEmojis).
  String get topEmojis {
    final used = reactions.entries.where((e) => e.value > 0).toList()..sort((a, b) => b.value.compareTo(a.value));
    return used.take(3).map((e) => reactionsEmoji(e.key)).join();
  }
}

String reactionsEmoji(String key) => reactions[key]?.$1 ?? '';

class PostComment {
  PostComment({
    required this.id,
    required this.authorId,
    required this.body,
    required this.createdAt,
    this.authorName,
    this.replies = const [],
  });
  final String id;
  final String authorId;
  final String? authorName;
  final String body;
  final String createdAt;
  final List<PostComment> replies;

  factory PostComment.fromJson(Map<String, dynamic> j) => PostComment(
        id: '${j['id']}',
        authorId: '${j['author_id']}',
        authorName: j['author_name'] as String?,
        body: (j['body'] ?? '') as String,
        createdAt: (j['created_at'] ?? '') as String,
        replies: [
          for (final r in (j['replies'] as List<dynamic>?) ?? const [])
            PostComment.fromJson((r as Map).cast<String, dynamic>()),
        ],
      );
}

class Reactor {
  Reactor({required this.userId, required this.reaction, this.displayName, this.avatarKey});
  final String userId;
  final String reaction;
  final String? displayName;
  final String? avatarKey;

  factory Reactor.fromJson(Map<String, dynamic> j) => Reactor(
        userId: '${j['user_id']}',
        reaction: (j['reaction'] ?? '') as String,
        displayName: j['display_name'] as String?,
        avatarKey: j['avatar_key'] as String?,
      );
}

/// Client for the comments service (`/v1/social/comments`): comments and
/// reactions on league feed posts. Mirrors web/lib/comments.ts.
class CommentsApi {
  CommentsApi(this._api);
  final ApiClient _api;
  String get _p => Config.comments;

  Future<Map<String, PostEngagement>> engagement(List<String> postIds) async {
    if (postIds.isEmpty) return {};
    final res = await _api.post('$_p/posts/engagement', body: {'post_ids': postIds});
    final posts = (res['posts'] as Map?) ?? const {};
    return {
      for (final e in posts.entries) '${e.key}': PostEngagement.fromJson((e.value as Map).cast<String, dynamic>()),
    };
  }

  Future<List<PostComment>> list(String postId) async {
    final res = await _api.get('$_p/posts/$postId/comments');
    return [
      for (final c in (res['comments'] as List<dynamic>?) ?? const [])
        PostComment.fromJson((c as Map).cast<String, dynamic>()),
    ];
  }

  Future<void> create(String postId, String body, {String? parentId}) =>
      _api.post('$_p/posts/$postId/comments', body: {'body': body, 'parent_id': parentId});

  Future<void> delete(String commentId) => _api.delete('$_p/comments/$commentId');

  Future<void> setReaction(String postId, String reaction) =>
      _api.put('$_p/posts/$postId/reaction', body: {'reaction': reaction});

  Future<void> removeReaction(String postId) => _api.delete('$_p/posts/$postId/reaction');

  Future<List<Reactor>> reactors(String postId) async {
    final res = await _api.get('$_p/posts/$postId/reactions');
    return [
      for (final r in (res['reactors'] as List<dynamic>?) ?? const [])
        Reactor.fromJson((r as Map).cast<String, dynamic>()),
    ];
  }
}
