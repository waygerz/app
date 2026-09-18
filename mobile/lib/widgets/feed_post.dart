import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../api/comments_api.dart';
import '../format.dart';
import '../models.dart';
import '../screens/widgets.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';

/// Per-event icon + tint (web feed-post.tsx EVENT_STYLE). A `label` renders the
/// post as a system line (icon + label) even when it has an author — bet events.
({IconData icon, Color bg, Color fg, Gradient? gradient, String? label}) _eventStyle(BuildContext context, String? type) {
  final c = WaygerzColors.of(context);
  final dark = Theme.of(context).brightness == Brightness.dark;
  const blue600 = Color(0xFF2563EB);
  const blue400 = Color(0xFF60A5FA);
  const sky600 = Color(0xFF0284C7);
  const sky400 = Color(0xFF38BDF8);
  final bet = (Tw.blue500.withValues(alpha: 0.15), dark ? blue400 : blue600);
  return switch (type) {
    'league_created' => (icon: LucideIcons.partyPopper, bg: c.brand.withValues(alpha: 0.15), fg: c.brand, gradient: null, label: null),
    'member_joined' => (icon: LucideIcons.userPlus, bg: Tw.sky500.withValues(alpha: 0.15), fg: dark ? sky400 : sky600, gradient: null, label: null),
    'period_opened' => (icon: LucideIcons.calendarClock, bg: Tw.amber500.withValues(alpha: 0.15), fg: dark ? Tw.amber400 : Tw.amber600, gradient: null, label: null),
    'period_final' => (icon: LucideIcons.trophy, bg: Tw.violet500, fg: Colors.white,
        gradient: const LinearGradient(colors: [Tw.violet500, Tw.fuchsia500], begin: Alignment.topLeft, end: Alignment.bottomRight), label: null),
    'wager_accepted' => (icon: LucideIcons.swords, bg: bet.$1, fg: bet.$2, gradient: null, label: 'Bet accepted'),
    'wager_settled' => (icon: LucideIcons.swords, bg: bet.$1, fg: bet.$2, gradient: null, label: 'Bet settled'),
    'wager_completed' => (icon: LucideIcons.swords, bg: bet.$1, fg: bet.$2, gradient: null, label: 'Bet result'),
    _ => (icon: LucideIcons.activity, bg: c.muted, fg: c.mutedForeground, gradient: null, label: null),
  };
}

/// A league feed post (web FeedPostCard): header, body, the game for bet posts,
/// link, and a React / Comment footer. Tap opens the post with its comments.
class FeedPostCard extends StatelessWidget {
  const FeedPostCard({
    super.key,
    required this.api,
    required this.item,
    required this.engagement,
    required this.me,
    required this.avatarFor,
    required this.onChanged,
  });

  final ApiClient api;
  final FeedItem item;
  final PostEngagement engagement;
  final String me;

  /// A member's avatar key by user id (post and comment authors).
  final String? Function(String userId) avatarFor;

  /// After a reaction or comment changes the post's engagement.
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final winner = item.eventType == 'period_final';
    void open() => showPostSheet(context, api: api, item: item, engagement: engagement, me: me, avatarFor: avatarFor, onChanged: onChanged);
    return WzCard(
      padding: EdgeInsets.zero,
      onTap: open,
      color: winner ? Color.alphaBlend(Tw.violet500.withValues(alpha: 0.07), c.card) : null,
      borderColor: winner ? Tw.violet500.withValues(alpha: 0.3) : null,
      child: PostHeader(
        item: item,
        avatarKey: item.authorId == null ? null : avatarFor(item.authorId!),
        footer: Row(children: [
          ReactionControl(api: api, postId: item.id, engagement: engagement, onChanged: onChanged),
          _ghost(c, LucideIcons.messageCircle,
              engagement.commentCount > 0
                  ? '${engagement.commentCount} Comment${engagement.commentCount == 1 ? '' : 's'}'
                  : 'Comment',
              open),
        ]),
      ),
    );
  }
}

Widget _ghost(WaygerzColors c, IconData icon, String label, VoidCallback onTap, {Color? color, Widget? lead}) => InkWell(
      borderRadius: BorderRadius.circular(WaygerzRadius.md),
      onTap: onTap,
      child: Container(
        height: 36,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          lead ?? Icon(icon, size: 16, color: color ?? c.mutedForeground),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(fontSize: 12, color: color ?? c.mutedForeground)),
        ]),
      ),
    );

/// Avatar or event icon, heading + time, then title/body/game/link and a footer.
class PostHeader extends StatelessWidget {
  const PostHeader({super.key, required this.item, this.avatarKey, this.footer});
  final FeedItem item;
  final String? avatarKey;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final ev = _eventStyle(context, item.eventType);
    final asSystem = item.authorId == null || ev.label != null;
    final heading = ev.label ??
        (item.kind == 'activity' ? (item.title ?? item.authorName ?? 'Update') : (item.authorName ?? item.title ?? 'Update'));
    final showSubtitle = ev.label == null && (item.title ?? '').isNotEmpty && item.title != heading;
    final wagerEvent = (item.eventType ?? '').startsWith('wager_');
    final m = item.meta;
    final hasGame = wagerEvent && (m['away'] != null || m['home'] != null);
    final matchupFallback = wagerEvent && !hasGame && (item.title ?? '').isNotEmpty && item.title != heading;

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          if (!asSystem)
            UserAvatar(userId: item.authorId!, name: item.authorName ?? 'Member', avatarKey: avatarKey, size: 40)
          else
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: ev.gradient == null ? ev.bg : null, gradient: ev.gradient, shape: BoxShape.circle),
              child: Icon(ev.icon, size: 20, color: ev.fg),
            ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(heading, maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
              Text(timeAgo(item.createdAt), style: TextStyle(fontSize: 12, color: c.mutedForeground)),
            ]),
          ),
          if (item.kind == 'announcement')
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(color: c.primary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(999)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(LucideIcons.megaphone, size: 12, color: c.primary),
                const SizedBox(width: 4),
                Text('ANNOUNCEMENT', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, letterSpacing: 0.5, color: c.primary)),
              ]),
            ),
        ]),
        if (showSubtitle) ...[
          const SizedBox(height: 16),
          Text(item.title!, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.foreground)),
        ],
        if ((item.body ?? '').isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(item.body!, style: TextStyle(fontSize: 16, height: 1.6, color: c.foreground,
              fontWeight: item.eventType == 'period_final' ? FontWeight.w500 : FontWeight.w400)),
        ],
        if (hasGame) ...[
          const SizedBox(height: 16),
          _gameRow(c, m),
        ],
        if (matchupFallback) ...[
          const SizedBox(height: 16),
          Text(item.title!, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.mutedForeground)),
        ],
        if ((item.linkUrl ?? '').isNotEmpty) ...[
          const SizedBox(height: 16),
          GestureDetector(
            onTap: () => launchUrl(Uri.parse(item.linkUrl!), mode: LaunchMode.externalApplication),
            child: Text(item.linkLabel?.isNotEmpty == true ? item.linkLabel! : item.linkUrl!,
                style: TextStyle(fontSize: 12, color: c.primary)),
          ),
        ],
        if (footer != null) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.only(top: 8),
            decoration: BoxDecoration(border: Border(top: BorderSide(color: c.border))),
            child: footer,
          ),
        ],
      ]),
    );
  }

  /// A bet post's game: matchup + final score + stake (web GameRow).
  Widget _gameRow(WaygerzColors c, Map<String, dynamic> m) {
    final started = m['away_score'] != null && m['home_score'] != null;
    final cents = (m['amount_cents'] as num?)?.toInt() ?? 0;
    final stake = cents > 0 ? formatCredits(cents) : treatEmoji(m['treat'] as String?);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: c.muted.withValues(alpha: 0.4),
        border: Border.all(color: c.border),
        borderRadius: BorderRadius.circular(WaygerzRadius.lg),
      ),
      child: Row(children: [
        Expanded(
          child: Text(
            '${m['away'] ?? ''}${started ? ' ${m['away_score']}' : ''}  ${started ? '·' : '@'}  ${m['home'] ?? ''}${started ? ' ${m['home_score']}' : ''}',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground),
          ),
        ),
        Text('$stake${started ? ' · Final' : ''}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: c.mutedForeground)),
      ]),
    );
  }
}

/// React button (tap for the seven-reaction bar; tapping your own clears it)
/// plus the top emoji + count, which opens who reacted (web ReactionControl).
class ReactionControl extends StatefulWidget {
  const ReactionControl({super.key, required this.api, required this.postId, required this.engagement, required this.onChanged});
  final ApiClient api;
  final String postId;
  final PostEngagement engagement;
  final VoidCallback onChanged;

  @override
  State<ReactionControl> createState() => _ReactionControlState();
}

class _ReactionControlState extends State<ReactionControl> {
  bool _busy = false;

  Future<void> _pick(String key) async {
    final toast = Toaster.of(context);
    setState(() => _busy = true);
    try {
      final api = CommentsApi(widget.api);
      key == widget.engagement.mine ? await api.removeReaction(widget.postId) : await api.setReaction(widget.postId, key);
      widget.onChanged();
    } catch (e) {
      toast.failure(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openBar(BuildContext anchor) async {
    final box = anchor.findRenderObject() as RenderBox;
    final overlay = Overlay.of(anchor).context.findRenderObject() as RenderBox;
    final at = box.localToGlobal(Offset.zero, ancestor: overlay);
    final c = WaygerzColors.of(context);
    final key = await showMenu<String>(
      context: context,
      color: c.card,
      shape: const StadiumBorder(),
      position: RelativeRect.fromLTRB(at.dx, at.dy - 64, overlay.size.width - at.dx, 0),
      items: [
        PopupMenuItem<String>(
          enabled: false,
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Builder(builder: (ctx) {
            return Row(mainAxisSize: MainAxisSize.min, children: [
              for (final r in reactions.entries)
                Semantics(
                  label: r.value.$2,
                  button: true,
                  selected: widget.engagement.mine == r.key,
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: () => Navigator.of(ctx).pop(r.key),
                    child: Container(
                      width: 40,
                      height: 40,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: widget.engagement.mine == r.key ? c.primary.withValues(alpha: 0.15) : null,
                      ),
                      child: Text(r.value.$1, style: const TextStyle(fontSize: 22)),
                    ),
                  ),
                ),
            ]);
          }),
        ),
      ],
    );
    if (key != null) await _pick(key);
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final e = widget.engagement;
    final mine = e.mine;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Builder(
        builder: (anchor) => _ghost(
          c,
          LucideIcons.smilePlus,
          mine != null ? reactions[mine]?.$2 ?? 'React' : 'React',
          _busy ? () {} : () => _openBar(anchor),
          color: mine != null ? c.primary : null,
          lead: mine != null ? Text(reactionsEmoji(mine), style: const TextStyle(fontSize: 16)) : null,
        ),
      ),
      if (e.total > 0)
        InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: () => _showReactors(context),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Semantics(
              label: 'See who reacted',
              child: Text('${e.topEmojis} ${e.total}', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
            ),
          ),
        ),
    ]);
  }

  void _showReactors(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        final c = WaygerzColors.of(ctx);
        return ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * 0.7),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text('Reactions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.foreground)),
            ),
            Divider(color: c.border),
            Flexible(
              child: FutureBuilder<List<Reactor>>(
                future: CommentsApi(widget.api).reactors(widget.postId),
                builder: (ctx, snap) {
                  if (snap.data == null && snap.connectionState == ConnectionState.waiting) {
                    return const Padding(padding: EdgeInsets.all(16), child: Skeleton(height: 36));
                  }
                  final list = snap.data ?? const <Reactor>[];
                  if (list.isEmpty) {
                    return Padding(padding: const EdgeInsets.all(24),
                        child: Text('No reactions yet.', textAlign: TextAlign.center, style: TextStyle(color: c.mutedForeground)));
                  }
                  return ListView(shrinkWrap: true, padding: const EdgeInsets.all(8), children: [
                    for (final r in list)
                      ListTile(
                        leading: UserAvatar(userId: r.userId, name: r.displayName ?? 'Member', avatarKey: r.avatarKey, size: 36),
                        title: Text(r.displayName ?? 'Member', style: const TextStyle(fontSize: 14)),
                        trailing: Text(reactionsEmoji(r.reaction), style: const TextStyle(fontSize: 20)),
                      ),
                  ]);
                },
              ),
            ),
          ]),
        );
      },
    );
  }
}

/// The post with its comments and a pinned composer (web PostContent).
Future<void> showPostSheet(
  BuildContext context, {
  required ApiClient api,
  required FeedItem item,
  required PostEngagement engagement,
  required String me,
  required String? Function(String) avatarFor,
  required VoidCallback onChanged,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _PostSheet(api: api, item: item, engagement: engagement, me: me, avatarFor: avatarFor, onChanged: onChanged),
  );
}

class _PostSheet extends StatefulWidget {
  const _PostSheet({required this.api, required this.item, required this.engagement, required this.me, required this.avatarFor, required this.onChanged});
  final ApiClient api;
  final FeedItem item;
  final PostEngagement engagement;
  final String me;
  final String? Function(String) avatarFor;
  final VoidCallback onChanged;

  @override
  State<_PostSheet> createState() => _PostSheetState();
}

class _PostSheetState extends State<_PostSheet> {
  late final CommentsApi _comments = CommentsApi(widget.api);
  late Future<List<PostComment>> _future = _comments.list(widget.item.id);
  late PostEngagement _engagement = widget.engagement;
  final _draft = TextEditingController();
  PostComment? _replyTo;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _draft.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _draft.dispose();
    super.dispose();
  }

  void _reload() {
    setState(() => _future = _comments.list(widget.item.id));
    widget.onChanged();
  }

  Future<void> _refreshEngagement() async {
    widget.onChanged();
    final e = await _comments.engagement([widget.item.id]).catchError((_) => <String, PostEngagement>{});
    if (mounted && e[widget.item.id] != null) setState(() => _engagement = e[widget.item.id]!);
  }

  Future<void> _send() async {
    final toast = Toaster.of(context);
    setState(() => _sending = true);
    try {
      await _comments.create(widget.item.id, _draft.text.trim(), parentId: _replyTo?.id);
      _draft.clear();
      setState(() => _replyTo = null);
      _reload();
    } catch (e) {
      toast.failure(e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _delete(PostComment comment) async {
    final toast = Toaster.of(context);
    try {
      await _comments.delete(comment.id);
      _reload();
    } catch (e) {
      toast.failure(e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Flexible(
            child: ListView(shrinkWrap: true, children: [
              PostHeader(
                item: widget.item,
                avatarKey: widget.item.authorId == null ? null : widget.avatarFor(widget.item.authorId!),
                footer: Row(children: [
                  ReactionControl(api: widget.api, postId: widget.item.id, engagement: _engagement, onChanged: _refreshEngagement),
                ]),
              ),
              Container(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
                decoration: BoxDecoration(border: Border(top: BorderSide(color: c.border))),
                child: FutureBuilder<List<PostComment>>(
                  future: _future,
                  builder: (context, snap) {
                    if (snap.data == null && snap.connectionState == ConnectionState.waiting) {
                      return Text('Loading comments…', style: TextStyle(fontSize: 12, color: c.mutedForeground));
                    }
                    final list = snap.data ?? const <PostComment>[];
                    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      if (list.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: Text('${list.length} COMMENT${list.length == 1 ? '' : 'S'}',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.5, color: c.mutedForeground)),
                        ),
                      for (final cm in list) _thread(c, cm, 0),
                    ]);
                  },
                ),
              ),
            ]),
          ),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(border: Border(top: BorderSide(color: c.border))),
            child: SafeArea(
              top: false,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (_replyTo != null)
                  Row(children: [
                    Text.rich(TextSpan(children: [
                      const TextSpan(text: 'Replying to '),
                      TextSpan(text: _replyTo!.authorName ?? 'member', style: TextStyle(fontWeight: FontWeight.w500, color: c.foreground)),
                    ]), style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                    TextButton(onPressed: () => setState(() => _replyTo = null), child: const Text('Cancel')),
                  ]),
                Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Expanded(
                    child: TextField(
                      controller: _draft,
                      minLines: 1,
                      maxLines: 5,
                      style: const TextStyle(fontSize: 14),
                      decoration: InputDecoration(hintText: _replyTo != null ? 'Write a reply…' : 'Write a comment…', isDense: true),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    tooltip: _replyTo != null ? 'Send reply' : 'Post comment',
                    onPressed: _sending || _draft.text.trim().isEmpty ? null : _send,
                    icon: const Icon(LucideIcons.send, size: 16),
                  ),
                ]),
              ]),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _thread(WaygerzColors c, PostComment cm, int depth) {
    final own = cm.authorId == widget.me;
    final body = Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          UserAvatar(userId: cm.authorId, name: cm.authorName ?? 'Member', avatarKey: widget.avatarFor(cm.authorId), size: 32),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(child: Text(cm.authorName ?? 'Member', maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: c.foreground))),
                const SizedBox(width: 6),
                Text(timeAgo(cm.createdAt), style: TextStyle(fontSize: 14, color: c.mutedForeground)),
                const Spacer(),
                if (depth == 0)
                  GestureDetector(
                    onTap: () => setState(() => _replyTo = cm),
                    child: Text('Reply', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.primary)),
                  ),
              ]),
              const SizedBox(height: 4),
              Text(cm.body, style: TextStyle(fontSize: 16, color: c.foreground)),
            ]),
          ),
          if (own)
            IconButton(
              visualDensity: VisualDensity.compact,
              tooltip: 'Delete comment',
              icon: Icon(LucideIcons.trash2, size: 14, color: c.mutedForeground),
              onPressed: () => _delete(cm),
            ),
        ]),
        for (final r in cm.replies) _thread(c, r, depth + 1),
      ]),
    );
    if (depth == 0) return body;
    return Container(
      margin: const EdgeInsets.only(left: 20, top: 12),
      padding: const EdgeInsets.only(left: 16),
      decoration: BoxDecoration(border: Border(left: BorderSide(color: c.border))),
      child: body,
    );
  }
}
