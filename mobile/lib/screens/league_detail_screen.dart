import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/leagues_api.dart';
import '../auth/auth_controller.dart';
import '../config.dart';
import '../format.dart';
import '../models.dart';
import '../shell/app_header.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import 'bets_screen.dart';
import 'league/picks_tab.dart';
import 'league/upcoming_tab.dart';
import 'widgets.dart';

enum _Section { upcoming, play, standings }

/// League detail (web app/(app)/leagues/[id]/layout.tsx): the header — logo
/// (tap for details + invite), type/Draft badges, balance, members · period —
/// then the section pills: Upcoming (H2H: tap a game to bet), My Bets / My
/// Picks, Standings. Sections not built on mobile yet (feed, results, members,
/// manage, …) arrive with the mobile feature plan.
class LeagueDetailScreen extends StatefulWidget {
  const LeagueDetailScreen({super.key, required this.api, required this.league});
  final ApiClient api;
  final League league;

  @override
  State<LeagueDetailScreen> createState() => _LeagueDetailScreenState();
}

class _LeagueDetailScreenState extends State<LeagueDetailScreen> {
  late final LeaguesApi _leagues = LeaguesApi(widget.api);
  late Future<League> _future = _leagues.league(widget.league.id);
  late _Section _section = widget.league.isMoney ? _Section.upcoming : _Section.play;
  bool _activating = false;

  Future<void> _reload() async {
    final f = _leagues.league(widget.league.id);
    setState(() => _future = f);
    await f;
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
      appBar: WaygerzHeader.league(name: widget.league.name, id: widget.league.id, logo: widget.league.logoUrl),
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
          final header = _header(context, lg);
          // Play needs an active league (web LeaguePlay).
          if (_section == _Section.play && !lg.isActive) {
            final c = WaygerzColors.of(context);
            return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [
              ...header,
              CenterCard(children: [
                Text('This league isn’t active yet.', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
              ]),
            ]);
          }
          return switch (_section) {
            _Section.upcoming => UpcomingTab(
                key: ValueKey('upcoming-${lg.id}'),
                api: widget.api,
                league: lg,
                header: header,
                onBetSent: () {
                  setState(() => _section = _Section.play);
                  _reload(); // the stake leaves the balance
                },
              ),
            _Section.play when lg.isMoney => BetsScreen(key: ValueKey('bets-${lg.id}'), api: widget.api, leagueId: lg.id, header: header),
            _Section.play => PicksTab(key: ValueKey('picks-${lg.id}'), api: widget.api, league: lg, header: header, onRefresh: _reload),
            _Section.standings => _StandingsTab(api: widget.api, league: lg, header: header, onRefresh: _reload),
          };
        },
      ),
    );
  }

  /// Header + section pills, scrolled with each section's list.
  List<Widget> _header(BuildContext context, League lg) {
    final c = WaygerzColors.of(context);
    final isCommish = lg.myRole == 'commissioner';
    final period = lg.currentPeriod;
    final members = lg.members.isNotEmpty ? lg.members.length : lg.memberCount;
    return [
      Row(children: [
        InkWell(
          customBorder: const CircleBorder(),
          onTap: () => _showDetails(context, lg),
          child: Semantics(label: 'League details', child: LeagueAvatar(name: lg.name, id: lg.id, logo: lg.logoUrl, size: 80)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Wrap(spacing: 8, runSpacing: 8, children: [
              _typeBadge(lg.leagueType),
              if (lg.isDraft) const WzBadge('Draft', variant: BadgeVariant.warning),
            ]),
            if (lg.isMoney) ...[
              const SizedBox(height: 4),
              Text.rich(TextSpan(children: [
                TextSpan(text: formatCredits(lg.myBalanceCents ?? 0),
                    style: TextStyle(fontWeight: FontWeight.w700, color: c.foreground)),
                TextSpan(text: '  balance', style: TextStyle(color: c.mutedForeground)),
              ]), style: const TextStyle(fontSize: 14)),
            ],
            const SizedBox(height: 4),
            Text(
              '$members member${members == 1 ? '' : 's'}'
              '${period != null ? ' · ${period.label} (${period.status})' : ''}',
              style: TextStyle(fontSize: 12, color: c.mutedForeground),
            ),
          ]),
        ),
      ]),
      if (lg.isDraft && isCommish) ...[
        const SizedBox(height: 16),
        WzButton(label: _activating ? 'Activating…' : 'Activate league', expand: true, busy: _activating,
            onPressed: _activate),
      ],
      const SizedBox(height: 16),
      PillTabs<_Section>(
        tabs: [
          if (lg.isMoney) const PillTab(_Section.upcoming, 'Upcoming'),
          PillTab(_Section.play, lg.isPickem ? 'My Picks' : 'My Bets'),
          const PillTab(_Section.standings, 'Standings'),
        ],
        value: _section,
        onChanged: (s) => setState(() => _section = s),
      ),
      const SizedBox(height: 24),
    ];
  }

  Widget _typeBadge(String type) =>
      WzBadge(leagueTypeLabel(type), icon: type == 'pickem' ? LucideIcons.trophy : LucideIcons.swords);

  /// Web: the league details dialog opened by tapping the logo.
  void _showDetails(BuildContext context, League lg) {
    LeagueMember? commish;
    for (final m in lg.members) {
      if (m.role == 'commissioner') commish = m;
    }
    final period = lg.currentPeriod;
    final members = lg.members.length;
    showWzDialog<void>(context, builder: (ctx) {
      final c = WaygerzColors.of(ctx);
      return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Center(child: LeagueAvatar(name: lg.name, id: lg.id, logo: lg.logoUrl, size: 88)),
        const SizedBox(height: 16),
        Text(lg.name, textAlign: TextAlign.center,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: c.foreground)),
        const SizedBox(height: 6),
        Wrap(alignment: WrapAlignment.center, spacing: 8, children: [
          _typeBadge(lg.leagueType),
          if (lg.isDraft) const WzBadge('Draft', variant: BadgeVariant.warning),
        ]),
        const SizedBox(height: 6),
        Text(
          '$members member${members == 1 ? '' : 's'}'
          '${period != null ? ' · ${period.label} · ${period.status[0].toUpperCase()}${period.status.substring(1)}' : ''}',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 14, color: c.mutedForeground),
        ),
        if ((lg.description ?? '').isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(lg.description!, textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: c.foreground)),
        ],
        if (lg.inviteCode != null) ...[
          const SizedBox(height: 16),
          WzButton(
            label: 'Copy invite link',
            icon: LucideIcons.userPlus,
            expand: true,
            onPressed: () async {
              final toast = Toaster.of(ctx);
              await Clipboard.setData(ClipboardData(text: '${Config.webBaseUrl}/c/${lg.inviteCode}'));
              toast.success('Invite link copied');
            },
          ),
        ],
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
    });
  }
}

// ----------------------------------------------------------------- standings

class _StandingsTab extends StatefulWidget {
  const _StandingsTab({required this.api, required this.league, required this.header, required this.onRefresh});
  final ApiClient api;
  final League league;
  final List<Widget> header;
  final Future<void> Function() onRefresh;

  @override
  State<_StandingsTab> createState() => _StandingsTabState();
}

class _StandingsTabState extends State<_StandingsTab> {
  late final LeaguesApi _leagues = LeaguesApi(widget.api);
  late Future<List<StandingRow>> _future = _leagues.standings(widget.league.id);

  Future<void> _reload() async {
    final f = _leagues.standings(widget.league.id);
    setState(() => _future = f);
    await Future.wait([f, widget.onRefresh()]);
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final me = context.read<AuthController>().user?.id;
    final roles = {for (final m in widget.league.members) m.userId: m.role};
    return RefreshIndicator(
      onRefresh: _reload,
      child: FutureBuilder<List<StandingRow>>(
        future: _future,
        builder: (context, snap) {
          final rows = snap.data;
          return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [
            ...widget.header,
            if (rows == null && snap.connectionState == ConnectionState.waiting)
              ...List.generate(4, (_) => const Padding(
                    padding: EdgeInsets.only(bottom: 12),
                    child: Skeleton(height: 80, radius: WaygerzRadius.xl),
                  ))
            else if (snap.hasError)
              ErrorCard(title: "Couldn't load the standings", error: snap.error, onRetry: _reload)
            else if (rows!.isEmpty)
              CenterCard(children: [
                Icon(LucideIcons.trophy, size: 24, color: c.mutedForeground),
                Text('No standings yet.', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
              ])
            else ...[
              Text('Standings (${rows.length})', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.foreground)),
              const SizedBox(height: 16),
              for (final r in rows)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _standingCard(c, r, isMe: r.userId == me, role: roles[r.userId] ?? 'member'),
                ),
            ],
          ]);
        },
      ),
    );
  }

  Widget _standingCard(WaygerzColors c, StandingRow r, {required bool isMe, required String role}) {
    final money = r.balanceCents != null;
    final net = r.netCents ?? 0;
    return WzCard(
      padding: const EdgeInsets.all(12),
      child: Row(children: [
        Container(
          width: 20,
          height: 20,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: c.muted, shape: BoxShape.circle),
          child: Text('${r.rank ?? ''}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: c.mutedForeground)),
        ),
        const SizedBox(width: 8),
        UserAvatar(userId: r.userId, name: r.displayName, avatarKey: r.avatarKey, size: 56),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text.rich(
              TextSpan(children: [
                TextSpan(text: r.displayName),
                if (isMe) TextSpan(text: ' (you)', style: TextStyle(fontWeight: FontWeight.w400, color: c.mutedForeground)),
              ]),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground),
            ),
            const SizedBox(height: 2),
            Text(memberRoleLabel(role), style: TextStyle(fontSize: 12, color: c.mutedForeground)),
          ]),
        ),
        if (money)
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(formatCredits(r.balanceCents!), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
            Text('${net >= 0 ? '+' : ''}${formatCredits(net)} net',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: net >= 0 ? c.brand : c.destructive)),
          ])
        else
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(formatRecord(r.wins, r.losses, r.pushes),
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: c.foreground,
                    fontFeatures: const [FontFeature.tabularFigures()])),
            Text('W–L', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
          ]),
      ]),
    );
  }
}
