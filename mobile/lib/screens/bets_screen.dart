import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/wagers_api.dart';
import '../auth/auth_controller.dart';
import '../models.dart';
import 'widgets.dart';

/// The caller's H2H wagers. Used both as the top-level Bets tab (all leagues)
/// and, filtered by [leagueId], from a league's detail screen.
class BetsScreen extends StatefulWidget {
  const BetsScreen({super.key, required this.api, this.leagueId, this.title});
  final ApiClient api;
  final String? leagueId;
  final String? title;

  @override
  State<BetsScreen> createState() => _BetsScreenState();
}

class _BetsScreenState extends State<BetsScreen> {
  late final WagersApi _wagers = WagersApi(widget.api);
  late Future<List<Wager>> _future = _wagers.mine(leagueId: widget.leagueId);

  Future<void> _reload() async {
    final f = _wagers.mine(leagueId: widget.leagueId);
    setState(() => _future = f);
    await f;
  }

  Future<void> _act(Future<void> Function() call, String ok) async {
    try {
      await call();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ok)));
      await _reload();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = context.read<AuthController>().user?.id;
    final body = FutureBuilder<List<Wager>>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snap.hasError) return ErrorState(message: '${snap.error}', onRetry: _reload);
        final wagers = snap.data ?? const <Wager>[];
        if (wagers.isEmpty) {
          return ListView(children: const [
            SizedBox(height: 120),
            EmptyState(icon: Icons.sports_mma_outlined, label: 'No bets yet'),
          ]);
        }
        return ListView.separated(
          itemCount: wagers.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (context, i) => _WagerTile(wager: wagers[i], me: me, onAct: _act, wagers: _wagers),
        );
      },
    );

    // When pushed from a league (has a title) show its own app bar; as the tab
    // it inherits the HomeScreen app bar.
    if (widget.title != null) {
      return Scaffold(appBar: AppBar(title: Text('${widget.title} · Bets')), body: RefreshIndicator(onRefresh: _reload, child: body));
    }
    return RefreshIndicator(onRefresh: _reload, child: body);
  }
}

class _WagerTile extends StatelessWidget {
  const _WagerTile({required this.wager, required this.me, required this.onAct, required this.wagers});
  final Wager wager;
  final String? me;
  final WagersApi wagers;
  final Future<void> Function(Future<void> Function(), String) onAct;

  @override
  Widget build(BuildContext context) {
    final matchup = (wager.awayTeam != null && wager.homeTeam != null)
        ? '${wager.awayTeam} @ ${wager.homeTeam}'
        : (wager.eventName ?? 'Game');
    final iAmAcceptor = me != null && wager.acceptorId == me;
    final iAmProposer = me != null && wager.proposerId == me;
    final opponent = iAmProposer ? wager.acceptorName : wager.proposerName;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(matchup, style: Theme.of(context).textTheme.titleSmall, maxLines: 1, overflow: TextOverflow.ellipsis)),
          StatusChip(label: _statusLabel(wager.status), color: _statusColor(wager.status)),
        ]),
        const SizedBox(height: 4),
        Text('${_pick(wager)} · ${wager.stakeLabel}${opponent != null ? '  ·  vs $opponent' : ''}',
            style: Theme.of(context).textTheme.bodyMedium),
        if (wager.isOpen && (iAmAcceptor || iAmProposer)) ...[
          const SizedBox(height: 8),
          Row(children: [
            if (iAmAcceptor) ...[
              FilledButton(
                onPressed: () => onAct(() => wagers.accept(wager.id), 'Bet accepted'),
                child: const Text('Accept'),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: () => onAct(() => wagers.decline(wager.id), 'Bet declined'),
                child: const Text('Decline'),
              ),
            ] else if (iAmProposer) ...[
              OutlinedButton(
                onPressed: () => onAct(() => wagers.cancel(wager.id), 'Bet cancelled'),
                child: const Text('Cancel offer'),
              ),
            ],
          ]),
        ],
      ]),
    );
  }

  /// The proposer's pick, e.g. "Braves ML", "Braves -1.5", "Over 8.5".
  String _pick(Wager w) {
    final teamFor = (String side) => side == 'home' ? (w.homeTeam ?? 'Home') : (w.awayTeam ?? 'Away');
    switch (w.betType) {
      case 'spread':
        final sign = (w.line ?? 0) > 0 ? '+' : '';
        return '${teamFor(w.proposerSide)} $sign${w.line ?? ''}';
      case 'total':
        final ou = w.proposerSide == 'over' ? 'Over' : 'Under';
        return '$ou ${w.line ?? ''}';
      default:
        return '${teamFor(w.proposerSide)} ML';
    }
  }

  String _statusLabel(String s) => s[0].toUpperCase() + s.substring(1);

  Color _statusColor(String s) {
    switch (s) {
      case 'open':
        return Colors.orange;
      case 'accepted':
        return Colors.blue;
      case 'settled':
        return Colors.green;
      default:
        return Colors.grey;
    }
  }
}
