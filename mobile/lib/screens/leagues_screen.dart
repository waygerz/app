import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/leagues_api.dart';
import '../auth/auth_controller.dart';
import '../format.dart';
import '../models.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import 'create_league_screen.dart';
import 'league_detail_screen.dart';
import 'widgets.dart';

/// My Leagues (web app/(app)/page.tsx): pending invites with Accept, then a
/// card per league — logo, name, type chip, member avatar stack, Draft /
/// unread count. Loading, error and empty states match the web.
class LeaguesScreen extends StatefulWidget {
  const LeaguesScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<LeaguesScreen> createState() => _LeaguesScreenState();
}

class _LeaguesScreenState extends State<LeaguesScreen> {
  late final LeaguesApi _leagues = LeaguesApi(widget.api);
  late Future<List<League>> _list = _leagues.myLeagues();
  late Future<List<LeagueInvite>> _invites = _leagues.invites();
  String? _accepting;

  Future<void> _reload() async {
    final l = _leagues.myLeagues();
    final i = _leagues.invites();
    setState(() {
      _list = l;
      _invites = i;
    });
    await Future.wait([l, i.catchError((_) => <LeagueInvite>[])]);
  }

  Future<void> _accept(LeagueInvite inv) async {
    final toast = Toaster.of(context);
    setState(() => _accepting = inv.leagueId);
    try {
      await _leagues.acceptInvite(inv.leagueId);
      toast.success('Invite accepted');
      await _reload();
    } catch (e) {
      toast.failure(e);
    } finally {
      if (mounted) setState(() => _accepting = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
        children: [
          FutureBuilder<List<LeagueInvite>>(
            future: _invites,
            builder: (context, snap) {
              if (snap.hasError) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 24),
                  child: NoticeBanner(
                    message: "Couldn't load your invites.",
                    busy: snap.connectionState == ConnectionState.waiting,
                    onRetry: () => setState(() => _invites = _leagues.invites()),
                  ),
                );
              }
              final invites = snap.data ?? const <LeagueInvite>[];
              if (invites.isEmpty) return const SizedBox.shrink();
              return _invitesSection(context, invites);
            },
          ),
          FutureBuilder<List<League>>(
            future: _list,
            builder: (context, snap) {
              if (snap.connectionState == ConnectionState.waiting && snap.data == null) {
                return Column(children: List.generate(4, (_) => const _LeagueCardSkeleton()));
              }
              if (snap.hasError) {
                return ErrorCard(title: "Couldn't load your leagues", error: snap.error, onRetry: _reload);
              }
              final leagues = snap.data ?? const <League>[];
              if (leagues.isEmpty) return _empty(context);
              return Column(children: [
                for (final l in leagues)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _LeagueCard(api: widget.api, league: l, onReturn: _reload),
                  ),
                const SizedBox(height: 12),
                WzButton(label: 'Create league', icon: LucideIcons.plus, variant: ButtonVariant.outline,
                    size: ButtonSize.lg, onPressed: _createLeague),
              ]);
            },
          ),
        ],
      ),
    );
  }

  Future<void> _createLeague() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CreateLeagueScreen(api: widget.api)));
    await _reload();
  }

  Widget _invitesSection(BuildContext context, List<LeagueInvite> invites) {
    final c = WaygerzColors.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 32),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(color: c.primary.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(WaygerzRadius.md)),
            child: Icon(LucideIcons.inbox, size: 14, color: c.primary),
          ),
          const SizedBox(width: 8),
          Text('Invites (${invites.length})', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
        ]),
        const SizedBox(height: 12),
        for (final inv in invites)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: WzCard(
              clip: true,
              padding: EdgeInsets.zero,
              child: IntrinsicHeight(
                child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  // The gradient edge bar (primary → fuchsia).
                  Container(
                    width: 6,
                    decoration: BoxDecoration(
                      gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter,
                          colors: [c.primary, Tw.fuchsia500]),
                    ),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 16, 16, 16),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        Row(children: [
                          LeagueAvatar(name: inv.leagueName, id: inv.leagueId, logo: inv.leagueLogo, size: 40),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(inv.leagueName, maxLines: 1, overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.foreground)),
                              Text(
                                '${leagueTypeLabel(inv.leagueType)}'
                                '${inv.inviterName != null ? ' · invited by ${inv.inviterName}' : ''}',
                                style: TextStyle(fontSize: 12, color: c.mutedForeground),
                              ),
                            ]),
                          ),
                        ]),
                        const SizedBox(height: 12),
                        WzButton(
                          label: 'Accept',
                          size: ButtonSize.sm,
                          expand: true,
                          busy: _accepting == inv.leagueId,
                          onPressed: _accepting == null ? () => _accept(inv) : null,
                        ),
                      ]),
                    ),
                  ),
                ]),
              ),
            ),
          ),
      ]),
    );
  }

  Widget _empty(BuildContext context) {
    final c = WaygerzColors.of(context);
    return CenterCard(children: [
      IconTile(
        icon: LucideIcons.trophy,
        gradient: LinearGradient(colors: [c.primary, Tw.fuchsia500, c.brand],
            begin: Alignment.topLeft, end: Alignment.bottomRight),
      ),
      const SizedBox(height: 8),
      Text('No leagues yet', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.foreground)),
      Text('Create a league or join one with a code to start playing.',
          textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
      const SizedBox(height: 8),
      _GradientButton(label: 'Create your first league', onPressed: _createLeague),
    ]);
  }
}

/// Per-type accent, as the web: Pick'em amber (trophy), H2H violet (swords).
({Color bg, Color fg, IconData icon}) leagueTypeAccent(BuildContext context, String type) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  return type == 'pickem'
      ? (bg: Tw.amber500.withValues(alpha: 0.15), fg: dark ? Tw.amber400 : Tw.amber600, icon: LucideIcons.trophy)
      : (bg: Tw.violet500.withValues(alpha: 0.15), fg: dark ? Tw.violet400 : Tw.violet600, icon: LucideIcons.swords);
}

class _LeagueCard extends StatelessWidget {
  const _LeagueCard({required this.api, required this.league, required this.onReturn});
  final ApiClient api;
  final League league;
  final Future<void> Function() onReturn;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final me = context.read<AuthController>().user?.id;
    final a = leagueTypeAccent(context, league.leagueType);
    // Never the viewer's own avatar — the stack is for seeing who else is in.
    final others = league.topMembers.where((m) => m.userId != me).toList();
    final shown = others.take(3).toList();
    final extra = (league.memberCount - 1 - shown.length).clamp(0, 1 << 30);

    return WzCard(
      onTap: () async {
        await Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => LeagueDetailScreen(api: api, league: league)),
        );
        await onReturn(); // unread counts / status may have changed
      },
      child: Row(children: [
        LeagueAvatar(name: league.name, id: league.id, logo: league.logoUrl, size: 72),
        const SizedBox(width: 16),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(league.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, letterSpacing: -0.3, color: c.foreground)),
            const SizedBox(height: 8),
            Row(children: [
              Tooltip(
                message: leagueTypeLabel(league.leagueType),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                  decoration: BoxDecoration(color: a.bg, borderRadius: BorderRadius.circular(WaygerzRadius.md)),
                  child: Icon(a.icon, size: 14, color: a.fg),
                ),
              ),
              if (shown.isNotEmpty) ...[
                const SizedBox(width: 10),
                AvatarStack(members: shown, extra: extra),
              ],
            ]),
          ]),
        ),
        const SizedBox(width: 8),
        if (league.isDraft) const WzBadge('Draft', variant: BadgeVariant.warning),
        if (league.unreadFeedCount > 0) ...[
          const SizedBox(width: 8),
          CountBadge(league.unreadFeedCount),
        ],
      ]),
    );
  }
}

/// Overlapping 36px member avatars ringed in the card color, plus "+n".
class AvatarStack extends StatelessWidget {
  const AvatarStack({super.key, required this.members, this.extra = 0, this.size = 36});
  final List<LeagueMember> members;
  final int extra;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final items = <Widget>[
      for (final m in members) UserAvatar(userId: m.userId, name: m.displayName, avatarKey: m.avatarKey, size: size - 4),
      if (extra > 0)
        Container(
          width: size - 4,
          height: size - 4,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: c.muted, shape: BoxShape.circle),
          child: Text('+$extra', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: c.mutedForeground)),
        ),
    ];
    const overlap = 10.0;
    return SizedBox(
      height: size,
      width: size + (items.length - 1) * (size - overlap),
      child: Stack(children: [
        for (var i = 0; i < items.length; i++)
          Positioned(
            left: i * (size - overlap),
            child: Container(
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(color: c.card, shape: BoxShape.circle),
              child: items[i],
            ),
          ),
      ]),
    );
  }
}

class _LeagueCardSkeleton extends StatelessWidget {
  const _LeagueCardSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.only(bottom: 12),
      child: WzCard(
        child: Row(children: [
          Skeleton(width: 72, height: 72, radius: WaygerzRadius.xl),
          SizedBox(width: 16),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SkeletonLine(widthFactor: 0.66, height: 24),
              SizedBox(height: 10),
              Row(children: [
                Skeleton(width: 96, height: 24),
                SizedBox(width: 10),
                Skeleton(width: 96, height: 36, radius: 18),
              ]),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// The empty state's CTA: primary → fuchsia gradient with a soft glow (web).
class _GradientButton extends StatelessWidget {
  const _GradientButton({required this.label, required this.onPressed});
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [c.primary, Tw.fuchsia600]),
        borderRadius: BorderRadius.circular(WaygerzRadius.md),
        boxShadow: [BoxShadow(color: c.primary.withValues(alpha: 0.2), blurRadius: 8, offset: const Offset(0, 4))],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(WaygerzRadius.md),
          onTap: onPressed,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(LucideIcons.plus, size: 16, color: Colors.white),
              const SizedBox(width: 6),
              Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Colors.white)),
            ]),
          ),
        ),
      ),
    );
  }
}
