import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:share_plus/share_plus.dart';

import '../api/api_client.dart';
import '../api/friends_api.dart';
import '../api/leagues_api.dart';
import '../config.dart';
import '../models.dart';
import '../screens/widgets.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';

/// Invite to a league (web leagues/[id]/invite-dialog.tsx): share the league's
/// invite link with anyone, or send a direct in-app invite to a friend.
Future<void> showInviteSheet(BuildContext context, {required ApiClient api, required League league}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _InviteSheet(api: api, league: league),
  );
}

class _InviteSheet extends StatefulWidget {
  const _InviteSheet({required this.api, required this.league});
  final ApiClient api;
  final League league;

  @override
  State<_InviteSheet> createState() => _InviteSheetState();
}

class _InviteSheetState extends State<_InviteSheet> {
  late final Future<List<Friend>> _friends = FriendsApi(widget.api).list();

  /// Friends invited this session (the league payload has no per-friend flag).
  final Set<String> _invited = {};
  String? _sending;
  String _q = '';

  Future<void> _share() async {
    final code = widget.league.inviteCode;
    if (code == null) return;
    await SharePlus.instance.share(ShareParams(
      text: 'Join ${widget.league.name} on Waygerz\n${Config.webBaseUrl}/c/$code',
      subject: 'Join ${widget.league.name} on Waygerz',
    ));
  }

  Future<void> _invite(Friend f) async {
    final toast = Toaster.of(context);
    setState(() => _sending = f.userId);
    try {
      await LeaguesApi(widget.api).sendInvites(widget.league.id, [f.userId]);
      toast.success('Invite sent');
      setState(() => _invited.add(f.userId));
    } catch (e) {
      toast.failure(e);
    } finally {
      if (mounted) setState(() => _sending = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final members = {for (final m in widget.league.members) m.userId};
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
      child: Padding(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Invite to ${widget.league.name}', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: c.foreground)),
          const SizedBox(height: 16),
          WzButton(
            label: 'Share invite link',
            icon: LucideIcons.share2,
            variant: ButtonVariant.outline,
            expand: true,
            onPressed: widget.league.inviteCode == null ? null : _share,
          ),
          const SizedBox(height: 20),
          Text('Invite friends', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
          const SizedBox(height: 8),
          Flexible(
            child: FutureBuilder<List<Friend>>(
              future: _friends,
              builder: (context, snap) {
                if (snap.data == null && snap.connectionState == ConnectionState.waiting) {
                  return const Skeleton(height: 56, radius: WaygerzRadius.lg);
                }
                if (snap.hasError) return Text(errorText(snap.error), style: TextStyle(color: c.destructive));
                final all = snap.data!;
                if (all.isEmpty) {
                  return Text('No friends yet — share the link instead.', style: TextStyle(fontSize: 14, color: c.mutedForeground));
                }
                final q = _q.trim().toLowerCase();
                final shown = q.isEmpty ? all : all.where((f) => f.displayName.toLowerCase().contains(q)).toList();
                return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  if (all.length > 8) ...[
                    SearchField(hint: 'Search friends', onChanged: (v) => setState(() => _q = v)),
                    const SizedBox(height: 8),
                  ],
                  Flexible(
                    child: ListView(shrinkWrap: true, children: [
                      for (final f in shown)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Row(children: [
                            UserAvatar(userId: f.userId, name: f.displayName, avatarKey: f.avatarKey, size: 40),
                            const SizedBox(width: 12),
                            Expanded(child: Text(f.displayName, maxLines: 1, overflow: TextOverflow.ellipsis,
                                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.foreground))),
                            if (members.contains(f.userId))
                              Text('Member', style: TextStyle(fontSize: 12, color: c.mutedForeground))
                            else if (_invited.contains(f.userId))
                              Text('Invited', style: TextStyle(fontSize: 12, color: c.brand))
                            else
                              WzButton(label: 'Invite', size: ButtonSize.sm, dense: true, busy: _sending == f.userId,
                                  onPressed: _sending == null ? () => _invite(f) : null),
                          ]),
                        ),
                    ]),
                  ),
                ]);
              },
            ),
          ),
        ]),
      ),
    );
  }
}
