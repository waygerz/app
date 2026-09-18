import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/events_api.dart';
import '../api/leagues_api.dart';
import '../api/wagers_api.dart';
import '../auth/auth_controller.dart';
import '../models.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import '../wagers.dart';
import '../widgets/counter_sheet.dart';
import '../widgets/wager_card.dart';

/// My Bets (web app/(app)/bets): filter pills with counts, search + sort, and
/// one continuous list of grouped bet cards with the viewer's actions. With a
/// [leagueId] it lists that league's bets only (the league's My Bets tab).
class BetsScreen extends StatefulWidget {
  const BetsScreen({super.key, required this.api, this.leagueId, this.header = const []});
  final ApiClient api;
  final String? leagueId;

  /// Widgets scrolled above the filters (the league header when embedded).
  final List<Widget> header;

  @override
  State<BetsScreen> createState() => _BetsScreenState();
}

class _BetsData {
  _BetsData(this.wagers, this.leagueNames, this.events);
  final List<Wager> wagers;
  final Map<String, String> leagueNames;
  final Map<String, SportEvent> events;
}

class _BetsScreenState extends State<BetsScreen> {
  late final WagersApi _wagers = WagersApi(widget.api);
  late final LeaguesApi _leagues = LeaguesApi(widget.api);
  late final EventsApi _events = EventsApi(widget.api);
  late Future<_BetsData> _future = _load();

  BetFilter _filter = BetFilter.all;
  BetSort _sort = BetSort.dateDesc;
  String _query = '';

  /// Group key → the action in flight, so only that card's buttons disable.
  final Set<String> _busy = {};

  Future<_BetsData> _load() async {
    final wagersF = _wagers.mine(leagueId: widget.leagueId);
    final leaguesF = widget.leagueId == null ? _leagues.myLeagues() : Future.value(<League>[]);
    final wagers = await wagersF;
    final events = await _events.events(wagers.map((w) => w.eventId));
    final leagues = await leaguesF.catchError((_) => <League>[]);
    return _BetsData(wagers, {for (final l in leagues) l.id: l.name}, events);
  }

  Future<void> _reload() async {
    final f = _load();
    setState(() => _future = f);
    await f;
  }

  /// Run [call] for every sibling in the group (one card can stand for the same
  /// bet offered to several people), then toast and refresh.
  Future<void> _act(WagerGroup g, Future<void> Function(String id) call, String ok) async {
    final toast = Toaster.of(context);
    setState(() => _busy.add(g.key));
    try {
      await Future.wait(g.ids.map(call));
      toast.success(ok);
      await _reload();
    } catch (e) {
      toast.failure(e);
    } finally {
      if (mounted) setState(() => _busy.remove(g.key));
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = context.read<AuthController>().user?.id ?? '';
    return RefreshIndicator(
      onRefresh: _reload,
      child: FutureBuilder<_BetsData>(
        future: _future,
        builder: (context, snap) {
          final data = snap.data;
          final loading = snap.connectionState == ConnectionState.waiting && data == null;
          final all = data?.wagers ?? const <Wager>[];
          final counts = {for (final f in BetFilter.values) f: filterWagers(all, f).length};
          final rows = filterWagers(all, _filter);

          var groups = groupWagers(rows, me);
          final q = _query.trim().toLowerCase();
          if (q.isNotEmpty) {
            groups = groups.where((g) {
              final hay = [g.rep.homeTeam, g.rep.awayTeam, data?.leagueNames[g.rep.leagueId] ?? '',
                ...g.opponents.map((o) => o.name)].join(' ').toLowerCase();
              return hay.contains(q);
            }).toList();
          }
          groups = sortGroups(groups, _sort);

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
            children: [
              ...widget.header,
              PillTabs<BetFilter>(
                tabs: [for (final f in BetFilter.values) PillTab(f, betFilterLabels[f]!, count: counts[f])],
                value: _filter,
                onChanged: (f) => setState(() => _filter = f),
              ),
              const SizedBox(height: 24),
              if (loading)
                ...List.generate(3, (_) => const Padding(
                      padding: EdgeInsets.only(bottom: 8),
                      child: Skeleton(height: 96, radius: WaygerzRadius.xl),
                    ))
              else if (snap.hasError)
                ErrorCard(title: "Couldn't load your bets", error: snap.error, onRetry: _reload)
              else ...[
                if (rows.isNotEmpty || q.isNotEmpty) ...[
                  Row(children: [
                    Expanded(
                      child: SearchField(
                        hint: 'Search teams, opponents, leagues',
                        onChanged: (v) => setState(() => _query = v),
                      ),
                    ),
                    const SizedBox(width: 8),
                    OptionMenuButton<BetSort>(
                      icon: Icons.swap_vert,
                      tooltip: 'Sort bets',
                      title: 'Sort by',
                      options: betSortLabels,
                      value: _sort,
                      onChanged: (s) => setState(() => _sort = s),
                    ),
                  ]),
                  const SizedBox(height: 16),
                ],
                if (groups.isEmpty)
                  _empty(context, q)
                else
                  for (final g in groups)
                    WagerBetCard(
                      key: ValueKey(g.key),
                      group: g,
                      me: me,
                      event: data?.events[g.rep.eventId],
                      leagueName: widget.leagueId == null ? data?.leagueNames[g.rep.leagueId] : null,
                      actions: _actionsFor(g, me),
                    ),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _empty(BuildContext context, String q) {
    final c = WaygerzColors.of(context);
    final label = betFilterLabels[_filter]!.toLowerCase();
    return CenterCard(children: [
      Icon(Icons.confirmation_number_outlined, size: 24, color: c.mutedForeground),
      Text(
        q.isNotEmpty
            ? 'No bets match “$q”.'
            : _filter == BetFilter.all
                ? 'No bets yet.'
                : 'No $label bets.',
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 14, color: c.mutedForeground),
      ),
      if (_filter == BetFilter.pending && q.isEmpty)
        Text('Incoming and outgoing proposals show up here.',
            textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: c.mutedForeground)),
    ]);
  }

  /// The viewer's actions for a card — the same rules as the web bets page.
  List<Widget>? _actionsFor(WagerGroup g, String me) {
    final w = g.rep;
    final busy = _busy.contains(g.key);
    final involved = w.proposerId == me || w.acceptorId == me;

    WzButton btn(String label, VoidCallback onTap, {ButtonVariant variant = ButtonVariant.primary}) =>
        WzButton(label: label, size: ButtonSize.sm, dense: true, variant: variant, expand: true,
            onPressed: busy ? null : onTap);

    if (w.status == 'completed' && involved) {
      // Only the score-decided winner claims; the badge carries everyone else's result.
      if (w.winnerUserId == me) {
        return [btn('Confirm', () => _act(g, _wagers.confirm, 'Result confirmed — you got paid'))];
      }
      return null;
    }

    // Accepted bets hold both stakes: one side requests a cancel, the other
    // approves. Locked 10 minutes before kickoff.
    if (w.status == 'accepted' && involved) {
      if (cancelLocked(w)) return null;
      if (w.cancelRequestedBy == null) {
        return [
          btn('Cancel', () async {
            final ok = await confirmWz(
              context,
              title: 'Do you really want to cancel?',
              description: 'Your opponent has to approve the cancellation — both stakes are refunded only '
                  'once they do. Until then the bet stands.',
              confirmLabel: 'Cancel bet',
              cancelLabel: 'Keep bet',
            );
            if (ok) await _act(g, _wagers.requestCancel, 'Cancel requested — waiting on your opponent');
          }, variant: ButtonVariant.outline),
        ];
      }
      if (w.cancelRequestedBy == me) {
        final c = WaygerzColors.of(context);
        return [
          Text('Cancel Requested', textAlign: TextAlign.center,
              style: TextStyle(fontSize: 11, color: c.mutedForeground)),
        ];
      }
      return [
        btn('Approve', () => _act(g, _wagers.approveCancel, 'Bet cancelled — both stakes refunded')),
        btn('Reject', () => _act(g, _wagers.rejectCancel, 'Cancel request declined — the bet stands'),
            variant: ButtonVariant.ghost),
      ];
    }

    // A bet you declined can be reopened until kickoff.
    if (w.status == 'declined') {
      final iDeclined = w.pendingId != null ? w.pendingId == me : w.acceptorId == me;
      final start = DateTime.tryParse(w.startTime ?? '');
      final started = start != null && !DateTime.now().isBefore(start);
      if (iDeclined && !started) return [btn('Un-decline', () => _act(g, _wagers.undecline, 'Bet reopened'))];
      return null;
    }

    if (w.status != 'open') return null;
    // Whoever's turn it is responds; the member holding the current offer can withdraw.
    final respondTurn = w.myTurn ?? (w.pendingId != null ? w.pendingId == me : w.acceptorId == me);
    final holderIsMe = w.heldId != null ? w.heldId == me : w.proposerId == me;
    if (respondTurn) {
      return [
        btn('Accept', () => _act(g, _wagers.accept, 'Bet accepted')),
        // Counter acts on one wager; hidden when identical challenges from
        // different people merged into one card (it splits once countered).
        if (w.pendingId != null && g.wagers.length == 1)
          btn('Counter', () async {
            final sent = await showCounterSheet(context, api: widget.api, wager: w, me: me);
            if (sent) await _reload();
          }, variant: ButtonVariant.outline),
        btn('Decline', () => _act(g, _wagers.decline, 'Bet declined'), variant: ButtonVariant.outline),
      ];
    }
    if (holderIsMe && !cancelLocked(w)) {
      return [btn('Withdraw', () => _act(g, _wagers.cancel, 'Bet cancelled'), variant: ButtonVariant.outline)];
    }
    return null;
  }
}
