import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../api/api_client.dart';
import '../api/leagues_api.dart';
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
enum LeagueSection { feed, upcoming, sports, play, standings, wallet, members, manage }

/// League detail (web app/(app)/leagues/[id]/layout.tsx): the header — logo
/// (tap for details + invite), type/Draft badges, balance, members · period —
/// then the section pills in the web's order: Feed, Upcoming + Sports (money
/// leagues: tap a game to bet), Bets / Picks, Standings (weeks + Overall), Wallet
/// (money), Members, and Manage for the commissioner.
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
  /// The open section; the league opens on its Feed, like the web.
  late LeagueSection _section = widget.initialSection;
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
          // A section the league doesn't have (a link opened the wrong type, or
          // a role changed) falls back to the Feed.
          final available = _sections(lg);
          final section = available.any((t) => t.value == _section) ? _section : LeagueSection.feed;
          final header = _header(context, lg, section, available);
          // Play needs an active league (web LeaguePlay).
          if (section == LeagueSection.play && !lg.isActive) {
            final c = WaygerzColors.of(context);
            return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [
              ...header,
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
        },
      ),
    );
  }

  /// Header + section pills, scrolled with each section's list.
  /// The web's section pills for this league and viewer.
  List<PillTab<LeagueSection>> _sections(League lg) => [
        const PillTab(LeagueSection.feed, 'Feed'),
        if (lg.isMoney) const PillTab(LeagueSection.upcoming, 'Upcoming'),
        if (lg.isMoney) const PillTab(LeagueSection.sports, 'Sports'),
        PillTab(LeagueSection.play, lg.isPickem ? 'Picks' : 'Bets'),
        const PillTab(LeagueSection.standings, 'Standings'),
        if (lg.isMoney) const PillTab(LeagueSection.wallet, 'Wallet'),
        const PillTab(LeagueSection.members, 'Members'),
        if (lg.myRole == 'commissioner') const PillTab(LeagueSection.manage, 'Manage'),
      ];

  List<Widget> _header(BuildContext context, League lg, LeagueSection section, List<PillTab<LeagueSection>> sections) {
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
      PillTabs<LeagueSection>(
        tabs: sections,
        value: section,
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
    });
  }
}
