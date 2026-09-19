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

// The feed is a timeline (web leagues/[id]/feed-post.tsx): people's posts are
// rows with an icon action bar and the newest comment inline; system activity
// (joins, bets, weekly results) is a one-line row. Comments open in a sheet.

/// Per-event icon + tint (web EVENT_STYLE). A `label` marks a bet event, whose
/// text is the post body ("Sam won $40 from Riley").
({IconData icon, Color bg, Color fg, Gradient? gradient, String? label}) _eventStyle(
    BuildContext context, String? type) {
  final c = WaygerzColors.of(context);
  final dark = Theme.of(context).brightness == Brightness.dark;
  const blue600 = Color(0xFF2563EB);
  const blue400 = Color(0xFF60A5FA);
  const sky600 = Color(0xFF0284C7);
  const sky400 = Color(0xFF38BDF8);
  final bet = (Tw.blue500.withValues(alpha: 0.15), dark ? blue400 : blue600);
  return switch (type) {
    'league_created' => (
        icon: LucideIcons.partyPopper,
        bg: c.brand.withValues(alpha: 0.15),
        fg: c.brand,
        gradient: null,
        label: null
      ),
    'member_joined' => (
        icon: LucideIcons.userPlus,
        bg: Tw.sky500.withValues(alpha: 0.15),
        fg: dark ? sky400 : sky600,
        gradient: null,
        label: null
      ),
    'period_opened' => (
        icon: LucideIcons.calendarClock,
        bg: Tw.amber500.withValues(alpha: 0.15),
        fg: dark ? Tw.amber400 : Tw.amber600,
        gradient: null,
        label: null
      ),
    'period_final' => (
        icon: LucideIcons.trophy,
        bg: Tw.violet500,
        fg: Colors.white,
        gradient: const LinearGradient(
            colors: [Tw.violet500, Tw.fuchsia500], begin: Alignment.topLeft, end: Alignment.bottomRight),
        label: null
      ),
    'wager_accepted' => (icon: LucideIcons.swords, bg: bet.$1, fg: bet.$2, gradient: null, label: 'Bet accepted'),
    'wager_settled' => (icon: LucideIcons.swords, bg: bet.$1, fg: bet.$2, gradient: null, label: 'Bet settled'),
    'wager_completed' => (icon: LucideIcons.swords, bg: bet.$1, fg: bet.$2, gradient: null, label: 'Bet result'),
    _ => (icon: LucideIcons.activity, bg: c.muted, fg: c.mutedForeground, gradient: null, label: null),
  };
}

/// Quick emoji for the comment composer — inserted into the text (web QUICK_EMOJI).
const _quickEmoji = ['🔥', '😂', '💰', '👍', '😭', '😮'];

/// The game behind a bet post, as one line: "LAC 17–24 KC · $40" (final) or
/// "LAC @ KC · $40" (web gameLine).
String? _gameLine(Map<String, dynamic> m) {
  if (m['away'] == null && m['home'] == null) return null;
  final started = m['away_score'] != null && m['home_score'] != null;
  final cents = (m['amount_cents'] as num?)?.toInt() ?? 0;
  final stake = cents > 0 ? formatCredits(cents) : treatEmoji(m['treat'] as String?);
  final game = started
      ? '${m['away'] ?? ''} ${m['away_score']}–${m['home_score']} ${m['home'] ?? ''}'
      : '${m['away'] ?? ''} @ ${m['home'] ?? ''}';
  return '$game · $stake';
}

/// What a post says (web postText): bet events lead with the body; other
/// activity with the title (a different body is the detail line).
({String primary, String? detail, String? game, bool showAvatar}) _postText(FeedItem item, String? label) {
  final isBet = label != null;
  final primary = isBet
      ? (item.body ?? item.title ?? label)
      : item.kind == 'activity'
          ? (item.title ?? item.body ?? 'Update')
          : (item.body ?? '');
  final detail = !isBet &&
          item.kind == 'activity' &&
          (item.title ?? '').isNotEmpty &&
          (item.body ?? '').isNotEmpty &&
          item.body != item.title
      ? item.body
      : null;
  final game = isBet ? _gameLine(item.meta) : null;
  return (primary: primary, detail: detail, game: game, showAvatar: item.authorId != null && !isBet);
}

Widget _eventIcon(({IconData icon, Color bg, Color fg, Gradient? gradient, String? label}) ev, double size) =>
    Container(
      width: size,
      height: size,
      decoration:
          BoxDecoration(color: ev.gradient == null ? ev.bg : null, gradient: ev.gradient, shape: BoxShape.circle),
      child: Icon(ev.icon, size: size / 2, color: ev.fg),
    );

/// One feed item: a post row (announcements / people's posts) or an activity
/// row. Tapping the text, 💬, or the inline comment opens the comments sheet.
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
    void open() => showPostSheet(context,
        api: api, item: item, engagement: engagement, me: me, avatarFor: avatarFor, onChanged: onChanged);
    return item.kind == 'activity' ? _activity(context, open) : _post(context, open);
  }

  Widget _post(BuildContext context, VoidCallback open) {
    final c = WaygerzColors.of(context);
    final name = item.authorName ?? 'Member';
    final count = engagement.commentCount;
    final latest = engagement.latestComment;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (item.authorId != null)
          UserAvatar(userId: item.authorId!, name: name, avatarKey: avatarFor(item.authorId!), size: 40)
        else
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: c.primary.withValues(alpha: 0.15), shape: BoxShape.circle),
            child: Icon(LucideIcons.megaphone, size: 20, color: c.primary),
          ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Flexible(
                child: Text(name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.foreground)),
              ),
              if (item.kind == 'announcement') ...[
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration:
                      BoxDecoration(color: c.primary.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(999)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(LucideIcons.megaphone, size: 12, color: c.primary),
                    const SizedBox(width: 4),
                    Text('Announcement', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: c.primary)),
                  ]),
                ),
              ],
              const SizedBox(width: 6),
              Text('· ${shortAgo(item.createdAt)}', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
            ]),
            if ((item.title ?? '').isNotEmpty && item.title != name) ...[
              const SizedBox(height: 6),
              Text(item.title!, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
            ],
            if ((item.body ?? '').isNotEmpty) ...[
              const SizedBox(height: 6),
              GestureDetector(
                onTap: open,
                child: Text(item.body!, style: TextStyle(fontSize: 15, height: 1.5, color: c.foreground)),
              ),
            ],
            if ((item.linkUrl ?? '').isNotEmpty) ...[
              const SizedBox(height: 6),
              GestureDetector(
                onTap: () => launchUrl(Uri.parse(item.linkUrl!), mode: LaunchMode.externalApplication),
                child: Text(item.linkLabel?.isNotEmpty == true ? item.linkLabel! : item.linkUrl!,
                    style: TextStyle(fontSize: 12, color: c.primary)),
              ),
            ],
            const SizedBox(height: 2),
            // Action row: react (+ who reacted), comments.
            Transform.translate(
              offset: const Offset(-10, 0),
              child: Row(children: [
                ReactionControl(api: api, postId: item.id, engagement: engagement, onChanged: onChanged, compact: true),
                Semantics(
                  label: count > 0 ? '$count comment${count == 1 ? '' : 's'}' : 'Comment',
                  button: true,
                  excludeSemantics: true,
                  child: _ghost(c, LucideIcons.messageCircle, count > 0 ? '$count' : '', open),
                ),
              ]),
            ),
            // The newest comment, inline; the rest are one tap away.
            if (latest != null)
              GestureDetector(
                onTap: open,
                behavior: HitTestBehavior.opaque,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: UserAvatar(
                          userId: latest.authorId,
                          name: latest.authorName ?? 'Member',
                          avatarKey: avatarFor(latest.authorId),
                          size: 24),
                    ),
                    const SizedBox(width: 8),
                    Flexible(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(color: c.muted, borderRadius: BorderRadius.circular(16)),
                        child: Text.rich(
                          TextSpan(children: [
                            TextSpan(
                                text: '${latest.authorName ?? 'Member'}  ',
                                style: const TextStyle(fontWeight: FontWeight.w600)),
                            TextSpan(text: latest.body),
                          ]),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 14, color: c.foreground),
                        ),
                      ),
                    ),
                  ]),
                  if (count > 1)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text('View all $count comments',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.mutedForeground)),
                    ),
                ]),
              ),
          ]),
        ),
      ]),
    );
  }

  Widget _activity(BuildContext context, VoidCallback open) {
    final c = WaygerzColors.of(context);
    final ev = _eventStyle(context, item.eventType);
    final t = _postText(item, ev.label);
    final reactionsTotal = engagement.total;
    final comments = engagement.commentCount;
    final sub = t.game ?? t.detail;
    return InkWell(
      onTap: open,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
        child: Row(children: [
          if (t.showAvatar)
            UserAvatar(
                userId: item.authorId!,
                name: item.authorName ?? 'Member',
                avatarKey: avatarFor(item.authorId!),
                size: 32)
          else
            _eventIcon(ev, 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t.primary,
                  maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, color: c.foreground)),
              if (sub != null)
                Text(sub,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 12, color: c.mutedForeground, fontFeatures: const [FontFeature.tabularFigures()])),
            ]),
          ),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(shortAgo(item.createdAt), style: TextStyle(fontSize: 12, color: c.mutedForeground)),
            if (reactionsTotal > 0 || comments > 0)
              Row(mainAxisSize: MainAxisSize.min, children: [
                if (reactionsTotal > 0)
                  Text('${engagement.topEmojis.characters.take(2)} $reactionsTotal',
                      style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                if (comments > 0) ...[
                  const SizedBox(width: 6),
                  Icon(LucideIcons.messageCircle, size: 12, color: c.mutedForeground),
                  const SizedBox(width: 2),
                  Text('$comments', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                ],
              ]),
          ]),
        ]),
      ),
    );
  }
}

Widget _ghost(WaygerzColors c, IconData icon, String label, VoidCallback onTap, {Color? color, Widget? lead}) =>
    InkWell(
      borderRadius: BorderRadius.circular(WaygerzRadius.md),
      onTap: onTap,
      child: Container(
        height: 36,
        constraints: const BoxConstraints(minWidth: 40),
        padding: const EdgeInsets.symmetric(horizontal: 10),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          lead ?? Icon(icon, size: 16, color: color ?? c.mutedForeground),
          if (label.isNotEmpty) ...[
            const SizedBox(width: 6),
            Text(label, style: TextStyle(fontSize: 12, color: color ?? c.mutedForeground)),
          ],
        ]),
      ),
    );

/// React button (tap for the seven-reaction bar; tapping your own clears it)
/// plus the top emoji + count, which opens who reacted (web ReactionControl).
class ReactionControl extends StatefulWidget {
  const ReactionControl(
      {super.key,
      required this.api,
      required this.postId,
      required this.engagement,
      required this.onChanged,
      this.compact = false});
  final ApiClient api;
  final String postId;
  final PostEngagement engagement;
  final VoidCallback onChanged;

  /// Icon-only trigger (the feed's action row); the label goes to Semantics.
  final bool compact;

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
      key == widget.engagement.mine
          ? await api.removeReaction(widget.postId)
          : await api.setReaction(widget.postId, key);
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
      Semantics(
        label: widget.compact ? (mine != null ? 'Your reaction: ${reactions[mine]?.$2 ?? mine}' : 'React') : null,
        button: widget.compact,
        child: Builder(
          builder: (anchor) => _ghost(
            c,
            LucideIcons.smilePlus,
            widget.compact ? '' : (mine != null ? reactions[mine]?.$2 ?? 'React' : 'React'),
            _busy ? () {} : () => _openBar(anchor),
            color: mine != null ? c.primary : null,
            lead: mine != null ? Text(reactionsEmoji(mine), style: const TextStyle(fontSize: 16)) : null,
          ),
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
              child:
                  Text('Reactions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.foreground)),
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
                    return Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text('No reactions yet.',
                            textAlign: TextAlign.center, style: TextStyle(color: c.mutedForeground)));
                  }
                  return ListView(shrinkWrap: true, padding: const EdgeInsets.all(8), children: [
                    for (final r in list)
                      ListTile(
                        leading: UserAvatar(
                            userId: r.userId, name: r.displayName ?? 'Member', avatarKey: r.avatarKey, size: 36),
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

/// The post's comments in a bottom sheet (web CommentsSheet): a one-line post
/// summary with its reactions, threads (replies behind "View N replies"), a
/// "Replying to" chip, quick emoji, and a pill composer.
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
    showDragHandle: true,
    builder: (_) =>
        _PostSheet(api: api, item: item, engagement: engagement, me: me, avatarFor: avatarFor, onChanged: onChanged),
  );
}

class _PostSheet extends StatefulWidget {
  const _PostSheet(
      {required this.api,
      required this.item,
      required this.engagement,
      required this.me,
      required this.avatarFor,
      required this.onChanged});
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

  /// Threads whose replies are showing (collapsed behind "View N replies").
  final Set<String> _expanded = {};

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

  Future<void> _refreshEngagement() async {
    widget.onChanged();
    final e = await _comments.engagement([widget.item.id]).catchError((_) => <String, PostEngagement>{});
    if (mounted && e[widget.item.id] != null) setState(() => _engagement = e[widget.item.id]!);
  }

  void _reload() {
    setState(() => _future = _comments.list(widget.item.id));
    _refreshEngagement();
  }

  Future<void> _send() async {
    final text = _draft.text.trim();
    if (text.isEmpty || _sending) return;
    final toast = Toaster.of(context);
    setState(() => _sending = true);
    try {
      await _comments.create(widget.item.id, text, parentId: _replyTo?.id);
      _draft.clear();
      setState(() {
        if (_replyTo != null) _expanded.add(_replyTo!.id); // show the thread it went into
        _replyTo = null;
      });
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
    final item = widget.item;
    final ev = _eventStyle(context, item.eventType);
    final t = _postText(item, ev.label);
    final isPost = item.kind != 'activity';
    final count = _engagement.commentCount;
    final sub = t.game ?? t.detail;

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.85,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(count > 0 ? '$count comment${count == 1 ? '' : 's'}' : 'Comments',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.foreground)),
          ),
          // The post, summarized, with its reactions.
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            decoration: BoxDecoration(
              color: c.muted.withValues(alpha: 0.3),
              border: Border.symmetric(horizontal: BorderSide(color: c.border)),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if ((isPost || t.showAvatar) && item.authorId != null)
                UserAvatar(
                    userId: item.authorId!,
                    name: item.authorName ?? 'Member',
                    avatarKey: widget.avatarFor(item.authorId!),
                    size: 32)
              else
                _eventIcon(ev, 32),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text.rich(
                    TextSpan(children: [
                      if (isPost)
                        TextSpan(
                            text: '${item.authorName ?? 'Member'}  ',
                            style: const TextStyle(fontWeight: FontWeight.w600)),
                      TextSpan(text: t.primary),
                    ]),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, color: c.foreground),
                  ),
                  if (sub != null)
                    Text(sub,
                        style: TextStyle(
                            fontSize: 12,
                            color: c.mutedForeground,
                            fontFeatures: const [FontFeature.tabularFigures()])),
                  if ((item.linkUrl ?? '').isNotEmpty)
                    GestureDetector(
                      onTap: () => launchUrl(Uri.parse(item.linkUrl!), mode: LaunchMode.externalApplication),
                      child: Text(item.linkLabel?.isNotEmpty == true ? item.linkLabel! : item.linkUrl!,
                          style: TextStyle(fontSize: 12, color: c.primary)),
                    ),
                  Transform.translate(
                    offset: const Offset(-10, 0),
                    child: ReactionControl(
                        api: widget.api, postId: item.id, engagement: _engagement, onChanged: _refreshEngagement),
                  ),
                ]),
              ),
            ]),
          ),
          // Threads.
          Expanded(
            child: FutureBuilder<List<PostComment>>(
              future: _future,
              builder: (context, snap) {
                if (snap.data == null && snap.connectionState == ConnectionState.waiting) {
                  return Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text('Loading comments…', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                  );
                }
                final list = snap.data ?? const <PostComment>[];
                if (list.isEmpty) {
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 32),
                    child: Text('No comments yet. Start the conversation.',
                        textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
                  );
                }
                return ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 12), children: [
                  for (final cm in list) ...[
                    _comment(c, cm, reply: false),
                    if (cm.replies.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(left: 38, top: 10),
                        child: _expanded.contains(cm.id)
                            ? Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                                for (final r in cm.replies)
                                  Padding(
                                      padding: const EdgeInsets.only(bottom: 10), child: _comment(c, r, reply: true)),
                              ])
                            : InkWell(
                                onTap: () => setState(() => _expanded.add(cm.id)),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 4),
                                  child: Row(children: [
                                    Container(width: 24, height: 1, color: c.input),
                                    const SizedBox(width: 8),
                                    Text('View ${cm.replies.length} repl${cm.replies.length == 1 ? 'y' : 'ies'}',
                                        style: TextStyle(
                                            fontSize: 12, fontWeight: FontWeight.w600, color: c.mutedForeground)),
                                  ]),
                                ),
                              ),
                      ),
                    const SizedBox(height: 16),
                  ],
                ]);
              },
            ),
          ),
          // Composer: replying chip, quick emoji, pill input + send.
          Container(
            decoration: BoxDecoration(border: Border(top: BorderSide(color: c.border))),
            child: SafeArea(
              top: false,
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (_replyTo != null)
                  Container(
                    margin: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                    padding: const EdgeInsets.only(left: 12),
                    decoration: BoxDecoration(color: c.muted, borderRadius: BorderRadius.circular(WaygerzRadius.lg)),
                    child: Row(children: [
                      Expanded(
                        child: Text.rich(
                            TextSpan(children: [
                              const TextSpan(text: 'Replying to '),
                              TextSpan(
                                  text: _replyTo!.authorName ?? 'member',
                                  style: TextStyle(fontWeight: FontWeight.w600, color: c.foreground)),
                            ]),
                            style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                      ),
                      IconButton(
                        tooltip: 'Cancel reply',
                        visualDensity: VisualDensity.compact,
                        onPressed: () => setState(() => _replyTo = null),
                        icon: Icon(LucideIcons.x, size: 14, color: c.mutedForeground),
                      ),
                    ]),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
                  child: Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
                    for (final e in _quickEmoji)
                      Semantics(
                        label: 'Add $e',
                        button: true,
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: () {
                            _draft.text = _draft.text + e;
                            _draft.selection = TextSelection.collapsed(offset: _draft.text.length);
                          },
                          child: SizedBox(
                              width: 40,
                              height: 40,
                              child: Center(child: Text(e, style: const TextStyle(fontSize: 20)))),
                        ),
                      ),
                  ]),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Expanded(
                      child: TextField(
                        controller: _draft,
                        minLines: 1,
                        maxLines: 4,
                        textInputAction: TextInputAction.newline,
                        style: const TextStyle(fontSize: 14),
                        decoration: InputDecoration(
                          hintText:
                              _replyTo != null ? 'Reply to ${_replyTo!.authorName ?? 'member'}…' : 'Add a comment…',
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
                          border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: c.input)),
                          enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: c.input)),
                          focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24), borderSide: BorderSide(color: c.primary)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton.filled(
                      tooltip: _replyTo != null ? 'Send reply' : 'Post comment',
                      onPressed: _sending || _draft.text.trim().isEmpty ? null : _send,
                      icon: const Icon(LucideIcons.arrowUp, size: 18),
                    ),
                  ]),
                ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }

  /// A comment: avatar, "name  2h", the text, then Reply (top level) / Delete (own).
  Widget _comment(WaygerzColors c, PostComment cm, {required bool reply}) {
    final own = cm.authorId == widget.me;
    final muted = TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.mutedForeground);
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      UserAvatar(
          userId: cm.authorId, name: cm.authorName ?? 'Member', avatarKey: widget.avatarFor(cm.authorId), size: 28),
      const SizedBox(width: 10),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text.rich(
              TextSpan(children: [
                TextSpan(
                    text: '${cm.authorName ?? 'Member'}  ',
                    style: TextStyle(fontWeight: FontWeight.w600, color: c.foreground)),
                TextSpan(text: shortAgo(cm.createdAt)),
              ]),
              style: TextStyle(fontSize: 12, color: c.mutedForeground)),
          const SizedBox(height: 2),
          Text(cm.body, style: TextStyle(fontSize: 14, color: c.foreground)),
          if (!reply || own)
            Row(children: [
              if (!reply)
                InkWell(
                  onTap: () => setState(() => _replyTo = cm),
                  child: Padding(padding: const EdgeInsets.fromLTRB(0, 6, 16, 4), child: Text('Reply', style: muted)),
                ),
              if (own)
                InkWell(
                  onTap: () => _delete(cm),
                  child: Padding(padding: const EdgeInsets.fromLTRB(0, 6, 16, 4), child: Text('Delete', style: muted)),
                ),
            ]),
        ]),
      ),
    ]);
  }
}
