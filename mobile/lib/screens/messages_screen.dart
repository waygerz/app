import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/leagues_api.dart';
import '../api/messaging_api.dart';
import '../auth/auth_controller.dart';
import '../format.dart';
import '../models.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import 'chat_screen.dart';
import 'widgets.dart';

/// The Messages inbox (web app/(app)/messages/page.tsx): unread chats first
/// (with Mark all read), then earlier ones; league chats and direct messages
/// in one list. Empty: start a league chat.
class MessagesScreen extends StatefulWidget {
  const MessagesScreen({super.key, required this.api, this.onChanged});
  final ApiClient api;

  /// After chats are read (the shell refreshes its badge).
  final VoidCallback? onChanged;

  @override
  State<MessagesScreen> createState() => MessagesScreenState();
}

class MessagesScreenState extends State<MessagesScreen> {
  late final MessagingApi _messaging = MessagingApi(widget.api);
  late Future<List<Conversation>> _future = _messaging.conversations();
  late final Future<List<League>> _leagues = LeaguesApi(widget.api).myLeagues();
  Map<String, String> _names = {};
  bool _markingAll = false;

  @override
  void initState() {
    super.initState();
    _leagues.then((ls) {
      if (mounted) setState(() => _names = {for (final l in ls) l.id: l.name});
    }).catchError((_) {});
  }

  /// Reload (the shell calls this when the tab is shown).
  Future<void> reload() async {
    final f = _messaging.conversations();
    setState(() => _future = f);
    await f;
  }

  Future<void> _open(Conversation conv) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(
      builder: (_) => ChatScreen(api: widget.api, conversation: conv, title: conv.title(_names)),
    ));
    widget.onChanged?.call();
    await reload();
  }

  Future<void> _openLeague(League lg) async {
    final toast = Toaster.of(context);
    try {
      await _open(await _messaging.openLeague(lg.id));
    } catch (e) {
      toast.failure(e);
    }
  }

  Future<void> _markAll(List<Conversation> unread) async {
    setState(() => _markingAll = true);
    await Future.wait(unread.map((c) => _messaging.markRead(c.id).catchError((_) {})));
    widget.onChanged?.call();
    if (mounted) setState(() => _markingAll = false);
    await reload();
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return RefreshIndicator(
      onRefresh: reload,
      child: FutureBuilder<List<Conversation>>(
        future: _future,
        builder: (context, snap) {
          final convs = snap.data;
          final body = <Widget>[];
          if (convs == null && snap.connectionState == ConnectionState.waiting) {
            body.addAll(List.generate(6, (_) => const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  child: Row(children: [
                    Skeleton(width: 46, height: 46, circle: true),
                    SizedBox(width: 12),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      SkeletonLine(widthFactor: 0.4, height: 14),
                      SizedBox(height: 6),
                      SkeletonLine(widthFactor: 0.75, height: 12),
                    ])),
                  ]),
                )));
          } else if (snap.hasError) {
            body.add(ErrorCard(title: "Couldn't load your messages", error: snap.error, onRetry: reload));
          } else if (convs!.isEmpty) {
            body.add(FutureBuilder<List<League>>(
              future: _leagues,
              builder: (context, ls) => CenterCard(children: [
                Icon(LucideIcons.messagesSquare, size: 24, color: c.mutedForeground),
                Text('No conversations yet.', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
                if ((ls.data ?? const []).isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text('START A LEAGUE CHAT', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, letterSpacing: 0.5, color: c.mutedForeground)),
                  for (final lg in ls.data!)
                    WzButton(label: lg.name, size: ButtonSize.sm, variant: ButtonVariant.outline, expand: true,
                        onPressed: () => _openLeague(lg)),
                ],
              ]),
            ));
          } else {
            int at(Conversation x) => DateTime.tryParse(x.lastMessage?.createdAt ?? '')?.millisecondsSinceEpoch ?? 0;
            final unread = convs.where((x) => x.unreadCount > 0).toList()..sort((a, b) => at(b).compareTo(at(a)));
            final earlier = convs.where((x) => x.unreadCount == 0).toList()..sort((a, b) => at(b).compareTo(at(a)));
            if (unread.isNotEmpty) {
              body.add(_groupHeader(c, 'UNREAD · ${unread.length}',
                  action: TextButton(
                    onPressed: _markingAll ? null : () => _markAll(unread),
                    child: Text('Mark all read', style: TextStyle(fontSize: 11, color: c.primary)),
                  )));
              body.addAll(unread.map((x) => _row(context, x)));
            }
            if (earlier.isNotEmpty) {
              body.add(_groupHeader(c, 'EARLIER'));
              body.addAll(earlier.map((x) => _row(context, x)));
            }
          }
          return ListView(padding: const EdgeInsets.fromLTRB(8, 12, 8, 32), children: body);
        },
      ),
    );
  }

  Widget _groupHeader(WaygerzColors c, String label, {Widget? action}) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
        child: Row(children: [
          Expanded(child: Text(label, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w500, letterSpacing: 1.6,
              color: c.mutedForeground.withValues(alpha: 0.7)))),
          if (action != null) action,
        ]),
      );

  Widget _row(BuildContext context, Conversation conv) {
    final c = WaygerzColors.of(context);
    final me = context.read<AuthController>().user?.id;
    final title = conv.title(_names);
    final isLeague = conv.type == 'league' && conv.leagueId != null;
    final unread = conv.unreadCount;
    final lm = conv.lastMessage;
    final mine = lm != null && lm.authorId == me;
    final preview = (lm?.body.trim() ?? '').isEmpty
        ? 'No messages yet'
        : '${mine ? 'You: ' : isLeague && lm!.authorName != null ? '${lm.authorName}: ' : ''}${lm!.body.trim()}';

    return Material(
      color: unread > 0 ? c.primary.withValues(alpha: 0.06) : Colors.transparent,
      borderRadius: BorderRadius.circular(WaygerzRadius.xl),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => _open(conv),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(children: [
            SizedBox(
              width: 50,
              height: 50,
              child: Stack(clipBehavior: Clip.none, children: [
                isLeague
                    ? LeagueAvatar(name: title, id: conv.leagueId, size: 46)
                    : UserAvatar(userId: conv.otherUser?.id ?? conv.id, name: title, avatarKey: conv.otherUser?.avatarKey, size: 46),
                if (isLeague)
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      width: 19,
                      height: 19,
                      decoration: BoxDecoration(color: c.muted, shape: BoxShape.circle, border: Border.all(color: c.background, width: 2)),
                      child: Icon(LucideIcons.users, size: 10, color: c.mutedForeground),
                    ),
                  ),
              ]),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 14, fontWeight: unread > 0 ? FontWeight.w700 : FontWeight.w600, color: c.foreground))),
                  if (lm != null)
                    Text(shortAgo(lm.createdAt), style: TextStyle(fontSize: 11, color: unread > 0 ? c.primary : c.mutedForeground)),
                ]),
                const SizedBox(height: 2),
                Row(children: [
                  Expanded(child: Text(preview, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, color: c.mutedForeground.withValues(alpha: unread > 0 ? 1 : 0.8)))),
                  if (unread > 0)
                    Container(
                      height: 20,
                      constraints: const BoxConstraints(minWidth: 20),
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: c.primary, borderRadius: BorderRadius.circular(10)),
                      child: Text(unread > 9 ? '9+' : '$unread', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                          color: Theme.of(context).colorScheme.onPrimary)),
                    ),
                ]),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}
