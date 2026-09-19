import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/leagues_api.dart';
import '../app_nav.dart';
import '../auth/auth_controller.dart';
import '../format.dart';
import '../models.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import 'create_league_screen.dart';
import 'league_detail_screen.dart';
import 'widgets.dart';

/// My Leagues (web app/(app)/page.tsx): pending invites with Accept, then a
/// card per league — logo, type icon + name over the member faces, my balance
/// or rank; then the week and new posts — and Join with code / Create league.
/// Loading, error and empty states match the web.
class LeaguesScreen extends StatefulWidget {
  const LeaguesScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<LeaguesScreen> createState() => LeaguesScreenState();
}

/// Public so the top bar's + can start a league and refresh the list.
class LeaguesScreenState extends State<LeaguesScreen> {
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
                const SizedBox(height: 4),
                Row(children: [
                  Expanded(
                    child: WzButton(label: 'Join with code', icon: LucideIcons.keyRound, variant: ButtonVariant.outline,
                        onPressed: _joinWithCode),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: WzButton(label: 'Create league', icon: LucideIcons.plus, variant: ButtonVariant.outline,
                        onPressed: createLeague),
                  ),
                ]),
              ]);
            },
          ),
        ],
      ),
    );
  }

  Future<void> createLeague() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => CreateLeagueScreen(api: widget.api)));
    await _reload();
  }

  /// Type or paste an invite code / link, then open it like a shared link
  /// (web components/join-code-sheet.tsx).
  Future<void> _joinWithCode() async {
    final code = await showWzSheet<String>(
      context,
      title: 'Join with code',
      description: 'Enter the code or paste the invite link a friend sent you.',
      builder: (_) => const _JoinCodeSheet(),
    );
    if (code == null || code.isEmpty || !mounted) return;
    context.read<AppNav>().open('/c/$code');
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
      _GradientButton(label: 'Create your first league', onPressed: createLeague),
      WzButton(label: 'Join with code', icon: LucideIcons.keyRound, variant: ButtonVariant.outline, onPressed: _joinWithCode),
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
    // Never the viewer's own avatar — the faces are for seeing who else is in.
    final others = league.topMembers.where((m) => m.userId != me).toList();
    final shown = others.take(3).toList();
    final extra = (league.memberCount - 1 - shown.length).clamp(0, 1 << 30);
    final unread = league.unreadFeedCount;
    final muted = TextStyle(fontSize: 12, color: c.mutedForeground);
    const tabular = [FontFeature.tabularFigures()];

    // The number on the right: my balance (money), my rank (pick'em), or
    // "not started" for a draft.
    final (String, String)? stat = league.isDraft
        ? ('—', 'not started')
        : league.myBalanceCents != null
            ? (formatCredits(league.myBalanceCents!), 'balance')
            : league.myRank != null
                ? (ordinal(league.myRank!), 'of ${league.memberCount}')
                : null;
    final members = '${league.memberCount} member${league.memberCount == 1 ? '' : 's'}';

    return WzCard(
      padding: const EdgeInsets.all(12),
      onTap: () async {
        await Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => LeagueDetailScreen(api: api, league: league)),
        );
        await onReturn(); // unread counts / status may have changed
      },
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        // Row 1: logo, type icon + name over the member faces, my number.
        Row(children: [
          LeagueAvatar(name: league.name, id: league.id, logo: league.logoUrl, size: 44),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Semantics(label: leagueTypeLabel(league.leagueType), child: Icon(a.icon, size: 14, color: a.fg)),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(league.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.foreground)),
                ),
              ]),
              const SizedBox(height: 4),
              Semantics(
                label: members,
                excludeSemantics: true,
                child: shown.isEmpty
                    ? Text('Just you', style: muted)
                    : Row(children: [
                        AvatarStack(members: shown, size: 24, overlap: 6),
                        if (extra > 0) ...[
                          const SizedBox(width: 6),
                          Text('+$extra', style: muted.copyWith(fontFeatures: tabular)),
                        ],
                      ]),
              ),
            ]),
          ),
          if (stat != null) ...[
            const SizedBox(width: 8),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(stat.$1, style: TextStyle(fontSize: 18, height: 1.2, fontWeight: FontWeight.w700,
                  color: c.foreground, fontFeatures: tabular)),
              Text(stat.$2, style: muted),
            ]),
          ],
        ]),
        const SizedBox(height: 10),
        // Row 2: the week (or Draft), then new posts, then the chevron.
        Container(
          padding: const EdgeInsets.only(top: 10),
          decoration: BoxDecoration(border: Border(top: BorderSide(color: c.border))),
          child: Row(children: [
            if (periodBadge(c, status: league.status, period: league.currentPeriod) case final b?) b,
            const Spacer(),
            if (unread > 0) ...[
              Container(width: 6, height: 6, decoration: BoxDecoration(color: c.primary, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Text('${unread > 99 ? '99+' : unread} new post${unread == 1 ? '' : 's'}',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.primary)),
              const SizedBox(width: 4),
            ],
            Icon(LucideIcons.chevronRight, size: 16, color: c.mutedForeground),
          ]),
        ),
      ]),
    );
  }
}

/// Overlapping member avatars ringed in the card color, plus an optional "+n".
class AvatarStack extends StatelessWidget {
  const AvatarStack({super.key, required this.members, this.extra = 0, this.size = 36, this.overlap = 10});
  final List<LeagueMember> members;
  final int extra;
  final double size;
  final double overlap;

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

/// Join with code, the body of a `showWzSheet`: returns the parsed code (see
/// `inviteCodeFrom`).
class _JoinCodeSheet extends StatefulWidget {
  const _JoinCodeSheet();

  @override
  State<_JoinCodeSheet> createState() => _JoinCodeSheetState();
}

class _JoinCodeSheetState extends State<_JoinCodeSheet> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final code = inviteCodeFrom(_text.text);
    void submit() {
      if (code.isNotEmpty) Navigator.of(context).pop(code);
    }

    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        TextField(
          controller: _text,
          autofocus: true,
          autocorrect: false,
          textCapitalization: TextCapitalization.characters,
          textInputAction: TextInputAction.go,
          style: const TextStyle(fontSize: 16),
          decoration: const InputDecoration(hintText: 'Code or invite link'),
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) => submit(),
        ),
        const SizedBox(height: 16),
        WzButton(label: 'Continue', expand: true, onPressed: code.isEmpty ? null : submit),
      ]);
  }
}

class _LeagueCardSkeleton extends StatelessWidget {
  const _LeagueCardSkeleton();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.only(bottom: 12),
      child: WzCard(
        padding: EdgeInsets.all(12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Skeleton(width: 44, height: 44, radius: WaygerzRadius.xl),
            SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SkeletonLine(widthFactor: 0.66, height: 20),
                SizedBox(height: 6),
                Skeleton(width: 80, height: 24, radius: 12),
              ]),
            ),
            SizedBox(width: 8),
            Skeleton(width: 64, height: 36),
          ]),
          SizedBox(height: 12),
          Skeleton(width: 110, height: 20),
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
