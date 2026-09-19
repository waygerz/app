import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/events_api.dart';
import '../api/friends_api.dart';
import '../api/invites_api.dart';
import '../api/leagues_api.dart';
import '../api/notifications_api.dart';
import '../api/wagers_api.dart';
import '../app_nav.dart';
import '../auth/auth_controller.dart';
import '../format.dart';
import '../models.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import '../wagers.dart';
import '../widgets/bet_card.dart';
import '../widgets/counter_sheet.dart';
import '../widgets/league_invite_card.dart';
import 'widgets.dart';

enum _Action { bet, friend, league }

enum _Tone { normal, win, loss }

/// The filter chips (web notifications page FILTERS).
enum _Filter { all, bets, leagues, friends, social }

const _filterLabels = {
  _Filter.all: 'All',
  _Filter.bets: 'Bets',
  _Filter.leagues: 'Leagues',
  _Filter.friends: 'Friends',
  _Filter.social: 'Social',
};

/// Which chip a notification belongs under (besides All); null = All only.
_Filter? _filterOf(FeedNotification n) {
  final k = n.templateKey ?? '';
  if (k.startsWith('wager_') || n.category == 'wager_alert') return _Filter.bets;
  const leagues = {'league_invite', 'league_alert', 'pickem_week', 'weekly_digest'};
  if (leagues.contains(k) || leagues.contains(n.category)) return _Filter.leagues;
  if (k == 'friend_request' || k == 'friend_accepted' || n.category == 'friend_request') return _Filter.friends;
  if (n.category == 'reaction') return _Filter.social;
  return null;
}

/// A list row: one notification, or several reactions to the same post on the
/// same day folded into one ("… +3").
class _Entry {
  _Entry(this.first);
  final FeedNotification first;
  final List<FeedNotification> all = [];
  int get more => all.length - 1;
}

class _Meta {
  const _Meta(this.icon, this.color, this.tone, this.action);
  final IconData icon;
  final Color color;
  final _Tone tone;
  final _Action? action;
}

/// Notifications (web app/(app)/notifications/page.tsx), compact inbox: filter
/// chips, a NEEDS YOU section (bet challenges, league invites, friend requests
/// with one-tap buttons; the left side opens a details sheet — the bet card,
/// the league card or the person), then TODAY / THIS WEEK / EARLIER one-line
/// rows with repeated reactions folded. Unread rows are tinted.
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
  _Filter _filter = _Filter.all;

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

  /// Opening marks it read and goes where the action lives. Bet notifications
  /// open the bet's /c view (Accept / Counter / Reject + the game), derived
  /// from the code even when the stored deep link is older; everything else
  /// follows its deep link (web openItem).
  void _open(FeedNotification n) {
    if (!n.read) {
      setState(() => _readLocally.add(n.id));
      _markRead([n.id]);
    }
    _notifications.recordOpen(n.id).catchError((_) {});
    final isBet = (n.templateKey ?? '').startsWith('wager_') || n.category == 'wager_alert';
    final code = isBet ? _betCode(n) : null;
    final dest = code != null ? '/c/$code' : n.deepLink;
    if (dest != null && dest.isNotEmpty) context.read<AppNav>().open(dest);
  }

  bool _isRead(FeedNotification n) => n.read || _readLocally.contains(n.id);

  /// A row still waiting on the viewer: an action, not yet read, resolved or
  /// stale (a bet that has moved on).
  bool _needsYou(FeedNotification n, WaygerzColors c) {
    final meta = _meta(n, c);
    if (meta.action == null || _isRead(n) || _resolved[n.id] != null) return false;
    return meta.action != _Action.bet || _betResolved(_wagerStatus[n.refId]) == null;
  }

  /// Opening a folded row marks all of it read, then goes where the first leads.
  void _openEntry(_Entry e) {
    final unread = [for (final n in e.all) if (!_isRead(n)) n.id];
    if (unread.length > 1) {
      setState(() => _readLocally.addAll(unread));
      _markRead(unread);
    }
    _open(e.first);
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
          final items = data?.items ?? const <FeedNotification>[];
          final shown = _filter == _Filter.all ? items : items.where((n) => _filterOf(n) == _filter).toList();
          final needs = [for (final n in shown) if (_needsYou(n, c)) n];
          final rest = [for (final n in shown) if (!_needsYou(n, c)) n];

          return ListView(padding: const EdgeInsets.only(bottom: 32), children: [
            _chips(c, items, unread),
            if (data == null && snap.connectionState == ConnectionState.waiting)
              ...List.generate(8, (_) => const _NotifSkeleton())
            else if (snap.hasError)
              Padding(padding: const EdgeInsets.all(16),
                  child: ErrorCard(title: "Couldn't load notifications", error: snap.error, onRetry: _reload))
            else if (shown.isEmpty)
              Padding(
                padding: const EdgeInsets.all(16),
                child: CenterCard(children: [
                  Icon(LucideIcons.bellOff, size: 24, color: c.mutedForeground),
                  Text(items.isEmpty ? "You're all caught up." : 'Nothing here.',
                      style: TextStyle(fontSize: 14, color: c.mutedForeground)),
                ]),
              )
            else ...[
              if (needs.isNotEmpty) ...[
                _section(c, 'NEEDS YOU · ${needs.length}'),
                for (final n in needs) _needsRow(c, n),
              ],
              for (final (label, entries) in _byDay(rest)) ...[
                _section(c, label),
                for (final e in entries) _row(c, e),
              ],
            ],
          ]);
        },
      ),
    );
  }

  /// Rows folded (reactions to one post on one day) and split into Today /
  /// This week / Earlier, newest first as the feed arrives.
  List<(String, List<_Entry>)> _byDay(List<FeedNotification> list) {
    final entries = <_Entry>[];
    final folded = <String, _Entry>{};
    for (final n in list) {
      final d = DateTime.tryParse(n.createdAt ?? '')?.toLocal();
      final key = n.category == 'reaction' && n.refId != null && d != null ? '${n.refId}|${d.year}-${d.month}-${d.day}' : null;
      final into = key == null ? null : folded[key];
      if (into != null) {
        into.all.add(n);
        continue;
      }
      final e = _Entry(n)..all.add(n);
      if (key != null) folded[key] = e;
      entries.add(e);
    }
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final weekAgo = today.subtract(const Duration(days: 6));
    final groups = <String, List<_Entry>>{'TODAY': [], 'THIS WEEK': [], 'EARLIER': []};
    for (final e in entries) {
      final d = DateTime.tryParse(e.first.createdAt ?? '')?.toLocal();
      final label = d == null || d.isBefore(weekAgo) ? 'EARLIER' : !d.isBefore(today) ? 'TODAY' : 'THIS WEEK';
      groups[label]!.add(e);
    }
    return [for (final g in groups.entries) if (g.value.isNotEmpty) (g.key, g.value)];
  }

  /// Filter chips with unread counts, and Mark all read.
  Widget _chips(WaygerzColors c, List<FeedNotification> items, int unread) {
    int count(_Filter f) =>
        items.where((n) => !_isRead(n) && (f == _Filter.all || _filterOf(n) == f)).length;
    Widget chip(_Filter f) {
      final on = _filter == f;
      final n = f == _Filter.all ? 0 : count(f);
      return Padding(
        padding: const EdgeInsets.only(right: 6),
        child: Semantics(
          button: true,
          selected: on,
          child: Material(
            color: on ? c.foreground : Colors.transparent,
            shape: StadiumBorder(side: BorderSide(color: on ? c.foreground : c.input)),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: () => setState(() => _filter = f),
              child: Container(
                height: 30,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                alignment: Alignment.center,
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Text(_filterLabels[f]!, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                      color: on ? c.background : c.mutedForeground)),
                  if (n > 0) ...[
                    const SizedBox(width: 5),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5),
                      decoration: BoxDecoration(color: c.primary, borderRadius: BorderRadius.circular(999)),
                      child: Text('$n', style: const TextStyle(fontSize: 10, height: 1.5, fontWeight: FontWeight.w700,
                          color: Colors.white)),
                    ),
                  ],
                ]),
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
      child: Row(children: [
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [for (final f in _Filter.values) chip(f)]),
          ),
        ),
        if (unread > 0 || _markingAll)
          WzButton(
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
      ]),
    );
  }

  Widget _section(WaygerzColors c, String label) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
        child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.7,
            color: c.mutedForeground)),
      );

  /// 32px actor avatar with a small category badge, or the category icon.
  Widget _avatar(WaygerzColors c, FeedNotification n, _Meta meta) {
    if (n.actorId == null) {
      return Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(color: meta.color.withValues(alpha: 0.15), shape: BoxShape.circle),
        child: Icon(meta.icon, size: 15, color: meta.color),
      );
    }
    return SizedBox(
      width: 34,
      height: 34,
      child: Stack(clipBehavior: Clip.none, children: [
        n.refType == 'league'
            ? LeagueAvatar(name: n.actorName ?? 'League', id: n.actorId, logo: n.actorAvatarKey, size: 32)
            : UserAvatar(userId: n.actorId!, name: n.actorName ?? 'Someone', avatarKey: n.actorAvatarKey, size: 32),
        Positioned(
          right: -2,
          bottom: -2,
          child: Container(
            width: 16,
            height: 16,
            decoration: BoxDecoration(
              color: Color.alphaBlend(meta.color.withValues(alpha: 0.2), c.background),
              shape: BoxShape.circle,
              border: Border.all(color: c.background, width: 2),
            ),
            child: Icon(meta.icon, size: 8, color: meta.color),
          ),
        ),
      ]),
    );
  }

  /// "Title · 2h" on one line (ellipsis).
  Widget _titleLine(WaygerzColors c, String title, String? when, {Color? color, bool strong = false}) => Text.rich(
        TextSpan(children: [
          TextSpan(text: title, style: TextStyle(color: color ?? c.foreground, fontWeight: strong ? FontWeight.w600 : FontWeight.w400)),
          if (when != null && when.isNotEmpty) TextSpan(text: '  $when', style: TextStyle(color: c.mutedForeground)),
        ]),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 13.5),
      );

  // ------------------------------------------------------------ needs you

  Widget _needsRow(WaygerzColors c, FeedNotification n) {
    final meta = _meta(n, c);
    final busy = _busy == n.id;
    final wager = meta.action == _Action.bet ? _wagerById[n.refId] : null;
    final sub = wager == null
        ? null
        : '${wagerPick(wager, viewerSide(wager, _me ?? ''))} · '
            '${wager.amountCents > 0 ? formatCredits(wager.amountCents) : treatEmoji(wager.treat)}'
            '${wager.startTime != null ? ' · ${dayLabel(wager.startTime)} ${clockTime(wager.startTime)}' : ''}';

    final Widget secondary = switch (meta.action!) {
      _Action.bet => PopupMenuButton<String>(
          tooltip: 'Counter or reject',
          enabled: !busy,
          onSelected: (v) => v == 'counter' ? _counter(n) : _act(n, _Action.bet, false),
          itemBuilder: (_) => [
            if (wager != null && _me != null) const PopupMenuItem(value: 'counter', child: Text('Counter')),
            const PopupMenuItem(value: 'reject', child: Text('Reject')),
          ],
          child: _iconBox(c, LucideIcons.ellipsis),
        ),
      _Action.league || _Action.friend => Semantics(
          button: true,
          label: meta.action == _Action.league ? 'Dismiss' : 'Decline',
          child: InkWell(
            borderRadius: BorderRadius.circular(WaygerzRadius.md),
            onTap: busy ? null : () => _act(n, meta.action!, false),
            child: _iconBox(c, LucideIcons.x),
          ),
        ),
    };

    return Container(
      color: Color.alphaBlend(c.primary.withValues(alpha: 0.07), c.background),
      padding: const EdgeInsets.fromLTRB(16, 8, 12, 8),
      child: Row(children: [
        Expanded(
          child: InkWell(
            borderRadius: BorderRadius.circular(WaygerzRadius.md),
            onTap: () => _details(n, meta),
            child: Row(children: [
              _avatar(c, n, meta),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  _titleLine(c, n.title, shortAgo(n.createdAt), strong: true),
                  if (sub != null)
                    Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: c.mutedForeground,
                            fontFeatures: const [FontFeature.tabularFigures()])),
                ]),
              ),
            ]),
          ),
        ),
        const SizedBox(width: 8),
        WzButton(label: meta.action == _Action.league ? 'Join' : 'Accept', size: ButtonSize.sm, dense: true,
            busy: busy, onPressed: busy ? null : () => _act(n, meta.action!, true)),
        const SizedBox(width: 6),
        secondary,
      ]),
    );
  }

  Widget _iconBox(WaygerzColors c, IconData icon) => Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(border: Border.all(color: c.input), borderRadius: BorderRadius.circular(WaygerzRadius.md)),
        child: Icon(icon, size: 16, color: c.foreground),
      );

  Future<void> _counter(FeedNotification n) async {
    final wager = _wagerById[n.refId];
    final me = _me;
    if (wager == null || me == null) return;
    final sent = await showCounterSheet(context, api: widget.api, wager: wager, me: me);
    if (!sent || !mounted) return;
    setState(() => _resolved[n.id] = 'Countered');
    if (!n.read) _markRead([n.id]);
    _loadWagerStatus();
  }

  /// The left side of a NEEDS YOU row: the thing, with the same answers.
  void _details(FeedNotification n, _Meta meta) {
    final me = _me ?? '';
    Widget footer(BuildContext ctx, List<(String, bool, VoidCallback)> buttons) => Row(children: [
          for (final (i, (label, primary, onTap)) in buttons.indexed) ...[
            if (i > 0) const SizedBox(width: 8),
            Expanded(
              child: WzButton(
                label: label,
                variant: primary ? ButtonVariant.primary : ButtonVariant.outline,
                expand: true,
                onPressed: () {
                  Navigator.of(ctx).pop();
                  onTap();
                },
              ),
            ),
          ],
        ]);

    switch (meta.action!) {
      case _Action.bet:
        final wager = _wagerById[n.refId];
        if (wager == null) return _open(n);
        showWzSheet<void>(
          context,
          title: n.title,
          hideHeader: true,
          builder: (_) => FutureBuilder<SportEvent?>(
            future: EventsApi(widget.api).event(wager.eventId),
            builder: (_, snap) => BetCard(wager: wager, event: snap.data, me: me),
          ),
          footer: (ctx) => footer(ctx, [
            ('Accept', true, () => _act(n, _Action.bet, true)),
            ('Counter', false, () => _counter(n)),
            ('Reject', false, () => _act(n, _Action.bet, false)),
          ]),
        );
      case _Action.league:
        // Older invites link to /leagues, not the league's /c code.
        final code = RegExp(r'/c/([A-Za-z0-9]+)').firstMatch(n.deepLink ?? '')?.group(1);
        if (code == null) return _open(n);
        showWzSheet<void>(
          context,
          title: 'League invite',
          description: shortAgo(n.createdAt).isEmpty ? null : 'Sent ${timeAgo(n.createdAt)}',
          builder: (_) => FutureBuilder<ResolvedCode>(
            future: _invites.resolve(code),
            builder: (_, snap) {
              final p = snap.data?.preview;
              if (p == null) {
                return snap.hasError
                    ? Text("Couldn't load this league.", textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 14, color: WaygerzColors.of(context).mutedForeground))
                    : const Skeleton(height: 220, radius: WaygerzRadius.xl);
              }
              return LeagueInviteCard(league: p);
            },
          ),
          // Join accepts THIS invite (the code is only the preview).
          footer: (ctx) => footer(ctx, [
            ('Join league', true, () => _act(n, _Action.league, true)),
            ('Dismiss', false, () => _act(n, _Action.league, false)),
          ]),
        );
      case _Action.friend:
        final c = WaygerzColors.of(context);
        final name = n.actorName ?? 'Someone';
        showWzSheet<void>(
          context,
          title: 'Friend request',
          description: 'Sent ${timeAgo(n.createdAt)}',
          builder: (_) => Column(mainAxisSize: MainAxisSize.min, children: [
            UserAvatar(userId: n.actorId ?? n.refId ?? '', name: name, avatarKey: n.actorAvatarKey, size: 72),
            const SizedBox(height: 12),
            Text(name, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: c.foreground)),
            const SizedBox(height: 2),
            Text('wants to be friends', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
          ]),
          footer: (ctx) => footer(ctx, [
            ('Accept', true, () => _act(n, _Action.friend, true)),
            ('Decline', false, () => _act(n, _Action.friend, false)),
          ]),
        );
    }
  }

  // ------------------------------------------------------------ the rest

  Widget _row(WaygerzColors c, _Entry e) {
    final n = e.first;
    final meta = _meta(n, c);
    final read = e.all.every(_isRead);
    final done = _resolved[n.id];
    final betOutcome = meta.action == _Action.bet ? _betResolved(_wagerStatus[n.refId]) : null;
    final unreadLook = !read && done == null;
    final titleColor = meta.tone == _Tone.win ? c.brand : meta.tone == _Tone.loss ? c.destructive : null;
    final outcome = done ?? betOutcome?.label;

    return Material(
      color: unreadLook ? Color.alphaBlend(c.primary.withValues(alpha: 0.07), c.background) : Colors.transparent,
      child: InkWell(
        // An expired bet challenge has no live destination.
        onTap: betOutcome == null ? () => _openEntry(e) : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(children: [
            _avatar(c, n, meta),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                _titleLine(c, e.more > 0 ? '${n.title} +${e.more}' : n.title, shortAgo(n.createdAt),
                    color: titleColor, strong: unreadLook),
                if (outcome != null)
                  Row(children: [
                    if (done != null || (betOutcome?.ok ?? false)) ...[
                      Icon(LucideIcons.check, size: 12, color: c.brand),
                      const SizedBox(width: 4),
                    ],
                    Text(outcome, style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                  ]),
              ]),
            ),
            if (unreadLook) ...[
              const SizedBox(width: 8),
              Container(width: 8, height: 8, decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle)),
            ],
          ]),
        ),
      ),
    );
  }
}

class _NotifSkeleton extends StatelessWidget {
  const _NotifSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(children: [
        Skeleton(width: 32, height: 32, circle: true),
        SizedBox(width: 10),
        Expanded(child: SkeletonLine(widthFactor: 0.7, height: 13)),
      ]),
    );
  }
}
