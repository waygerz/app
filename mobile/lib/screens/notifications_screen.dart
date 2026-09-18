import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/friends_api.dart';
import '../api/invites_api.dart';
import '../api/leagues_api.dart';
import '../api/notifications_api.dart';
import '../api/wagers_api.dart';
import '../auth/auth_controller.dart';
import '../format.dart';
import '../models.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import '../widgets/counter_sheet.dart';
import 'league_detail_screen.dart';
import 'widgets.dart';

enum _Action { bet, friend, league }

enum _Tone { normal, win, loss }

class _Meta {
  const _Meta(this.icon, this.color, this.tone, this.action);
  final IconData icon;
  final Color color;
  final _Tone tone;
  final _Action? action;
}

/// Notifications (web app/(app)/notifications/page.tsx): actor avatar with a
/// category badge, title/body, inline Accept / Reject / Join, a resolved line
/// once acted on, and relative time. Unread rows are tinted.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key, required this.api, this.onChanged});
  final ApiClient api;

  /// Called after anything is marked read (the shell refreshes its badge).
  final VoidCallback? onChanged;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  late final NotificationsApi _notifications = NotificationsApi(widget.api);
  late final WagersApi _wagers = WagersApi(widget.api);
  late final FriendsApi _friends = FriendsApi(widget.api);
  late final LeaguesApi _leagues = LeaguesApi(widget.api);
  late final InvitesApi _invites = InvitesApi(widget.api);

  late Future<({List<FeedNotification> items, int unread})> _future = _notifications.feed();

  /// Bet id → status, to show a truthful outcome instead of a dead Accept on a
  /// challenge that has moved on (accepted elsewhere, expired at kickoff, …).
  Map<String, String> _wagerStatus = {};

  /// Full bets by id, so a challenge can open the Counter sheet in place.
  Map<String, Wager> _wagerById = {};

  /// Notifications resolved inline this session → their "done" label.
  final Map<String, String> _resolved = {};
  final Set<String> _readLocally = {};
  String? _busy;
  String? get _me => context.read<AuthController>().user?.id;
  bool _markingAll = false;

  @override
  void initState() {
    super.initState();
    _loadWagerStatus();
  }

  Future<void> _loadWagerStatus() async {
    try {
      final all = await _wagers.mine();
      if (mounted) {
        setState(() {
          _wagerStatus = {for (final w in all) w.id: w.status};
          _wagerById = {for (final w in all) w.id: w};
        });
      }
    } catch (_) {/* best-effort: rows just keep their actions */}
  }

  Future<void> _reload() async {
    final f = _notifications.feed();
    setState(() {
      _future = f;
      _readLocally.clear();
    });
    await Future.wait([f, _loadWagerStatus()]);
  }

  Future<void> _markRead([List<String>? ids]) async {
    try {
      await _notifications.markRead(ids: ids);
      widget.onChanged?.call();
    } catch (_) {/* the next load shows the true state */}
  }

  _Meta _meta(FeedNotification n, WaygerzColors c) {
    final bet = c.primary;
    const friend = Tw.sky500;
    const invite = Tw.fuchsia500;
    const digest = Tw.amber500;
    switch (n.templateKey) {
      case 'wager_proposed' || 'wager_countered':
        return _Meta(LucideIcons.swords, bet, _Tone.normal, _Action.bet);
      case 'wager_accepted':
        return _Meta(LucideIcons.swords, bet, _Tone.normal, null);
      case 'wager_settled_win':
        return _Meta(LucideIcons.trophy, c.brand, _Tone.win, null);
      case 'wager_settled_loss':
        return _Meta(LucideIcons.trendingDown, c.destructive, _Tone.loss, null);
      case 'friend_request':
        return const _Meta(LucideIcons.userPlus, friend, _Tone.normal, _Action.friend);
      case 'friend_accepted':
        return const _Meta(LucideIcons.userCheck, friend, _Tone.normal, null);
      case 'league_invite':
        return const _Meta(LucideIcons.ticket, invite, _Tone.normal, _Action.league);
      case 'pickem_week':
        return const _Meta(LucideIcons.trophy, digest, _Tone.normal, null);
      case 'weekly_digest':
        return const _Meta(LucideIcons.barChart3, digest, _Tone.normal, null);
    }
    return switch (n.category) {
      'wager_alert' => _Meta(LucideIcons.swords, bet, _Tone.normal, null),
      'friend_request' => const _Meta(LucideIcons.userPlus, friend, _Tone.normal, null),
      'league_invite' => const _Meta(LucideIcons.ticket, invite, _Tone.normal, null),
      'league_alert' => const _Meta(LucideIcons.trophy, digest, _Tone.normal, null),
      'reaction' => const _Meta(LucideIcons.smilePlus, Tw.rose500, _Tone.normal, null),
      'weekly_digest' => const _Meta(LucideIcons.barChart3, digest, _Tone.normal, null),
      _ => _Meta(LucideIcons.bell, c.mutedForeground, _Tone.normal, null),
    };
  }

  /// The bet's /c code, from the deep link or the body's https://…/c/<code>.
  static String? _betCode(FeedNotification n) {
    final re = RegExp(r'/c/([A-Za-z0-9]+)');
    return re.firstMatch(n.deepLink ?? '')?.group(1) ?? re.firstMatch(n.body)?.group(1);
  }

  /// A bet challenge no longer open → its real outcome (web BET_RESOLVED).
  static ({String label, bool ok})? _betResolved(String? status) {
    if (status == null || status == 'open') return null;
    return switch (status) {
      'accepted' || 'completed' => (label: 'Accepted', ok: true),
      'settled' => (label: 'Settled', ok: true),
      'declined' => (label: 'Declined', ok: false),
      'cancelled' => (label: 'Cancelled', ok: false),
      _ => (label: 'No longer available', ok: false),
    };
  }

  Future<void> _act(FeedNotification n, _Action action, bool yes) async {
    final toast = Toaster.of(context);
    setState(() => _busy = n.id);
    try {
      final String label;
      switch (action) {
        case _Action.bet:
          final code = _betCode(n);
          if (code == null || !code.startsWith('B')) throw ApiException(400, 'This bet link is invalid');
          await _invites.act(code, yes ? 'accept' : 'decline');
          label = yes ? 'Accepted' : 'Rejected';
        case _Action.friend:
          final reqs = await _friends.requests();
          final who = n.actorId ?? n.refId ?? '';
          final match = reqs.incoming.where((r) => r.userId == who);
          if (match.isEmpty) throw ApiException(409, 'This request is no longer pending');
          yes ? await _friends.accept(match.first.id) : await _friends.decline(match.first.id);
          label = yes ? 'Added' : 'Declined';
        case _Action.league:
          if (yes) await _leagues.acceptInvite(n.refId ?? '');
          label = yes ? 'Joined' : 'Dismissed';
      }
      setState(() => _resolved[n.id] = label);
      if (!n.read) _markRead([n.id]);
      _loadWagerStatus();
    } on ApiException catch (e) {
      // Race: the offer lapsed between render and tap — say so, not a red error.
      if (RegExp('no longer|already started|expired', caseSensitive: false).hasMatch(e.message)) {
        setState(() => _resolved[n.id] = 'No longer available');
        if (!n.read) _markRead([n.id]);
      } else {
        toast.error(e.message);
      }
    } catch (e) {
      toast.failure(e);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  /// Opening marks it read and goes where the action lives (league links open
  /// the league; other destinations arrive with deep links on mobile).
  void _open(FeedNotification n) {
    if (!n.read) {
      setState(() => _readLocally.add(n.id));
      _markRead([n.id]);
    }
    _notifications.recordOpen(n.id).catchError((_) {});
    final m = RegExp(r'^/leagues/([0-9a-fA-F-]{36})').firstMatch(n.deepLink ?? '');
    if (m != null) {
      final stub = League(id: m.group(1)!, name: n.refType == 'league' ? (n.actorName ?? '') : '',
          leagueType: 'pickem', status: 'active');
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => LeagueDetailScreen(api: widget.api, league: stub)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return RefreshIndicator(
      onRefresh: _reload,
      child: FutureBuilder<({List<FeedNotification> items, int unread})>(
        future: _future,
        builder: (context, snap) {
          final data = snap.data;
          final unread = (data?.unread ?? 0) - _readLocally.length;
          return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [
            if (unread > 0 || _markingAll)
              Align(
                alignment: Alignment.centerRight,
                child: WzButton(
                  label: 'Mark all read',
                  size: ButtonSize.sm,
                  variant: ButtonVariant.ghost,
                  busy: _markingAll,
                  onPressed: () async {
                    setState(() => _markingAll = true);
                    await _markRead();
                    if (mounted) setState(() => _markingAll = false);
                    await _reload();
                  },
                ),
              ),
            const SizedBox(height: 8),
            if (data == null && snap.connectionState == ConnectionState.waiting)
              ...List.generate(6, (_) => const _NotifSkeleton())
            else if (snap.hasError)
              ErrorCard(title: "Couldn't load notifications", error: snap.error, onRetry: _reload)
            else if (data!.items.isEmpty)
              CenterCard(children: [
                Icon(LucideIcons.bellOff, size: 24, color: c.mutedForeground),
                Text("You're all caught up.", style: TextStyle(fontSize: 14, color: c.mutedForeground)),
              ])
            else
              for (final n in data.items)
                Padding(padding: const EdgeInsets.only(bottom: 12), child: _row(c, n)),
          ]);
        },
      ),
    );
  }

  Widget _row(WaygerzColors c, FeedNotification n) {
    final meta = _meta(n, c);
    final read = n.read || _readLocally.contains(n.id);
    final done = _resolved[n.id];
    final betOutcome = meta.action == _Action.bet ? _betResolved(_wagerStatus[n.refId]) : null;
    final showActions = meta.action != null && !read && done == null && betOutcome == null;
    final unreadLook = !read && done == null;
    final busy = _busy == n.id;
    final titleColor = meta.tone == _Tone.win ? c.brand : meta.tone == _Tone.loss ? c.destructive : c.foreground;

    Widget avatar;
    if (n.actorId != null) {
      avatar = SizedBox(
        width: 40,
        height: 40,
        child: Stack(clipBehavior: Clip.none, children: [
          n.refType == 'league'
              ? LeagueAvatar(name: n.actorName ?? 'League', id: n.actorId, logo: n.actorAvatarKey, size: 36)
              : UserAvatar(userId: n.actorId!, name: n.actorName ?? 'Someone', avatarKey: n.actorAvatarKey, size: 36),
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: 18,
              height: 18,
              decoration: BoxDecoration(
                color: Color.alphaBlend(meta.color.withValues(alpha: 0.15), c.background),
                shape: BoxShape.circle,
                border: Border.all(color: c.background, width: 2),
              ),
              child: Icon(meta.icon, size: 10, color: meta.color),
            ),
          ),
        ]),
      );
    } else {
      avatar = Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(color: meta.color.withValues(alpha: 0.15), shape: BoxShape.circle),
        child: Icon(meta.icon, size: 16, color: meta.color),
      );
    }

    Widget? status;
    if (done != null) {
      status = _resolvedLine(c, done, ok: true);
    } else if (showActions) {
      final yes = meta.action == _Action.league ? 'Join' : 'Accept';
      final no = meta.action == _Action.bet ? 'Reject' : meta.action == _Action.league ? 'Dismiss' : 'Decline';
      status = Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Row(children: [
          WzButton(label: yes, size: ButtonSize.sm, dense: true, busy: busy,
              onPressed: busy ? null : () => _act(n, meta.action!, true)),
          const SizedBox(width: 8),
          // Counter opens the full editor in place; Accept/Reject stay one-tap.
          if (meta.action == _Action.bet && _wagerById[n.refId] != null && _me != null) ...[
            WzButton(label: 'Counter', size: ButtonSize.sm, dense: true, variant: ButtonVariant.outline,
                onPressed: busy ? null : () async {
                  final sent = await showCounterSheet(context, api: widget.api, wager: _wagerById[n.refId]!, me: _me!);
                  if (!sent || !mounted) return;
                  setState(() => _resolved[n.id] = 'Countered');
                  if (!n.read) _markRead([n.id]);
                  _loadWagerStatus();
                }),
            const SizedBox(width: 8),
          ],
          WzButton(label: no, size: ButtonSize.sm, dense: true, variant: ButtonVariant.outline,
              onPressed: busy ? null : () => _act(n, meta.action!, false)),
        ]),
      );
    } else if (betOutcome != null) {
      status = _resolvedLine(c, betOutcome.label, ok: betOutcome.ok);
    }

    return Material(
      color: unreadLook ? Color.alphaBlend(c.primary.withValues(alpha: 0.06), c.card) : c.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: unreadLook ? c.primary.withValues(alpha: 0.4) : c.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        // An expired bet challenge has no live destination.
        onTap: betOutcome == null ? () => _open(n) : null,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            avatar,
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(n.title, style: TextStyle(fontSize: 14, fontWeight: unreadLook ? FontWeight.w500 : FontWeight.w400, color: titleColor)),
                if (n.body.isNotEmpty && n.body != n.title) ...[
                  const SizedBox(height: 2),
                  Text(n.body, style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                ],
                if (status != null) status,
                const SizedBox(height: 2),
                Text(timeAgo(n.createdAt), style: TextStyle(fontSize: 11, color: c.mutedForeground)),
              ]),
            ),
            if (unreadLook && !showActions)
              Container(
                margin: const EdgeInsets.only(top: 6, left: 8),
                width: 8,
                height: 8,
                decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle),
              ),
          ]),
        ),
      ),
    );
  }

  Widget _resolvedLine(WaygerzColors c, String label, {required bool ok}) => Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (ok) ...[Icon(LucideIcons.check, size: 14, color: c.brand), const SizedBox(width: 6)],
          Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: c.mutedForeground)),
        ]),
      );
}

class _NotifSkeleton extends StatelessWidget {
  const _NotifSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.only(bottom: 12),
      child: WzCard(
        radius: 14,
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Skeleton(width: 36, height: 36, circle: true),
          SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SkeletonLine(widthFactor: 0.75, height: 14),
              SizedBox(height: 6),
              SkeletonLine(widthFactor: 0.33, height: 12),
            ]),
          ),
        ]),
      ),
    );
  }
}
