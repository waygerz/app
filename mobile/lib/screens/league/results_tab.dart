import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../api/events_api.dart';
import '../../api/leagues_api.dart';
import '../../api/wagers_api.dart';
import '../../auth/auth_controller.dart';
import '../../format.dart';
import '../../models.dart';
import '../../theme/app_theme.dart';
import '../../ui/ui.dart';
import '../../wagers.dart';
import '../../widgets/wager_card.dart';
import '../widgets.dart';

/// League Results by week (web _sections/results.tsx): head-to-head shows the
/// week's settled bets with a reckoning (net $ / 🍺 / 🥃, overall and per
/// opponent); pick'em shows the week's winner(s) and leaderboard, with
/// commissioner confirmations and each member's picks.
class ResultsTab extends StatelessWidget {
  const ResultsTab({super.key, required this.api, required this.league, required this.header, required this.onRefresh});
  final ApiClient api;
  final League league;
  final List<Widget> header;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) => league.isPickem
      ? _PickemResults(api: api, league: league, header: header, onRefresh: onRefresh)
      : _H2hResults(api: api, league: league, header: header, onRefresh: onRefresh);
}

Widget _noResults(BuildContext context, String text) {
  final c = WaygerzColors.of(context);
  return CenterCard(children: [
    Icon(LucideIcons.trophy, size: 24, color: c.mutedForeground),
    Text(text, textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
  ]);
}

/// "Week ending MM/DD" from the period's end, else its own label.
String _weekEnding(LeaguePeriod p) {
  final d = DateTime.tryParse(p.endsAt ?? '')?.toLocal();
  if (d == null) return p.label;
  return 'Week ending ${d.month.toString().padLeft(2, '0')}/${d.day.toString().padLeft(2, '0')}';
}

// ------------------------------------------------------------ head-to-head

class _H2hData {
  _H2hData(this.periods, this.settled, this.events);
  final List<LeaguePeriod> periods;
  final List<Wager> settled;
  final Map<String, SportEvent> events;
}

class _H2hResults extends StatefulWidget {
  const _H2hResults({required this.api, required this.league, required this.header, required this.onRefresh});
  final ApiClient api;
  final League league;
  final List<Widget> header;
  final Future<void> Function() onRefresh;

  @override
  State<_H2hResults> createState() => _H2hResultsState();
}

class _H2hResultsState extends State<_H2hResults> {
  late Future<_H2hData> _future = _load();
  String? _selected;

  Future<_H2hData> _load() async {
    final results = await Future.wait([
      LeaguesApi(widget.api).periods(widget.league.id),
      WagersApi(widget.api).mine(leagueId: widget.league.id),
    ]);
    final settled = (results[1] as List<Wager>).where((w) => w.status == 'settled' || w.status == 'refunded').toList();
    final events = await EventsApi(widget.api).events(settled.map((w) => w.eventId));
    return _H2hData(results[0] as List<LeaguePeriod>, settled, events);
  }

  Future<void> _reload() async {
    final f = _load();
    setState(() => _future = f);
    await Future.wait([f, widget.onRefresh()]);
  }

  @override
  Widget build(BuildContext context) {
    final me = context.read<AuthController>().user?.id ?? '';
    return RefreshIndicator(
      onRefresh: _reload,
      child: FutureBuilder<_H2hData>(
        future: _future,
        builder: (context, snap) {
          final d = snap.data;
          final body = <Widget>[];
          if (d == null && snap.connectionState == ConnectionState.waiting) {
            body.add(const Skeleton(height: 160, radius: WaygerzRadius.xl));
          } else if (snap.hasError) {
            body.add(ErrorCard(title: "Couldn't load results", error: snap.error, onRetry: _reload));
          } else {
            // Settled bets by week; only weeks with results are options, newest first.
            final byPeriod = <String, List<Wager>>{};
            for (final w in d!.settled) {
              byPeriod.putIfAbsent(w.periodId ?? '_none', () => []).add(w);
            }
            final periods = [...d.periods]..sort((a, b) => b.index.compareTo(a.index));
            // Newest first (the default), shown oldest → newest like My Picks.
            final options = [
              for (final p in periods)
                if (byPeriod[p.id]?.isNotEmpty ?? false) WeekChip(p.id, shortPeriodLabel(p.label), _weekEnding(p)),
              if (byPeriod['_none']?.isNotEmpty ?? false) const WeekChip('_none', 'Other', 'Other'),
            ];
            if (options.isEmpty) {
              body.add(_noResults(context, 'No results yet — settled bets show up here by week.'));
            } else {
              final selected = options.any((o) => o.value == _selected) ? _selected! : options.first.value;
              final chip = options.firstWhere((o) => o.value == selected);
              final week = byPeriod[selected] ?? const <Wager>[];
              final recon = reconcile(week, me);
              body.addAll([
                WeekChips<String>(weeks: options.reversed.toList(), value: selected,
                    onChanged: (v) => setState(() => _selected = v)),
                const SizedBox(height: 16),
                SectionTitle('Results · ${chip.title}', subtitle: '${week.length} settled bet${week.length == 1 ? '' : 's'}'),
                const SizedBox(height: 16),
                if (recon.wins + recon.losses > 0) ...[_reconCard(context, recon), const SizedBox(height: 16)],
                for (final g in groupWagers(week, me)) WagerBetCard(group: g, me: me, event: d.events[g.rep.eventId]),
              ]);
            }
          }
          return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [...widget.header, ...body]);
        },
      ),
    );
  }

  Widget _reconCard(BuildContext context, Recon r) {
    final c = WaygerzColors.of(context);
    return WzCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Text('This week', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
          const Spacer(),
          Text('${r.wins}–${r.losses}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.mutedForeground)),
          const SizedBox(width: 10),
          if (r.even)
            Text('even', style: TextStyle(fontSize: 14, color: c.mutedForeground))
          else
            ..._deltas(c, r.netCents, r.netBeers, r.netShots, size: 16),
        ]),
        const SizedBox(height: 8),
        Divider(color: c.border, height: 1),
        for (final o in r.perOpp.values)
          Container(
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
            child: Row(children: [
              Expanded(child: Text(o.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 14, color: c.foreground))),
              ..._oppAmount(c, o),
            ]),
          ),
      ]),
    );
  }

  /// "you won +$20" / "you owe −1 🍺" for a single currency; bare deltas for a mix.
  List<Widget> _oppAmount(WaygerzColors c, OppRecon o) {
    final parts = _deltas(c, o.netCents, o.netBeers, o.netShots, size: 14);
    if (parts.isEmpty) return [Text('even', style: TextStyle(fontSize: 14, color: c.mutedForeground))];
    final single = [o.netCents, o.netBeers, o.netShots].where((v) => v != 0).toList();
    return [
      if (single.length == 1) ...[
        Text(single.first > 0 ? 'you won' : 'you owe', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
        const SizedBox(width: 6),
      ],
      ...parts,
    ];
  }

  List<Widget> _deltas(WaygerzColors c, int cents, int beers, int shots, {required double size}) {
    Widget delta(String text, bool up) => Padding(
          padding: const EdgeInsets.only(left: 6),
          child: Text(text, style: TextStyle(fontSize: size, fontWeight: FontWeight.w600, color: up ? c.brand : c.destructive)),
        );
    return [
      if (cents != 0) delta('${cents > 0 ? '+' : '−'}${formatCredits(cents.abs())}', cents > 0),
      if (beers != 0) delta('${beers > 0 ? '+' : '−'}${beers.abs()}🍺', beers > 0),
      if (shots != 0) delta('${shots > 0 ? '+' : '−'}${shots.abs()}🥃', shots > 0),
    ];
  }
}

// ----------------------------------------------------------------- pick'em

class _PickemResults extends StatefulWidget {
  const _PickemResults({required this.api, required this.league, required this.header, required this.onRefresh});
  final ApiClient api;
  final League league;
  final List<Widget> header;
  final Future<void> Function() onRefresh;

  @override
  State<_PickemResults> createState() => _PickemResultsState();
}

class _PickemResultsState extends State<_PickemResults> {
  late final LeaguesApi _leagues = LeaguesApi(widget.api);
  List<LeaguePeriod>? _periods;
  Object? _periodsError;
  String _periodId = '';
  Future<PeriodResults>? _results;
  List<SportEvent>? _games;
  bool _confirming = false;

  @override
  void initState() {
    super.initState();
    _loadPeriods();
  }

  Future<void> _loadPeriods() async {
    try {
      final ps = [...await _leagues.periods(widget.league.id)]..sort((a, b) => a.index.compareTo(b.index));
      if (!mounted) return;
      final open = ps.where((p) => p.isOpen).firstOrNull;
      setState(() {
        _periods = ps;
        _periodsError = null;
        if (ps.every((p) => p.id != _periodId)) _periodId = open?.id ?? (ps.isEmpty ? '' : ps.last.id);
        _results = _periodId.isEmpty ? null : _leagues.periodResults(widget.league.id, _periodId);
      });
      _loadGames();
    } catch (e) {
      if (mounted) setState(() => _periodsError = e);
    }
  }

  Future<void> _reload() => Future.wait([_loadPeriods(), widget.onRefresh()]);

  void _select(String id) {
    setState(() {
      _periodId = id;
      _results = _leagues.periodResults(widget.league.id, id);
    });
    _loadGames();
  }

  /// The week's games, for the "finished / left" line (same query as My Picks).
  Future<void> _loadGames() async {
    final period = _periods?.where((p) => p.id == _periodId).firstOrNull;
    final ids = [for (final s in widget.league.sports) s.id];
    setState(() => _games = null);
    if (period == null || ids.isEmpty) return;
    try {
      final games = await EventsApi(widget.api).inWindow(ids, period.startsAt, period.endsAt);
      if (mounted && period.id == _periodId) setState(() => _games = games.where((e) => e.status != 'cancelled').toList());
    } catch (_) {/* the subtitle is optional */}
  }

  String? get _gamesLine {
    final games = _games;
    if (games == null) return null;
    if (games.isEmpty) return 'No games this week.';
    final done = games.where((e) => e.status == 'final').length;
    return done == games.length
        ? 'All ${games.length} games final.'
        : '$done of ${games.length} games final · ${games.length - done} left';
  }

  Future<void> _confirm(WeeklyResultRow r) async {
    final next = !r.confirmed;
    final ok = await confirmWz(
      context,
      title: next ? 'Confirm results?' : 'Unconfirm results?',
      description: next
          ? "Mark ${r.displayName}'s picks for this week as confirmed."
          : "Remove the confirmation on ${r.displayName}'s picks for this week.",
      confirmLabel: next ? 'Confirm' : 'Unconfirm',
    );
    if (!ok || !mounted) return;
    final toast = Toaster.of(context);
    setState(() => _confirming = true);
    try {
      await _leagues.confirmMember(widget.league.id, _periodId, r.userId, next);
      _select(_periodId);
    } catch (e) {
      toast.failure(e);
    } finally {
      if (mounted) setState(() => _confirming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final body = <Widget>[];
    if (_periods == null && _periodsError == null) {
      body.add(const Skeleton(height: 160, radius: WaygerzRadius.xl));
    } else if (_periodsError != null) {
      body.add(ErrorCard(title: "Couldn't load the weeks", error: _periodsError, onRetry: _loadPeriods));
    } else if (_periods!.isEmpty) {
      body.add(_noResults(context, 'No weeks yet.'));
    } else {
      final period = _periods!.where((p) => p.id == _periodId).firstOrNull;
      body.addAll([
        WeekChips<String>(
          weeks: [for (final p in _periods!) WeekChip(p.id, shortPeriodLabel(p.label), p.label)],
          value: _periodId,
          onChanged: _select,
        ),
        const SizedBox(height: 16),
        SectionTitle('Results · ${period?.label ?? ''}', subtitle: _gamesLine),
        const SizedBox(height: 16),
        FutureBuilder<PeriodResults>(
          future: _results,
          builder: (context, snap) {
            if (snap.data == null && snap.connectionState == ConnectionState.waiting) {
              return const Skeleton(height: 160, radius: WaygerzRadius.xl);
            }
            if (snap.hasError) {
              return ErrorCard(title: "Couldn't load this week", error: snap.error, onRetry: () => _select(_periodId));
            }
            final res = snap.data;
            if (res == null || res.rows.isEmpty) return _noResults(context, 'No picks for this week yet.');
            return _leaderboard(context, res, period);
          },
        ),
      ]);
    }
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [...widget.header, ...body]),
    );
  }

  Widget _leaderboard(BuildContext context, PeriodResults res, LeaguePeriod? period) {
    final c = WaygerzColors.of(context);
    final me = context.read<AuthController>().user?.id;
    final canModerate = widget.league.myRole == 'commissioner' || widget.league.myRole == 'moderator';
    final roles = {for (final m in widget.league.members) m.userId: m.role};
    final rankCounts = <int, int>{};
    for (final r in res.rows) {
      rankCounts[r.rank] = (rankCounts[r.rank] ?? 0) + 1;
    }
    // Crown the winner(s) only once the week is final, and list them once.
    final weekFinal = period?.status == 'final';
    final winners = weekFinal ? res.rows.where((r) => r.rank == 1 && r.graded > 0).toList() : <WeeklyResultRow>[];
    final winnerIds = {for (final w in winners) w.userId};
    final label = period?.label ?? '';

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (winners.isNotEmpty) ...[
        _WinnerCard(winners: winners, weekLabel: label, actualTotal: res.actualTotal, onPick: (w) => _showPicks(w, label)),
        const SizedBox(height: 16),
      ],
      for (final r in res.rows.where((r) => !winnerIds.contains(r.userId)))
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: WzCard(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              Expanded(
                child: InkWell(
                  onTap: () => _showPicks(r, label),
                  child: Row(children: [
                    Container(
                      width: 20,
                      height: 20,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: c.muted, shape: BoxShape.circle),
                      child: Text((rankCounts[r.rank] ?? 0) > 1 ? 'T${r.rank}' : '${r.rank}',
                          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: c.mutedForeground)),
                    ),
                    const SizedBox(width: 12),
                    UserAvatar(userId: r.userId, name: r.displayName, avatarKey: r.avatarKey, size: 56),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text.rich(TextSpan(children: [
                          TextSpan(text: r.displayName),
                          if (r.userId == me) TextSpan(text: ' (you)', style: TextStyle(fontWeight: FontWeight.w400, color: c.mutedForeground)),
                        ]), maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
                        const SizedBox(height: 2),
                        Text(memberRoleLabel(roles[r.userId] ?? 'member'), style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                      ]),
                    ),
                    Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text.rich(TextSpan(children: [
                        TextSpan(text: '${r.correct}'),
                        TextSpan(text: '/${r.graded > 0 ? r.graded : r.total}',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w400, color: c.mutedForeground)),
                      ]), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: c.foreground)),
                      Text('correct', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                      if (r.tiebreakerTotal != null)
                        Text.rich(TextSpan(children: [
                          TextSpan(text: '${r.tiebreakerTotal}'),
                          TextSpan(text: '/${res.actualTotal ?? '—'}',
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w400, color: c.mutedForeground)),
                        ]), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.foreground)),
                    ]),
                  ]),
                ),
              ),
              const SizedBox(width: 4),
              // The weekly confirmation: a toggle for moderators, a status icon for everyone else.
              IconButton(
                tooltip: canModerate
                    ? (r.confirmed ? 'Confirmed — tap to unconfirm' : 'Not confirmed — tap to confirm')
                    : (r.confirmed ? 'Confirmed' : 'Not confirmed'),
                onPressed: canModerate && !_confirming ? () => _confirm(r) : null,
                icon: Icon(LucideIcons.circleCheckBig, size: 24,
                    color: r.confirmed ? c.brand : c.mutedForeground.withValues(alpha: 0.4)),
              ),
            ]),
          ),
        ),
    ]);
  }

  void _showPicks(WeeklyResultRow member, String weekLabel) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _MemberPicks(api: widget.api, league: widget.league, periodId: _periodId, weekLabel: weekLabel, member: member),
    );
  }
}

/// The week's winner(s), above the leaderboard (web WeekWinnerCard). A tie
/// opens a chooser; a solo winner opens their picks.
class _WinnerCard extends StatelessWidget {
  const _WinnerCard({required this.winners, required this.weekLabel, required this.actualTotal, required this.onPick});
  final List<WeeklyResultRow> winners;
  final String weekLabel;
  final int? actualTotal;
  final ValueChanged<WeeklyResultRow> onPick;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final solo = winners.length == 1;
    final top = winners.first;
    final names = [for (final w in winners) w.displayName];
    final nameLine = solo
        ? names[0]
        : names.length == 2
            ? '${names[0]} & ${names[1]}'
            : names.length == 3
                ? '${names[0]}, ${names[1]} & ${names[2]}'
                : '${names[0]}, ${names[1]} & ${names.length - 2} more';
    final shown = winners.take(3).toList();
    final extra = winners.length - shown.length;

    return WzCard(
      padding: EdgeInsets.zero,
      clip: true,
      onTap: () => solo ? onPick(top) : _chooser(context),
      child: Stack(children: [
        Container(height: 2, color: Tw.amber400),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            if (solo)
              Stack(clipBehavior: Clip.none, children: [
                Container(
                  padding: const EdgeInsets.all(2),
                  decoration: const BoxDecoration(shape: BoxShape.circle, color: Tw.amber400),
                  child: Container(
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(shape: BoxShape.circle, color: c.card),
                    child: UserAvatar(userId: top.userId, name: top.displayName, avatarKey: top.avatarKey, size: 60),
                  ),
                ),
                Positioned(
                  right: -4,
                  bottom: -4,
                  child: Container(
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(shape: BoxShape.circle, color: c.card),
                    child: const Icon(LucideIcons.medal, size: 20, color: Tw.amber400),
                  ),
                ),
              ])
            else
              SizedBox(
                height: 56,
                width: 56 + (shown.length - 1 + (extra > 0 ? 1 : 0)) * 40,
                child: Stack(children: [
                  for (var i = 0; i < shown.length; i++)
                    Positioned(
                      left: i * 40.0,
                      child: UserAvatar(userId: shown[i].userId, name: shown[i].displayName, avatarKey: shown[i].avatarKey, size: 56),
                    ),
                  if (extra > 0)
                    Positioned(
                      left: shown.length * 40.0,
                      child: Container(
                        width: 56,
                        height: 56,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(color: c.muted, shape: BoxShape.circle),
                        child: Text('+$extra', style: TextStyle(fontWeight: FontWeight.w700, color: c.mutedForeground)),
                      ),
                    ),
                ]),
              ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  const Icon(LucideIcons.trophy, size: 14, color: Tw.amber400),
                  const SizedBox(width: 6),
                  Text(solo ? 'CHAMPION' : 'CO-WINNERS${winners.length > 2 ? ' · ${winners.length}-WAY' : ''}',
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.8, color: Tw.amber400)),
                ]),
                const SizedBox(height: 2),
                Text(nameLine, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: c.foreground)),
                Text(solo ? 'Won $weekLabel' : weekLabel, style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                const SizedBox(height: 8),
                Text.rich(TextSpan(children: [
                  TextSpan(text: '${top.correct}/${top.graded > 0 ? top.graded : top.total}',
                      style: TextStyle(fontWeight: FontWeight.w700, color: c.brand)),
                  TextSpan(text: ' correct${solo ? '' : ' · tied'}'),
                  if (solo && top.tiebreakerTotal != null) ...[
                    const TextSpan(text: '   '),
                    TextSpan(text: '${top.tiebreakerTotal}/${actualTotal ?? '—'}',
                        style: TextStyle(fontWeight: FontWeight.w700, color: c.foreground)),
                    const TextSpan(text: ' tiebreaker'),
                  ],
                ]), style: TextStyle(fontSize: 12, color: c.mutedForeground)),
              ]),
            ),
            Icon(LucideIcons.chevronRight, size: 20, color: c.mutedForeground),
          ]),
        ),
        Positioned(
          top: 12,
          right: -28,
          child: Transform.rotate(
            angle: 0.785,
            child: Container(
              width: 110,
              padding: const EdgeInsets.symmetric(vertical: 3),
              color: Tw.amber400,
              child: Text(solo ? '1ST' : 'TIE', textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1, color: Color(0xFF451A03))),
            ),
          ),
        ),
      ]),
    );
  }

  void _chooser(BuildContext context) {
    showWzDialog<void>(context, builder: (ctx) {
      final c = WaygerzColors.of(ctx);
      return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Co-winners${weekLabel.isNotEmpty ? ' — $weekLabel' : ''}',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: c.foreground)),
        const SizedBox(height: 4),
        Text('Tap a winner to see their picks for the week.', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
        const SizedBox(height: 12),
        for (final w in winners)
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 8),
            leading: UserAvatar(userId: w.userId, name: w.displayName, avatarKey: w.avatarKey, size: 44),
            title: Text(w.displayName, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
            trailing: Text('${w.correct}/${w.graded > 0 ? w.graded : w.total}',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
            onTap: () {
              Navigator.of(ctx).pop();
              onPick(w);
            },
          ),
      ]);
    });
  }
}

/// A member's picks for the week (web MemberPicksDialog); hidden by the
/// backend until an hour before the first game.
class _MemberPicks extends StatefulWidget {
  const _MemberPicks({required this.api, required this.league, required this.periodId, required this.weekLabel, required this.member});
  final ApiClient api;
  final League league;
  final String periodId;
  final String weekLabel;
  final WeeklyResultRow member;

  @override
  State<_MemberPicks> createState() => _MemberPicksState();
}

class _MemberPicksState extends State<_MemberPicks> {
  late final Future<List<Pick>> _future = LeaguesApi(widget.api).memberPicks(widget.league.id, widget.periodId, widget.member.userId);
  Map<String, SportEvent> _events = {};

  @override
  void initState() {
    super.initState();
    // The picks carry no kickoff time; caption each game from the ingestor.
    _future.then((picks) async {
      final e = await EventsApi(widget.api).events(picks.map((p) => p.eventId));
      if (mounted) setState(() => _events = e);
    }).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final m = widget.member;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
      child: ListView(shrinkWrap: true, padding: const EdgeInsets.fromLTRB(20, 0, 20, 24), children: [
        Text('${m.displayName}’s picks', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: c.foreground)),
        Text(widget.weekLabel.isEmpty ? 'Selected week' : widget.weekLabel, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
        const SizedBox(height: 16),
        FutureBuilder<List<Pick>>(
          future: _future,
          builder: (context, snap) {
            if (snap.data == null && snap.connectionState == ConnectionState.waiting) {
              return const Skeleton(height: 96, radius: WaygerzRadius.xl);
            }
            if (snap.hasError) {
              return Text('Picks are hidden until an hour before the first game.', style: TextStyle(fontSize: 14, color: c.mutedForeground));
            }
            final picks = snap.data!;
            if (picks.isEmpty) return Text('No picks for this week.', style: TextStyle(fontSize: 14, color: c.mutedForeground));
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              for (final p in picks) _pick(c, p),
              if (m.tiebreakerTotal != null)
                Container(
                  margin: const EdgeInsets.only(top: 4),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: c.muted.withValues(alpha: 0.3),
                    border: Border.all(color: c.border),
                    borderRadius: BorderRadius.circular(WaygerzRadius.lg),
                  ),
                  child: Row(children: [
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('TIE-BREAKER · TOTAL POINTS',
                            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, letterSpacing: 0.5, color: c.foreground)),
                        if (m.tiebreakerDiff != null)
                          Text('off by ${m.tiebreakerDiff}', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                      ]),
                    ),
                    Text('${m.tiebreakerTotal}', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: c.foreground)),
                  ]),
                ),
            ]);
          },
        ),
      ]),
    );
  }

  Widget _pick(WaygerzColors c, Pick p) {
    // The picked side, tinted by result: blue ungraded, green correct, red wrong.
    final tone = p.correct == null
        ? Tw.blue500.withValues(alpha: 0.2)
        : (p.correct! ? c.brand : c.destructive).withValues(alpha: 0.2);
    final start = _events[p.eventId]?.startTime;
    Widget side(String? logo, String label, int? score, bool picked) => Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            color: picked ? tone : c.muted.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(WaygerzRadius.md),
          ),
          child: Row(children: [
            TeamLogo(name: label, abbreviation: label, logo: logo, size: 32),
            const SizedBox(width: 10),
            Expanded(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground))),
            if (score != null) Text('$score', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: c.foreground)),
          ]),
        );
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (start != null)
          Padding(
            padding: const EdgeInsets.only(left: 2, bottom: 6),
            child: Text(formatStart(start), style: TextStyle(fontSize: 12, color: c.mutedForeground)),
          ),
        side(p.awayLogo, p.awayAbbr ?? p.awayTeam ?? '?', p.awayScore, p.pickSide == 'away'),
        const SizedBox(height: 6),
        side(p.homeLogo, p.homeAbbr ?? p.homeTeam ?? '?', p.homeScore, p.pickSide == 'home'),
      ]),
    );
  }
}
