import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../api/comments_api.dart';
import '../../api/leagues_api.dart';
import '../../auth/auth_controller.dart';
import '../../models.dart';
import '../../theme/app_theme.dart';
import '../../ui/ui.dart';
import '../../widgets/feed_post.dart';
import '../widgets.dart';

/// The league Feed (web leagues/[id]/feed.tsx): description, the announcement
/// composer (commissioner / moderators), posts with reactions and comments,
/// and Leave league for everyone but the commissioner.
class FeedTab extends StatefulWidget {
  const FeedTab({super.key, required this.api, required this.league, required this.header, required this.onRefresh, required this.onLeft});
  final ApiClient api;
  final League league;
  final List<Widget> header;
  final Future<void> Function() onRefresh;

  /// After the viewer leaves the league.
  final VoidCallback onLeft;

  @override
  State<FeedTab> createState() => _FeedTabState();
}

class _FeedTabState extends State<FeedTab> {
  late final LeaguesApi _leagues = LeaguesApi(widget.api);
  late final CommentsApi _comments = CommentsApi(widget.api);
  late Future<List<FeedItem>> _feed = _leagues.feed(widget.league.id);
  Map<String, PostEngagement> _engagement = {};

  @override
  void initState() {
    super.initState();
    _feed.then(_loadEngagement).catchError((_) {});
  }

  Future<void> _loadEngagement(List<FeedItem> items) async {
    final e = await _comments.engagement([for (final i in items) i.id]).catchError((_) => <String, PostEngagement>{});
    if (mounted) setState(() => _engagement = e);
  }

  Future<void> _reload() async {
    final f = _leagues.feed(widget.league.id);
    setState(() => _feed = f);
    await Future.wait([f.then(_loadEngagement), widget.onRefresh()]);
  }

  Future<void> _refreshEngagement() async {
    final items = await _feed.catchError((_) => <FeedItem>[]);
    await _loadEngagement(items);
  }

  Future<void> _compose() async {
    final posted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _Composer(api: widget.api, league: widget.league),
    );
    if (posted == true) await _reload();
  }

  Future<void> _leave() async {
    final ok = await confirmWz(
      context,
      title: 'Leave ${widget.league.name}?',
      description: "You will lose access to this league's feed, bets, standings, and chat. "
          'You can rejoin later with the invite link if the league is still open.',
      confirmLabel: 'Leave league',
      destructive: true,
    );
    if (!ok || !mounted) return;
    final toast = Toaster.of(context);
    try {
      await _leagues.leave(widget.league.id);
      toast.success('You left the league');
      widget.onLeft();
    } catch (e) {
      toast.failure(e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final lg = widget.league;
    final user = context.read<AuthController>().user;
    final me = user?.id ?? '';
    final isCommish = lg.myRole == 'commissioner';
    final canModerate = isCommish || lg.myRole == 'moderator';
    final avatars = {for (final m in lg.members) m.userId: m.avatarKey};
    String? avatarFor(String id) => avatars[id];

    return RefreshIndicator(
      onRefresh: _reload,
      child: FutureBuilder<List<FeedItem>>(
        future: _feed,
        builder: (context, snap) {
          final items = snap.data;
          return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [
            ...widget.header,
            if ((lg.description ?? '').isNotEmpty) ...[
              WzCard(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('DESCRIPTION', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, letterSpacing: 0.5, color: c.mutedForeground)),
                  const SizedBox(height: 8),
                  Text(lg.description!, style: TextStyle(fontSize: 14, color: c.foreground)),
                ]),
              ),
              const SizedBox(height: 24),
            ],
            if (canModerate) ...[
              WzCard(
                padding: const EdgeInsets.all(12),
                child: Row(children: [
                  if (user != null) ...[
                    UserAvatar(userId: user.id, name: user.displayName, avatarKey: user.avatarKey, size: 40),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(999),
                      onTap: _compose,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        decoration: BoxDecoration(
                          color: c.muted.withValues(alpha: 0.5),
                          border: Border.all(color: c.input),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text('Post an update to your league…', maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 14, color: c.mutedForeground)),
                      ),
                    ),
                  ),
                ]),
              ),
              const SizedBox(height: 12),
            ],
            if (items == null && snap.connectionState == ConnectionState.waiting)
              ...List.generate(3, (_) => const Padding(
                    padding: EdgeInsets.only(bottom: 16),
                    child: Skeleton(height: 120, radius: WaygerzRadius.xl),
                  ))
            else if (snap.hasError)
              ErrorCard(title: "Couldn't load the feed", error: snap.error, onRetry: _reload)
            else if (items!.isEmpty)
              CenterCard(padding: const EdgeInsets.all(32), children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [c.primary.withValues(alpha: 0.15), c.brand.withValues(alpha: 0.15)],
                        begin: Alignment.topLeft, end: Alignment.bottomRight),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(LucideIcons.rss, size: 24, color: c.primary),
                ),
                Text('No activity yet', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
                Text('League updates, results, and announcements will show up here.',
                    textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: c.mutedForeground)),
              ])
            else
              for (final item in items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: FeedPostCard(
                    api: widget.api,
                    item: item,
                    engagement: _engagement[item.id] ?? PostEngagement.empty,
                    me: me,
                    avatarFor: avatarFor,
                    onChanged: _refreshEngagement,
                  ),
                ),
            if (!isCommish) ...[
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: WzButton(label: 'Leave league', variant: ButtonVariant.outline, onPressed: _leave),
              ),
            ],
          ]);
        },
      ),
    );
  }
}

class _Composer extends StatefulWidget {
  const _Composer({required this.api, required this.league});
  final ApiClient api;
  final League league;

  @override
  State<_Composer> createState() => _ComposerState();
}

class _ComposerState extends State<_Composer> {
  final _text = TextEditingController();
  bool _posting = false;

  @override
  void initState() {
    super.initState();
    _text.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _post() async {
    final toast = Toaster.of(context);
    final nav = Navigator.of(context);
    setState(() => _posting = true);
    try {
      await LeaguesApi(widget.api).postFeed(widget.league.id, _text.text.trim());
      nav.pop(true);
    } catch (e) {
      toast.failure(e);
      if (mounted) setState(() => _posting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Post to ${widget.league.name}', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: c.foreground)),
        const SizedBox(height: 12),
        TextField(
          controller: _text,
          autofocus: true,
          minLines: 5,
          maxLines: 10,
          style: const TextStyle(fontSize: 16),
          decoration: const InputDecoration(hintText: "What's on your mind?"),
        ),
        const SizedBox(height: 16),
        WzButton(
          label: _posting ? 'Posting…' : 'Post',
          expand: true,
          busy: _posting,
          onPressed: _posting || _text.text.trim().isEmpty ? null : _post,
        ),
      ]),
    );
  }
}
