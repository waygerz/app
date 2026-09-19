import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/leagues_api.dart';
import '../auth/auth_controller.dart';
import '../format.dart';
import '../models.dart';
import '../shell/app_header.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import '../widgets/invite_sheet.dart';
import 'bets_screen.dart';
import 'league/feed_tab.dart';
import 'league/manage_tab.dart';
import 'league/members_tab.dart';
import 'league/picks_tab.dart';
import 'league/sports_tab.dart';
import 'league/standings_tab.dart';
import 'league/upcoming_tab.dart';
import 'league/wallet_tab.dart';
import 'widgets.dart';

/// League sections, in the web's tab order. Public so links can open one.
enum LeagueSection { feed, upcoming, sports, play, standings, members, wallet, manage }

/// League detail (web app/(app)/leagues/[id]/layout.tsx). The top bar carries
/// the league's logo, type icon and name. Under it, the league row — balance
/// (money) or my rank (pick'em) over the week; tap it for the details sheet —
/// with Invite (or Activate) on the right, then the underline tab bar in the
/// web's order: Feed, Upcoming + Sports (money leagues: tap a game to bet),
/// Bets / Picks, Standings (weeks + Overall), Members, Wallet (money), and
/// Manage for the commissioner. The row and tabs stay put above the section.
class LeagueDetailScreen extends StatefulWidget {
  const LeagueDetailScreen({super.key, required this.api, required this.league, this.initialSection = LeagueSection.feed});
  final ApiClient api;
  final League league;

  /// The section to open on (links like /leagues/<id>/standings); Feed by default.
  final LeagueSection initialSection;

  @override
  State<LeagueDetailScreen> createState() => _LeagueDetailScreenState();
}

class _LeagueDetailScreenState extends State<LeagueDetailScreen> {
  late final LeaguesApi _leagues = LeaguesApi(widget.api);
  late Future<League> _future = _leagues.league(widget.league.id);

  /// Season standings, for my rank and record (the Standings tab's Overall
  /// table). Null until loaded; empty on failure or before the league starts.
  List<StandingRow>? _rows;
  /// The open section; the league opens on its Feed, like the web.
  late LeagueSection _section = widget.initialSection;
  bool _activating = false;

  @override
  void initState() {
    super.initState();
    _loadStandings();
  }

  Future<void> _loadStandings() async {
    try {
      final rows = await _leagues.standings(widget.league.id);
      if (mounted) setState(() => _rows = rows);
    } catch (_) {
      if (mounted) setState(() => _rows = const []);
    }
  }

  Future<void> _reload() async {
    final f = _leagues.league(widget.league.id);
    setState(() => _future = f);
    await Future.wait([f, _loadStandings()]);
  }

  Future<void> _activate() async {
    final toast = Toaster.of(context);
    setState(() => _activating = true);
    try {
      await _leagues.activate(widget.league.id);
      toast.success('League activated');
      await _reload();
    } catch (e) {
      toast.failure(e);
    } finally {
      if (mounted) setState(() => _activating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(kHeaderHeight),
        child: FutureBuilder<League>(
          future: _future,
          builder: (context, snap) {
            // A link opens with a stub (id only) — use the loaded league.
            final lg = snap.data;
            final stub = widget.league;
            return WaygerzHeader.league(
              name: lg?.name ?? (stub.name.isEmpty ? 'League' : stub.name),
              id: stub.id,
              logo: lg?.logoUrl ?? stub.logoUrl,
              type: lg?.leagueType ?? (stub.name.isEmpty ? null : stub.leagueType),
            );
          },
        ),
      ),
      body: FutureBuilder<League>(
        future: _future,
        builder: (context, snap) {
          final lg = snap.data;
          if (lg == null && snap.connectionState == ConnectionState.waiting) {
            return const Padding(padding: EdgeInsets.all(16), child: Skeleton(height: 160, radius: WaygerzRadius.xl));
          }
          if (lg == null) {
            final c = WaygerzColors.of(context);
            return Padding(
              padding: const EdgeInsets.all(16),
              child: CenterCard(children: [
                Text(snap.error is ApiException ? (snap.error as ApiException).message : 'League not found.',
                    textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
                WzButton(label: 'Back to leagues', variant: ButtonVariant.outline, onPressed: () => Navigator.of(context).pop()),
              ]),
            );
          }
          // A section the league doesn't have (a link opened the wrong type, or
          // a role changed) falls back to the Feed.
          final available = _sections(lg);
          final section = available.any((t) => t.value == _section) ? _section : LeagueSection.feed;
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            _leagueRow(context, lg),
            WzTabBar<LeagueSection>(tabs: available, value: section, onChanged: (s) => setState(() => _section = s)),
            Expanded(child: _body(context, lg, section)),
          ]);
        },
      ),
    );
  }

  /// The open section. Sections still take a `header` (widgets above their
  /// list); the league row and tabs now sit above them, so it's empty.
  Widget _body(BuildContext context, League lg, LeagueSection section) {
    const header = <Widget>[];
    // Play needs an active league (web LeaguePlay).
    if (section == LeagueSection.play && !lg.isActive) {
      final c = WaygerzColors.of(context);
      return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [
        CenterCard(children: [
          Text('This league isn’t active yet.', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
        ]),
      ]);
    }
    void toBets() {
      setState(() => _section = LeagueSection.play);
      _reload(); // the stake leaves the balance
    }
    return switch (section) {
      LeagueSection.feed => FeedTab(key: ValueKey('feed-${lg.id}'), api: widget.api, league: lg, header: header,
          onRefresh: _reload, onLeft: () => Navigator.of(context).pop()),
      LeagueSection.upcoming => UpcomingTab(key: ValueKey('upcoming-${lg.id}'), api: widget.api, league: lg, header: header, onBetSent: toBets),
      LeagueSection.sports => SportsTab(key: ValueKey('sports-${lg.id}'), api: widget.api, league: lg, header: header, onBetSent: toBets),
      LeagueSection.play when lg.isMoney => BetsScreen(key: ValueKey('bets-${lg.id}'), api: widget.api, leagueId: lg.id, header: header),
      LeagueSection.play => PicksTab(key: ValueKey('picks-${lg.id}'), api: widget.api, league: lg, header: header, onRefresh: _reload),
      LeagueSection.standings => StandingsTab(key: ValueKey('standings-${lg.id}'), api: widget.api, league: lg, header: header, onRefresh: _reload),
      LeagueSection.wallet => WalletTab(key: ValueKey('wallet-${lg.id}'), api: widget.api, league: lg, header: header, onRefresh: _reload),
      LeagueSection.members => MembersTab(key: ValueKey('members-${lg.id}'), api: widget.api, league: lg, header: header, onRefresh: _reload),
      LeagueSection.manage => ManageTab(key: ValueKey('manage-${lg.id}'), api: widget.api, league: lg, header: header,
          onRefresh: _reload, onArchived: () => Navigator.of(context).pop()),
    };
  }

  /// The league's sections for this viewer, in the web's tab order.
  List<PillTab<LeagueSection>> _sections(League lg) => [
        const PillTab(LeagueSection.feed, 'Feed'),
        if (lg.isMoney) const PillTab(LeagueSection.upcoming, 'Upcoming'),
        if (lg.isMoney) const PillTab(LeagueSection.sports, 'Sports'),
        PillTab(LeagueSection.play, lg.isPickem ? 'Picks' : 'Bets'),
        const PillTab(LeagueSection.standings, 'Standings'),
        const PillTab(LeagueSection.members, 'Members'),
        if (lg.isMoney) const PillTab(LeagueSection.wallet, 'Wallet'),
        if (lg.myRole == 'commissioner') const PillTab(LeagueSection.manage, 'Manage'),
      ];

  int _memberCount(League lg) => lg.members.isNotEmpty ? lg.members.length : lg.memberCount;

  static String _members(int n) => '$n member${n == 1 ? '' : 's'}';

  /// My standings row, if the standings have loaded and I'm in them.
  StandingRow? _mine(BuildContext context) {
    final me = context.read<AuthController>().user?.id;
    return _rows?.where((r) => r.userId == me).firstOrNull;
  }

  Widget? _periodBadge(WaygerzColors c, League lg) => periodBadge(c, status: lg.status, period: lg.currentPeriod);

  /// The league row (web layout.tsx): balance / rank / Draft over the week —
  /// tap for league details — and Invite (Activate for a draft league's
  /// commissioner) on the right.
  Widget _leagueRow(BuildContext context, League lg) {
    final c = WaygerzColors.of(context);
    final mine = _mine(context);
    final members = _memberCount(lg);
    final big = TextStyle(fontSize: 18, height: 1.2, fontWeight: FontWeight.w700, color: c.foreground,
        fontFeatures: const [FontFeature.tabularFigures()]);
    final small = TextStyle(fontSize: 12, color: c.mutedForeground);
    final rank = mine?.rank;

    final List<Widget> top = lg.isDraft
        ? [_periodBadge(c, lg)!]
        : lg.isMoney
            ? [Text(formatCredits(lg.myBalanceCents ?? 0), style: big), const SizedBox(width: 6), Text('balance', style: small)]
            : rank != null
                ? [Text(ordinal(rank), style: big), const SizedBox(width: 6), Text('of ${_rows!.length}', style: small)]
                : [Text(_members(members), style: big)];
    final bottom = lg.isDraft
        ? Text('${_members(members)} · not started', style: small)
        : _periodBadge(c, lg) ?? Text(_members(members), style: small);
    final activateFirst = lg.isDraft && lg.myRole == 'commissioner';

    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
      child: Row(children: [
        Expanded(
          child: Semantics(
            button: true,
            label: '${lg.name} details',
            child: InkWell(
              borderRadius: BorderRadius.circular(WaygerzRadius.lg),
              onTap: () => _showDetails(context, lg),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: top),
                  const SizedBox(height: 6),
                  Row(children: [
                    Flexible(child: bottom),
                    const SizedBox(width: 4),
                    Icon(LucideIcons.chevronRight, size: 14, color: c.mutedForeground),
                  ]),
                ]),
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        if (activateFirst)
          WzButton(label: _activating ? 'Activating…' : 'Activate', busy: _activating, onPressed: _activate)
        else
          WzButton(
            label: 'Invite',
            icon: LucideIcons.userPlus,
            variant: ButtonVariant.outline,
            onPressed: () => showInviteSheet(context, api: widget.api, league: lg),
          ),
      ]),
    );
  }

  /// League details (web: the drawer opened from the league row): logo, name,
  /// type + week, description, my stats, Invite and the commissioner.
  void _showDetails(BuildContext context, League lg) {
    LeagueMember? commish;
    for (final m in lg.members) {
      if (m.role == 'commissioner') commish = m;
    }
    final mine = _mine(context);
    final rank = mine?.rank;
    final stats = <(String, String)>[
      lg.isMoney
          ? ('Balance', formatCredits(lg.myBalanceCents ?? 0))
          : ('Rank', rank != null ? '${ordinal(rank)} of ${_rows!.length}' : '—'),
      ('Members', '${_memberCount(lg)}'),
      ('Record', mine != null ? formatRecord(mine.wins, mine.losses, mine.pushes) : '—'),
    ];
    showWzSheet<void>(
      context,
      title: 'League details',
      builder: (ctx) {
        final c = WaygerzColors.of(ctx);
        final period = _periodBadge(c, lg);
        return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Center(child: LeagueAvatar(name: lg.name, id: lg.id, logo: lg.logoUrl, size: 64)),
            const SizedBox(height: 12),
            Text(lg.name, textAlign: TextAlign.center,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: c.foreground)),
            const SizedBox(height: 8),
            Wrap(alignment: WrapAlignment.center, spacing: 8, runSpacing: 8, children: [
              WzBadge(leagueTypeLabel(lg.leagueType), icon: lg.isPickem ? LucideIcons.trophy : LucideIcons.swords),
              if (period != null) period,
            ]),
            if ((lg.description ?? '').isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(lg.description!, textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: c.foreground)),
            ],
            const SizedBox(height: 16),
            Container(
              decoration: BoxDecoration(
                color: c.muted.withValues(alpha: 0.3),
                border: Border.all(color: c.border),
                borderRadius: BorderRadius.circular(WaygerzRadius.xl),
              ),
              child: IntrinsicHeight(
                child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  for (final (i, (label, value)) in stats.indexed) ...[
                    if (i > 0) VerticalDivider(width: 1, thickness: 1, color: c.border),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(label, style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                          const SizedBox(height: 2),
                          Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.foreground,
                              fontFeatures: const [FontFeature.tabularFigures()])),
                        ]),
                      ),
                    ),
                  ],
                ]),
              ),
            ),
            const SizedBox(height: 16),
            WzButton(
              label: 'Invite',
              icon: LucideIcons.userPlus,
              expand: true,
              onPressed: () {
                Navigator.of(ctx).pop();
                showInviteSheet(context, api: widget.api, league: lg);
              },
            ),
            if (commish != null) ...[
              const SizedBox(height: 16),
              Divider(color: c.border),
              const SizedBox(height: 12),
              Row(children: [
                UserAvatar(userId: commish.userId, name: commish.displayName, avatarKey: commish.avatarKey, size: 36),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(commish.displayName, maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.foreground)),
                    Text('Commissioner', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                  ]),
                ),
              ]),
            ],
          ]);
      },
    );
  }
}
