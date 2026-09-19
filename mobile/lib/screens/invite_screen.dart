import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/events_api.dart';
import '../api/invites_api.dart';
import '../app_nav.dart';
import '../auth/auth_controller.dart';
import '../models.dart';
import '../shell/app_header.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import '../widgets/bet_card.dart';
import '../widgets/counter_sheet.dart';
import '../widgets/league_invite_card.dart';
import 'league_detail_screen.dart';
import 'widgets.dart';

/// A shared `/c/<code>` link (web app/(public)/c/[code]/page.tsx): a league
/// invite (LeagueInviteCard + Join), a friend link (Add / Accept), or a bet
/// challenge (the stacked BetCard + Accept / Counter / Reject, or its
/// outcome) — same copy as the web.
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
      body: SafeArea(top: false, child: ListView(padding: const EdgeInsets.all(16), children: [
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
      ])),
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

  // ---------------------------------------------------------------- league
  Widget _league(BuildContext context, ResolvedCode r, Map<String, dynamic> lg) {
    final rel = r.viewer['relationship'] as String? ?? 'none';
    final name = (lg['name'] ?? '') as String;
    final type = (lg['league_type'] ?? '') as String;

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      LeagueInviteCard(league: lg),
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
    final me = context.read<AuthController>().user?.id ?? '';
    final rel = r.viewer['relationship'] as String? ?? 'none';
    final involved = rel == 'proposer' || rel == 'acceptor';
    final otherName = rel == 'proposer' ? w.acceptorName : w.proposerName;
    // Drive off my_turn — after a counter it may be the proposer's turn.
    final myTurn = (r.viewer['my_turn'] as bool?) ?? rel == 'acceptor';
    final countered = w.stakeRound > 0;
    final canAct = myTurn && r.actions.contains('accept');
    final canUndecline = myTurn && r.actions.contains('undecline');
    final decided = w.status == 'completed' || w.status == 'settled';
    final terminal = const {'declined', 'cancelled', 'refunded'}.contains(w.status);

    final List<Widget> actions;
    if (canAct) {
      actions = [
        WzButton(label: _busy ? 'Working…' : 'Accept', expand: true, busy: _busy,
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
      // A declined bet reads "You declined" only to whoever can reopen it.
      BetCard(wager: w, event: _event, me: me, myTurn: w.status == 'declined' ? canUndecline : myTurn),
      const SizedBox(height: 20),
      _buttons(actions),
      const SizedBox(height: 8),
      WzButton(label: 'Home', icon: LucideIcons.house, expand: true, variant: ButtonVariant.ghost, onPressed: _home),
    ]);
  }
}
