import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/leagues_api.dart';
import '../api/wallet_api.dart';
import '../auth/auth_controller.dart';
import '../models.dart';
import 'bets_screen.dart';
import 'widgets.dart';

class _DetailData {
  _DetailData(this.league, this.standings, this.balance, this.picks);
  final League league;
  final List<StandingRow> standings;
  final WalletBalance? balance;
  final List<Pick> picks;
}

/// League detail: header + standings, plus the money view (balance + bets) for
/// H2H or the current-period picks for Pick'em.
class LeagueDetailScreen extends StatefulWidget {
  const LeagueDetailScreen({super.key, required this.api, required this.league});
  final ApiClient api;
  final League league;

  @override
  State<LeagueDetailScreen> createState() => _LeagueDetailScreenState();
}

class _LeagueDetailScreenState extends State<LeagueDetailScreen> {
  late final LeaguesApi _leagues = LeaguesApi(widget.api);
  late final WalletApi _wallet = WalletApi(widget.api);
  late Future<_DetailData> _future = _load();
  bool _activating = false;

  Future<_DetailData> _load() async {
    final league = await _leagues.league(widget.league.id);
    final standings = await _leagues.standings(league.id);
    final balance = league.isMoney ? await _wallet.leagueBalance(league.id) : null;
    final picks = (league.isPickem && league.currentPeriodId != null)
        ? await _leagues.getPicks(league.id, league.currentPeriodId!)
        : <Pick>[];
    return _DetailData(league, standings, balance, picks);
  }

  Future<void> _reload() async {
    final f = _load();
    setState(() => _future = f);
    await f;
  }

  Future<void> _activate() async {
    setState(() => _activating = true);
    try {
      await _leagues.activate(widget.league.id);
      await _reload();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not activate: $e')));
      }
    } finally {
      if (mounted) setState(() => _activating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.league.name, maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: FutureBuilder<_DetailData>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return ErrorState(message: '${snap.error}', onRetry: _reload);
          }
          final d = snap.data!;
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _header(d.league),
                const SizedBox(height: 16),
                if (d.league.isDraft) _draftBanner(d.league),
                if (d.balance != null) _balanceCard(d.balance!),
                _standingsSection(d.league, d.standings),
                if (d.league.isMoney) _betsLink(d.league),
                if (d.league.isPickem) _picksSection(d.picks),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _header(League l) {
    return Row(children: [
      LeagueAvatar(name: l.name, radius: 26),
      const SizedBox(width: 12),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l.name, style: Theme.of(context).textTheme.titleLarge, maxLines: 2, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 2),
          Text(
            [l.isMoney ? 'Head-to-Head' : "Pick'em", l.status, '${l.memberCount} members'].join(' · '),
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ]),
      ),
    ]);
  }

  Widget _draftBanner(League l) {
    final me = context.read<AuthController>().user?.id;
    final canActivate = l.myRole == 'commissioner' || (l.commissionerId != null && l.commissionerId == me);
    return Card(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(children: [
          const Expanded(child: Text('This league is a draft — activate it to open play.')),
          FilledButton(
            onPressed: (_activating || !canActivate) ? null : _activate,
            child: _activating
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Activate'),
          ),
        ]),
      ),
    );
  }

  Widget _balanceCard(WalletBalance b) {
    return Card(
      child: ListTile(
        leading: const Icon(Icons.account_balance_wallet_outlined),
        title: const Text('Your balance'),
        trailing: Text(b.display, style: Theme.of(context).textTheme.titleMedium),
      ),
    );
  }

  Widget _standingsSection(League l, List<StandingRow> rows) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SizedBox(height: 8),
      Text('Standings', style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: 4),
      if (rows.isEmpty)
        const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('No standings yet.'))
      else
        ...rows.asMap().entries.map((e) {
          final r = e.value;
          final rank = r.rank ?? (e.key + 1);
          final trailing = l.isMoney && r.balanceCents != null
              ? '\$${(r.balanceCents! / 100).toStringAsFixed(2)}'
              : '${r.wins}-${r.losses}';
          return ListTile(
            dense: true,
            leading: Text('$rank', style: Theme.of(context).textTheme.titleSmall),
            title: Text(r.displayName),
            trailing: Text(trailing),
          );
        }),
    ]);
  }

  Widget _betsLink(League l) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: OutlinedButton.icon(
        icon: const Icon(Icons.sports_mma_outlined),
        label: const Text('View bets in this league'),
        onPressed: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => BetsScreen(api: widget.api, leagueId: l.id, title: l.name)),
        ),
      ),
    );
  }

  Widget _picksSection(List<Pick> picks) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SizedBox(height: 16),
      Text('Your picks — this period', style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: 4),
      if (picks.isEmpty)
        const Padding(
          padding: EdgeInsets.symmetric(vertical: 12),
          child: Text('No picks yet for the open week.'),
        )
      else
        ...picks.map(_pickTile),
    ]);
  }

  Widget _pickTile(Pick p) {
    Widget badge;
    if (p.voided) {
      badge = const StatusChip(label: 'Void', color: Colors.grey);
    } else if (p.correct == true) {
      badge = const StatusChip(label: 'Won', color: Colors.green);
    } else if (p.correct == false) {
      badge = const StatusChip(label: 'Lost', color: Colors.red);
    } else {
      badge = const StatusChip(label: 'Pending');
    }
    final matchup = (p.awayTeam != null && p.homeTeam != null)
        ? '${p.awayTeam} @ ${p.homeTeam}'
        : (p.eventName ?? p.eventId);
    final side = p.pickSide == 'home' ? (p.homeTeam ?? 'Home') : (p.awayTeam ?? 'Away');
    return ListTile(
      dense: true,
      title: Text(matchup, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text('Pick: $side'),
      trailing: badge,
    );
  }
}
