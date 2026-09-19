import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../api/friends_api.dart';
import '../../api/leagues_api.dart';
import '../../api/messaging_api.dart';
import '../../auth/auth_controller.dart';
import '../../format.dart';
import '../../models.dart';
import '../../theme/app_theme.dart';
import '../../ui/ui.dart';
import '../../widgets/user_mini_card.dart';
import '../chat_screen.dart';

/// League Members (web _sections/members.tsx): each member with Message and
/// Add friend / Friends / Pending, plus a per-member menu — commissioners
/// set moderators, transfer the league and remove members; moderators remove
/// regular members; anyone can unfriend.
class MembersTab extends StatefulWidget {
  const MembersTab({super.key, required this.api, required this.league, required this.header, required this.onRefresh});
  final ApiClient api;
  final League league;
  final List<Widget> header;

  /// Reloads the league (roles and the roster change).
  final Future<void> Function() onRefresh;

  @override
  State<MembersTab> createState() => _MembersTabState();
}

class _MembersTabState extends State<MembersTab> {
  late final FriendsApi _friends = FriendsApi(widget.api);
  late final LeaguesApi _leagues = LeaguesApi(widget.api);
  Set<String> _friendIds = {};
  Set<String> _pendingIds = {};
  String _q = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _loadFriends();
  }

  Future<void> _loadFriends() async {
    try {
      final results = await Future.wait([_friends.list(), _friends.requests()]);
      final reqs = results[1] as ({List<FriendRequest> incoming, List<FriendRequest> outgoing});
      if (!mounted) return;
      setState(() {
        _friendIds = {for (final f in results[0] as List<Friend>) f.userId};
        _pendingIds = {for (final r in [...reqs.incoming, ...reqs.outgoing]) r.userId};
      });
    } catch (_) {/* friend buttons fall back to "Add friend" */}
  }

  Future<void> _run(Future<void> Function() call, String ok, {bool league = false}) async {
    final toast = Toaster.of(context);
    setState(() => _busy = true);
    try {
      await call();
      toast.success(ok);
      await Future.wait([_loadFriends(), if (league) widget.onRefresh()]);
    } catch (e) {
      toast.failure(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _message(String userId) async {
    final toast = Toaster.of(context);
    final nav = Navigator.of(context);
    try {
      final conv = await MessagingApi(widget.api).openDirect(userId);
      nav.push(MaterialPageRoute<void>(builder: (_) => ChatScreen(api: widget.api, conversation: conv, title: conv.title(const {}))));
    } catch (e) {
      toast.failure(e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final lg = widget.league;
    final me = context.read<AuthController>().user?.id;
    final isCommish = lg.myRole == 'commissioner';
    final canModerate = isCommish || lg.myRole == 'moderator';
    final q = _q.trim().toLowerCase();
    final shown = q.isEmpty ? lg.members : lg.members.where((m) => m.displayName.toLowerCase().contains(q)).toList();

    return RefreshIndicator(
      onRefresh: () => Future.wait([_loadFriends(), widget.onRefresh()]),
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [
        ...widget.header,
        SectionTitle('Members (${lg.members.length})'),
        const SizedBox(height: 16),
        if (lg.members.length > 8) ...[
          SearchField(hint: 'Search members', onChanged: (v) => setState(() => _q = v)),
          const SizedBox(height: 16),
        ],
        if (shown.isEmpty)
          CenterCard(children: [
            Icon(LucideIcons.search, size: 24, color: c.mutedForeground),
            Text('No members match “${_q.trim()}”.', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
          ])
        else
          for (final m in shown)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: UserMiniCard(
                userId: m.userId,
                name: m.displayName,
                avatarKey: m.avatarKey,
                subtitle: memberRoleLabel(m.role),
                badge: m.userId == me ? const WzBadge('You') : null,
                actions: m.userId == me
                    ? const []
                    : [
                        IconAction(icon: LucideIcons.messageCircle, tooltip: 'Message', onPressed: () => _message(m.userId)),
                        if (_friendIds.contains(m.userId))
                          IconAction(icon: LucideIcons.userCheck, tooltip: 'Friends', color: c.brand, onPressed: null)
                        else if (_pendingIds.contains(m.userId))
                          IconAction(icon: LucideIcons.clock, tooltip: 'Pending', color: c.mutedForeground, onPressed: null)
                        else
                          IconAction(
                            icon: LucideIcons.userPlus,
                            tooltip: 'Add friend',
                            color: c.primary,
                            onPressed: _busy ? null : () => _run(() => _friends.addByUserId(m.userId), 'Friend request sent'),
                          ),
                        if (_menu(c, m, isCommish: isCommish, canModerate: canModerate) case final menu?) menu,
                      ],
              ),
            ),
      ]),
    );
  }

  /// The ⋮ menu, or null when the viewer has no actions on this member.
  Widget? _menu(WaygerzColors c, LeagueMember m, {required bool isCommish, required bool canModerate}) {
    final isCommishRow = m.role == 'commissioner';
    final canRemove = isCommish ? !isCommishRow : canModerate && m.role == 'member';
    final isFriend = _friendIds.contains(m.userId);
    final roleActions = isCommish && !isCommishRow;
    if (!roleActions && !canRemove && !isFriend) return null;
    final lgId = widget.league.id;

    return PopupMenuButton<String>(
      tooltip: 'Member actions',
      enabled: !_busy,
      color: c.card,
      onSelected: (action) async {
        final (title, description, label) = switch (action) {
          'transfer' => ('Transfer commissioner?',
              "${m.displayName} will become the league commissioner and you'll become a moderator. "
                  'You can only get it back if they transfer it to you.', 'Transfer'),
          'unfriend' => ('Unfriend?', 'Remove ${m.displayName} from your friends?', 'Unfriend'),
          'remove' => ('Remove member?', "Remove ${m.displayName} from this league? They'll lose access to it.", 'Remove'),
          _ => ('', '', ''),
        };
        if (action == 'role') {
          final next = m.role == 'moderator' ? 'member' : 'moderator';
          return _run(() => _leagues.setMemberRole(lgId, m.userId, next),
              next == 'moderator' ? 'Moderator added' : 'Moderator removed', league: true);
        }
        final ok = await confirmWz(context, title: title, description: description, confirmLabel: label, destructive: action != 'transfer');
        if (!ok) return;
        switch (action) {
          case 'transfer':
            await _run(() => _leagues.transferCommissioner(lgId, m.userId), 'Commissioner transferred', league: true);
          case 'unfriend':
            await _run(() => _friends.remove(m.userId), 'Friend removed');
          case 'remove':
            await _run(() => _leagues.removeMember(lgId, m.userId), 'Member removed', league: true);
        }
      },
      itemBuilder: (_) => [
        if (roleActions) PopupMenuItem(value: 'role', child: Text(m.role == 'moderator' ? 'Remove moderator' : 'Make moderator')),
        if (roleActions) const PopupMenuItem(value: 'transfer', child: Text('Transfer commissioner')),
        if (isFriend)
          PopupMenuItem(
            value: 'unfriend',
            child: Row(children: [
              Icon(LucideIcons.userMinus, size: 16, color: c.destructive),
              const SizedBox(width: 8),
              Text('Unfriend', style: TextStyle(color: c.destructive)),
            ]),
          ),
        if (canRemove) PopupMenuItem(value: 'remove', child: Text('Remove from league', style: TextStyle(color: c.destructive))),
      ],
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: c.background,
          border: Border.all(color: c.input),
          borderRadius: BorderRadius.circular(WaygerzRadius.md),
        ),
        child: Icon(LucideIcons.ellipsisVertical, size: 16, color: c.foreground),
      ),
    );
  }
}
