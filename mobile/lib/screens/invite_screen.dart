import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/events_api.dart';
import '../api/invites_api.dart';
import '../app_nav.dart';
import '../auth/auth_controller.dart';
import '../format.dart';
import '../models.dart';
import '../shell/app_header.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import '../wagers.dart';
import '../widgets/counter_sheet.dart';
import 'league_detail_screen.dart';
import 'widgets.dart';

/// A shared `/c/<code>` link (web app/(public)/c/[code]/page.tsx): a league
/// invite (Join), a friend link (Add / Accept), or a bet challenge (Accept /
/// Counter / Reject, or its outcome) — one card, same copy as the web.
class InviteScreen extends StatefulWidget {
  const InviteScreen({super.key, required this.api, required this.code});
  final ApiClient api;
  final String code;

  @override
  State<InviteScreen> createState() => _InviteScreenState();
}

class _InviteScreenState extends State<InviteScreen> {
  late final InvitesApi _invites = InvitesApi(widget.api);
  late final String _code = InvitesApi.normalize(widget.code);
  late Future<ResolvedCode> _future = _invites.resolve(_code);
  SportEvent? _event;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _future.then(_loadEvent).catchError((_) {});
  }

  /// The game behind a bet code, for its live/final score.
  Future<void> _loadEvent(ResolvedCode r) async {
    final wager = r.type == 'bet' ? (r.preview?['wager']) : null;
    if (wager is! Map) return;
    final ev = await EventsApi(widget.api).event('${wager['event_id']}');
    if (mounted) setState(() => _event = ev);
  }

  void _refresh() {
    final f = _invites.resolve(_code);
    setState(() => _future = f);
    f.then(_loadEvent).catchError((_) {});
  }

  void _home([int tab = AppNav.tabLeagues]) {
    final nav = context.read<AppNav>();
    Navigator.of(context).popUntil((r) => r.isFirst);
    nav.selectTab(tab);
  }

  Future<void> _act(String action) async {
    final toast = Toaster.of(context);
    final navigator = Navigator.of(context);
    setState(() => _busy = true);
    try {
      final res = await _invites.act(_code, action);
      if (!mounted) return;
      switch (res.type) {
        case 'league':
          toast.success('Joined');
          final stub = League(id: res.targetId, name: '', leagueType: 'head_to_head', status: 'active');
          navigator.pushReplacement(MaterialPageRoute<void>(builder: (_) => LeagueDetailScreen(api: widget.api, league: stub)));
        case 'bet' when action == 'undecline':
          toast.success('Bet reopened');
          _refresh();
        case 'bet':
          toast.success(action == 'accept' ? 'Bet accepted' : 'Bet rejected');
          _home(AppNav.tabBets);
        default:
          toast.success(action == 'decline' ? 'Declined' : action == 'accept' ? 'Friend added' : 'Friend request sent');
          _home();
      }
    } catch (e) {
      toast.failure(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const WaygerzHeader.page('Invite'),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        WzCard(
          padding: const EdgeInsets.all(24),
          child: FutureBuilder<ResolvedCode>(
            future: _future,
            builder: (context, snap) {
              if (snap.connectionState == ConnectionState.waiting && snap.data == null) {
                return const Column(children: [
                  Skeleton(width: 64, height: 64, circle: true),
                  SizedBox(height: 12),
                  Skeleton(width: 160, height: 20),
                  SizedBox(height: 8),
                  Skeleton(width: 224, height: 16),
                  SizedBox(height: 20),
                  Skeleton(height: 40, radius: WaygerzRadius.lg),
                ]);
              }
              final r = snap.data;
              if (r == null) return _dead('This invite link is invalid or has expired.');
              if (!r.isValid) {
                return _dead(switch (r.state) {
                  'consumed' => 'This invite has already been used.',
                  'expired' => 'This invite has expired.',
                  _ => 'This invite link is invalid.',
                });
              }
              final p = r.preview;
              return switch (r.type) {
                'league' when p != null => _league(context, r, p),
                'friend' when p != null && p['user'] is Map => _friend(context, r, (p['user'] as Map).cast<String, dynamic>()),
                'bet' when p != null && p['wager'] is Map =>
                  _bet(context, r, Wager.fromJson((p['wager'] as Map).cast<String, dynamic>())),
                _ => _dead('This invite link is invalid.'),
              };
            },
          ),
        ),
      ]),
    );
  }

  // --------------------------------------------------------------- pieces

  Widget _dead(String message) {
    final c = WaygerzColors.of(context);
    return Column(children: [
      Text(message, textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
      const SizedBox(height: 12),
      WzButton(label: 'Go to dashboard', variant: ButtonVariant.ghost, onPressed: _home),
    ]);
  }

  Widget _title(String t) => Text(t, textAlign: TextAlign.center,
      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: WaygerzColors.of(context).foreground));

  Widget _muted(String t, {double size = 14}) => Text(t, textAlign: TextAlign.center,
      style: TextStyle(fontSize: size, color: WaygerzColors.of(context).mutedForeground));

  Widget _buttons(List<Widget> buttons) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (var i = 0; i < buttons.length; i++) ...[if (i > 0) const SizedBox(height: 8), buttons[i]],
      ]);

  Widget _row(String label, String value) {
    final c = WaygerzColors.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
        const SizedBox(height: 2),
        Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.foreground)),
      ]),
    );
  }

  // ---------------------------------------------------------------- league
  Widget _league(BuildContext context, ResolvedCode r, Map<String, dynamic> lg) {
    final c = WaygerzColors.of(context);
    final rel = r.viewer['relationship'] as String? ?? 'none';
    final name = (lg['name'] ?? '') as String;
    final type = (lg['league_type'] ?? '') as String;
    final members = (lg['member_count'] as int?) ?? 0;
    final rules = (lg['rules'] as Map?) ?? const {};
    final period = lg['period_type'] == 'season'
        ? 'Season${rules['season_year'] != null ? ' ${rules['season_year']}' : ''}'
        : 'Weekly${rules['week_starts_on'] != null ? ' · resets ${rules['week_starts_on']}' : ''}';
    final sports = [for (final s in (lg['sports'] as List<dynamic>?) ?? const []) ((s as Map)['name'] ?? s['sport_league_id']).toString()];

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Center(child: LeagueAvatar(name: name, id: '${lg['id']}', logo: lg['logo_url'] as String?, size: 88)),
      const SizedBox(height: 12),
      _title(name),
      const SizedBox(height: 4),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        WzBadge(leagueTypeLabel(type)),
        const SizedBox(width: 8),
        Text('$members member${members == 1 ? '' : 's'}', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
      ]),
      if (lg['commissioner_name'] != null) ...[
        const SizedBox(height: 8),
        Text.rich(TextSpan(children: [
          const TextSpan(text: 'Invited by '),
          TextSpan(text: '${lg['commissioner_name']}', style: TextStyle(fontWeight: FontWeight.w500, color: c.foreground)),
        ]), textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
      ],
      if ((lg['description'] ?? '').toString().isNotEmpty) ...[
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: c.muted.withValues(alpha: 0.5), borderRadius: BorderRadius.circular(WaygerzRadius.lg)),
          child: Text('${lg['description']}', style: TextStyle(fontSize: 14, color: c.foreground)),
        ),
      ],
      const SizedBox(height: 12),
      _row('Period', period),
      if (type != 'pickem') _row('Starting balance', formatCredits((lg['starting_balance_cents'] as int?) ?? 0)),
      if (lg['min_wager_cents'] != null) _row('Min wager', formatCredits(lg['min_wager_cents'] as int)),
      if (lg['max_wager_cents'] != null) _row('Max wager', formatCredits(lg['max_wager_cents'] as int)),
      if (sports.isNotEmpty) _row('Sports', sports.join(', ')),
      const SizedBox(height: 20),
      if (rel == 'member') ...[
        _muted('You are already in this league.'),
        const SizedBox(height: 8),
        _buttons([
          WzButton(label: 'Open league', expand: true, onPressed: () {
            final stub = League(id: '${lg['id']}', name: name, leagueType: type, status: 'active');
            Navigator.of(context).pushReplacement(
                MaterialPageRoute<void>(builder: (_) => LeagueDetailScreen(api: widget.api, league: stub)));
          }),
          WzButton(label: 'Not now', expand: true, variant: ButtonVariant.outline, onPressed: _home),
        ]),
      ] else ...[
        _muted(rel == 'left' ? 'Rejoin this league?' : 'Join this league?'),
        const SizedBox(height: 8),
        _buttons([
          WzButton(
            label: _busy ? 'Joining…' : '${rel == 'left' ? 'Rejoin' : 'Join'} $name',
            expand: true,
            busy: _busy,
            onPressed: _busy ? null : () => _act('join'),
          ),
          WzButton(label: 'Decline', expand: true, variant: ButtonVariant.outline, onPressed: _busy ? null : _home),
        ]),
      ],
    ]);
  }

  // ---------------------------------------------------------------- friend
  Widget _friend(BuildContext context, ResolvedCode r, Map<String, dynamic> u) {
    final rel = r.viewer['relationship'] as String? ?? 'none';
    final name = (u['display_name'] ?? '') as String;
    final Widget actions = switch (rel) {
      'self' => _muted('This is your friend link — share it so others can add you.'),
      'friends' => Column(children: [
          _muted('You are already friends.'),
          const SizedBox(height: 8),
          WzButton(label: 'Go to dashboard', expand: true, variant: ButtonVariant.outline, onPressed: _home),
        ]),
      'pending_out' => Column(children: [
          _muted('Friend request already sent.'),
          const SizedBox(height: 8),
          WzButton(label: 'Go to dashboard', expand: true, variant: ButtonVariant.outline, onPressed: _home),
        ]),
      'pending_in' => Column(children: [
          _muted('$name wants to be friends.'),
          const SizedBox(height: 8),
          _buttons([
            WzButton(label: _busy ? 'Accepting…' : 'Accept', expand: true, busy: _busy,
                onPressed: _busy ? null : () => _act('accept')),
            WzButton(label: 'Decline', expand: true, variant: ButtonVariant.outline,
                onPressed: _busy ? null : () => _act('decline')),
          ]),
        ]),
      _ => Column(children: [
          _muted('Add $name as a friend?'),
          const SizedBox(height: 8),
          _buttons([
            WzButton(label: _busy ? 'Sending…' : 'Add friend', expand: true, busy: _busy,
                onPressed: _busy ? null : () => _act('add')),
            WzButton(label: 'Decline', expand: true, variant: ButtonVariant.outline, onPressed: _busy ? null : _home),
          ]),
        ]),
    };
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Center(child: UserAvatar(userId: '${u['id']}', name: name, avatarKey: u['avatar_key'] as String?, size: 80)),
      const SizedBox(height: 12),
      _title(name),
      const SizedBox(height: 4),
      _muted('on Waygerz'),
      const SizedBox(height: 20),
      actions,
    ]);
  }

  // ------------------------------------------------------------------- bet
  Widget _bet(BuildContext context, ResolvedCode r, Wager w) {
    final c = WaygerzColors.of(context);
    final me = context.read<AuthController>().user?.id ?? '';
    final rel = r.viewer['relationship'] as String? ?? 'none';
    final iAmProposer = rel == 'proposer';
    final involved = rel == 'proposer' || rel == 'acceptor';
    final mySide = iAmProposer ? w.proposerSide : w.acceptorSide;
    final otherName = iAmProposer ? w.acceptorName : w.proposerName;
    final otherId = iAmProposer ? w.acceptorId : w.proposerId;
    final otherAvatar = iAmProposer ? w.acceptorAvatarKey : w.proposerAvatarKey;
    // Drive off my_turn — after a counter it may be the proposer's turn.
    final myTurn = (r.viewer['my_turn'] as bool?) ?? rel == 'acceptor';
    final countered = w.stakeRound > 0;
    final canAct = myTurn && r.actions.contains('accept');
    final canUndecline = myTurn && r.actions.contains('undecline');

    final ev = _event;
    final started = ev != null && ev.status != 'scheduled' && ev.status != 'cancelled';
    final isFinal = ev?.status == 'final';
    final hs = ev?.homeScore;
    final as_ = ev?.awayScore;
    final decided = w.status == 'completed' || w.status == 'settled';
    final myId = iAmProposer ? w.proposerId : w.acceptorId;
    final iWon = involved && decided && w.winnerUserId != null && w.winnerUserId == myId;
    final iLost = involved && decided && w.winnerUserId != null && w.winnerUserId != myId;
    final stakeText = w.amountCents > 0 ? formatCredits(w.amountCents) : '';
    final stakeLabel = w.amountCents > 0 ? formatCredits(w.amountCents) : treatEmoji(w.treat);
    final terminal = const {'declined', 'cancelled', 'refunded'}.contains(w.status);
    final headline = decided
        ? (iWon ? 'You beat $otherName' : iLost ? '$otherName beat you' : 'Push')
        : terminal
            ? (w.status == 'declined'
                ? (canUndecline ? 'You declined this bet' : '$otherName declined')
                : w.status == 'cancelled'
                    ? 'Bet cancelled'
                    : 'Bet refunded')
            : myTurn
                ? '$otherName ${countered ? 'countered your bet' : 'sent you a bet'}'
                : w.status == 'accepted'
                    ? 'You’re on with $otherName'
                    : involved
                        ? 'Waiting on $otherName'
                        : "${w.proposerName}'s bet";

    Widget teamRow(String rk) {
      final isAway = rk == 'away';
      final name = (isAway ? ev?.awayTeam : ev?.homeTeam)?.isNotEmpty == true
          ? (isAway ? ev!.awayTeam : ev!.homeTeam)
          : (isAway ? w.awayTeam : w.homeTeam);
      final logo = isAway ? ev?.awayLogo : ev?.homeLogo;
      final score = isAway ? as_ : hs;
      final lost = isFinal && hs != null && as_ != null && (isAway ? hs > as_ : as_ > hs);
      final backed = involved && mySide == rk;
      return Container(
        height: 48,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: backed ? Tw.blue500.withValues(alpha: 0.2) : c.muted.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(WaygerzRadius.md),
        ),
        child: Row(children: [
          TeamLogo(name: name, abbreviation: '', logo: logo, size: 32),
          const SizedBox(width: 10),
          Expanded(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 14, fontWeight: lost ? FontWeight.w400 : FontWeight.w600,
                  color: lost ? c.mutedForeground : c.foreground))),
          if (started && score != null)
            Text('$score', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: lost ? c.mutedForeground : c.foreground))
          else if (backed)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(color: Tw.blue500.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(999)),
              child: const Text('Your pick', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Tw.blue500)),
            ),
        ]),
      );
    }

    final List<Widget> actions;
    if (canAct) {
      actions = [
        WzButton(label: _busy ? 'Working…' : 'Accept — $stakeLabel', expand: true, busy: _busy,
            onPressed: _busy ? null : () => _act('accept')),
        WzButton(label: 'Counter', expand: true, variant: ButtonVariant.outline, onPressed: _busy ? null : () async {
          final sent = await showCounterSheet(context, api: widget.api, wager: w, me: me);
          if (sent) _refresh();
        }),
        WzButton(label: 'Reject', expand: true, variant: ButtonVariant.outline,
            onPressed: _busy ? null : () => _act('decline')),
      ];
    } else if (canUndecline) {
      actions = [
        _muted('Changed your mind? Reopen this bet to accept it.'),
        WzButton(label: _busy ? 'Reopening…' : 'Un-decline', expand: true, busy: _busy,
            onPressed: _busy ? null : () => _act('undecline')),
        WzButton(label: 'View bets', expand: true, variant: ButtonVariant.outline, onPressed: () => _home(AppNav.tabBets)),
      ];
    } else {
      actions = [
        if (!decided && !terminal)
          _muted(w.status == 'accepted'
              ? 'Locked in — this bet is live.'
              : involved
                  ? 'Waiting on $otherName to respond${countered ? ' to your counter' : ''}.'
                  : "This bet isn't addressed to you."),
        WzButton(label: 'View bets', expand: true, variant: ButtonVariant.outline, onPressed: () => _home(AppNav.tabBets)),
      ];
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Center(
        child: UserAvatar(
          userId: involved ? otherId : w.proposerId,
          name: involved ? otherName : w.proposerName,
          avatarKey: involved ? otherAvatar : w.proposerAvatarKey,
          size: 80,
        ),
      ),
      const SizedBox(height: 12),
      _title(headline),
      const SizedBox(height: 4),
      _muted(w.leagueName?.isNotEmpty == true ? w.leagueName! : 'Head-to-head'),
      if (decided && involved && w.winnerUserId != null) ...[
        const SizedBox(height: 8),
        Center(
          child: WzBadge(
            iWon ? 'Won${stakeText.isNotEmpty ? ' +$stakeText' : ''}' : 'Lost${stakeText.isNotEmpty ? ' −$stakeText' : ''}',
            variant: iWon ? BadgeVariant.success : BadgeVariant.destructive,
          ),
        ),
      ],
      const SizedBox(height: 20),
      if (w.awayTeam.isNotEmpty && w.homeTeam.isNotEmpty) ...[
        teamRow('away'),
        const SizedBox(height: 6),
        teamRow('home'),
      ] else
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: c.muted.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(WaygerzRadius.md)),
          child: Text(w.eventName ?? 'Matchup', textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
        ),
      const SizedBox(height: 12),
      Wrap(alignment: WrapAlignment.center, crossAxisAlignment: WrapCrossAlignment.center, spacing: 6, runSpacing: 4, children: [
        if (involved) ...[
          Text('Your pick', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
          Text(wagerPick(w, mySide), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
          Text('·', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
        ],
        Text('Stake', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
          decoration: BoxDecoration(color: c.secondary, borderRadius: BorderRadius.circular(999)),
          child: Text(stakeLabel, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
        ),
      ]),
      const SizedBox(height: 20),
      _buttons(actions),
      const SizedBox(height: 8),
      WzButton(label: 'Home', icon: LucideIcons.house, expand: true, variant: ButtonVariant.ghost, onPressed: _home),
    ]);
  }
}
