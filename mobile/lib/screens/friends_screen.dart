import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../api/api_client.dart';
import '../api/friends_api.dart';
import '../api/invites_api.dart';
import '../api/messaging_api.dart';
import '../auth/auth_controller.dart';
import '../config.dart';
import '../shell/app_header.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import '../widgets/user_mini_card.dart';
import 'chat_screen.dart';

/// Friends (web app/(app)/friends/page.tsx): share your friend link, incoming
/// requests (Accept / Decline), your friends (Message, Remove), pending sent.
class FriendsScreen extends StatefulWidget {
  const FriendsScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<FriendsScreen> createState() => _FriendsScreenState();
}

class _FriendsData {
  _FriendsData(this.friends, this.incoming, this.outgoing);
  final List<Friend> friends;
  final List<FriendRequest> incoming;
  final List<FriendRequest> outgoing;
}

class _FriendsScreenState extends State<FriendsScreen> {
  late final FriendsApi _friends = FriendsApi(widget.api);
  late Future<_FriendsData> _future = _load();
  String _q = '';

  Future<_FriendsData> _load() async {
    final results = await Future.wait([_friends.list(), _friends.requests()]);
    final reqs = results[1] as ({List<FriendRequest> incoming, List<FriendRequest> outgoing});
    return _FriendsData(results[0] as List<Friend>, reqs.incoming, reqs.outgoing);
  }

  Future<void> _reload() async {
    final f = _load();
    setState(() => _future = f);
    await f;
  }

  Future<void> _run(Future<void> Function() call, String? ok) async {
    final toast = Toaster.of(context);
    try {
      await call();
      if (ok != null) toast.success(ok);
      await _reload();
    } catch (e) {
      toast.failure(e);
    }
  }

  /// Share the personal, reusable friend link (a code, never the raw user id).
  Future<void> _share() async {
    final toast = Toaster.of(context);
    final name = context.read<AuthController>().user?.displayName ?? 'A friend';
    try {
      final code = await InvitesApi(widget.api).myFriendCode();
      await SharePlus.instance.share(ShareParams(
        text: '$name wants to be friends on Waygerz\n${Config.webBaseUrl}/c/$code',
        subject: 'Add me on Waygerz',
      ));
    } catch (e) {
      toast.failure(e);
    }
  }

  Future<void> _message(String userId) async {
    final toast = Toaster.of(context);
    final nav = Navigator.of(context);
    try {
      final conv = await MessagingApi(widget.api).openDirect(userId);
      nav.push(MaterialPageRoute<void>(
          builder: (_) => ChatScreen(api: widget.api, conversation: conv, title: conv.title(const {}))));
    } catch (e) {
      toast.failure(e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    Widget heading(String t) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text(t, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
        );
    return Scaffold(
      appBar: const WaygerzHeader.page('Friends'),
      body: SafeArea(top: false, child: RefreshIndicator(
        onRefresh: _reload,
        child: FutureBuilder<_FriendsData>(
          future: _future,
          builder: (context, snap) {
            final d = snap.data;
            final body = <Widget>[
              Align(
                alignment: Alignment.centerLeft,
                child: WzButton(label: 'Add Friends', icon: LucideIcons.share2, size: ButtonSize.sm,
                    variant: ButtonVariant.outline, onPressed: _share),
              ),
              const SizedBox(height: 24),
            ];
            if (d == null && snap.connectionState == ConnectionState.waiting) {
              body.addAll(List.generate(4, (_) => const Padding(
                    padding: EdgeInsets.only(bottom: 12),
                    child: Skeleton(height: 72, radius: WaygerzRadius.xl),
                  )));
            } else if (snap.hasError) {
              body.add(ErrorCard(title: "Couldn't load your friends", error: snap.error, onRetry: _reload));
            } else {
              final q = _q.trim().toLowerCase();
              final shown = q.isEmpty ? d!.friends : d!.friends.where((f) => f.displayName.toLowerCase().contains(q)).toList();
              if (d.incoming.isNotEmpty) {
                body.add(heading('Requests (${d.incoming.length})'));
                for (final r in d.incoming) {
                  body.add(Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: UserMiniCard(userId: r.userId, name: r.displayName, avatarKey: r.avatarKey, subtitle: 'Wants to be friends', actions: [
                      WzButton(label: 'Accept', size: ButtonSize.sm, onPressed: () => _run(() => _friends.accept(r.id), 'Friend added')),
                      WzButton(label: 'Decline', size: ButtonSize.sm, variant: ButtonVariant.outline,
                          onPressed: () => _run(() => _friends.decline(r.id), null)),
                    ]),
                  ));
                }
                body.add(const SizedBox(height: 20));
              }
              body.add(heading('Your friends (${d.friends.length})'));
              if (d.friends.length > 8) {
                body.addAll([SearchField(hint: 'Search friends', onChanged: (v) => setState(() => _q = v)), const SizedBox(height: 12)]);
              }
              if (d.friends.isEmpty) {
                body.add(CenterCard(children: [
                  Icon(LucideIcons.users, size: 24, color: c.mutedForeground),
                  Text('No friends yet — share your link or add someone from a league members page.',
                      textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
                ]));
              } else if (shown.isEmpty) {
                body.add(CenterCard(children: [
                  Icon(LucideIcons.search, size: 24, color: c.mutedForeground),
                  Text('No friends match “${_q.trim()}”.', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
                ]));
              } else {
                for (final f in shown) {
                  body.add(Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: UserMiniCard(userId: f.userId, name: f.displayName, avatarKey: f.avatarKey, actions: [
                      IconAction(icon: LucideIcons.messageCircle, tooltip: 'Message', onPressed: () => _message(f.userId)),
                      IconAction(
                        icon: LucideIcons.userMinus,
                        tooltip: 'Remove friend',
                        color: c.destructive,
                        onPressed: () async {
                          final ok = await confirmWz(context, title: 'Remove friend?',
                              description: 'Remove ${f.displayName} from your friends?', confirmLabel: 'Remove', destructive: true);
                          if (ok) await _run(() => _friends.remove(f.userId), 'Friend removed');
                        },
                      ),
                    ]),
                  ));
                }
              }
              if (d.outgoing.isNotEmpty) {
                body.addAll([const SizedBox(height: 20), heading('Pending sent')]);
                for (final r in d.outgoing) {
                  body.add(Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: UserMiniCard(userId: r.userId, name: r.displayName, avatarKey: r.avatarKey, subtitle: 'Pending…'),
                  ));
                }
              }
            }
            return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: body);
          },
        ),
      )),
    );
  }
}
