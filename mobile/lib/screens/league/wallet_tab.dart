import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../api/api_client.dart';
import '../../api/wallet_api.dart';
import '../../format.dart';
import '../../models.dart';
import '../../theme/app_theme.dart';
import '../../ui/ui.dart';

class _Txn {
  _Txn(this.id, this.type, this.amount, this.balanceAfter, this.at);
  final String id;
  final String type;
  final int amount;
  final int balanceAfter;
  final DateTime at;
}

const _txnLabel = {
  'league_grant': 'Starting grant',
  'wager_hold': 'Bet hold',
  'wager_payout': 'Bet payout',
  'wager_refund': 'Bet refund',
};

String _signed(int cents) => '${cents >= 0 ? '+' : '−'}${formatCredits(cents.abs())}';

/// Money-league Wallet (web _sections/activity.tsx): the balance with this
/// week's change and a sparkline, then the ledger grouped by day with each
/// day's net.
class WalletTab extends StatefulWidget {
  const WalletTab({super.key, required this.api, required this.league, required this.header, required this.onRefresh});
  final ApiClient api;
  final League league;
  final List<Widget> header;
  final Future<void> Function() onRefresh;

  @override
  State<WalletTab> createState() => _WalletTabState();
}

class _WalletTabState extends State<WalletTab> {
  late Future<List<_Txn>> _future = _load();

  Future<List<_Txn>> _load() async {
    final raw = await WalletApi(widget.api).transactions(WalletApi.leagueAccount(widget.league.id), limit: 200);
    return [
      for (final t in raw)
        _Txn('${t['id']}', (t['type'] ?? '') as String, (t['amount_cents'] as num?)?.toInt() ?? 0,
            (t['balance_after_cents'] as num?)?.toInt() ?? 0, DateTime.tryParse('${t['created_at']}')?.toLocal() ?? DateTime(1970)),
    ];
  }

  Future<void> _reload() async {
    final f = _load();
    setState(() => _future = f);
    await Future.wait([f, widget.onRefresh()]);
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return RefreshIndicator(
      onRefresh: _reload,
      child: FutureBuilder<List<_Txn>>(
        future: _future,
        builder: (context, snap) {
          final txns = snap.data;
          Widget body;
          if (txns == null && snap.connectionState == ConnectionState.waiting) {
            body = const Skeleton(height: 160, radius: WaygerzRadius.xl);
          } else if (snap.hasError) {
            body = ErrorCard(title: "Couldn't load the wallet", error: snap.error, onRetry: _reload);
          } else if (txns!.isEmpty) {
            body = CenterCard(children: [
              Icon(LucideIcons.wallet, size: 24, color: c.mutedForeground),
              Text('No transactions yet.', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
            ]);
          } else {
            body = _ledger(c, txns);
          }
          return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [...widget.header, body]);
        },
      ),
    );
  }

  Widget _ledger(WaygerzColors c, List<_Txn> txns) {
    // Newest first, so [0] holds the current balance.
    final balance = txns.first.balanceAfter;
    final weekAgo = DateTime.now().subtract(const Duration(days: 7));
    final weekNet = txns.where((t) => !t.at.isBefore(weekAgo)).fold<int>(0, (s, t) => s + t.amount);

    final groups = <({String label, int net, List<_Txn> items})>[];
    String? key;
    for (final t in txns) {
      final k = '${t.at.year}-${t.at.month}-${t.at.day}';
      if (k != key) {
        key = k;
        groups.add((label: dayLabel(t.at.toIso8601String()), net: 0, items: <_Txn>[]));
      }
      final g = groups.removeLast();
      groups.add((label: g.label, net: g.net + t.amount, items: [...g.items, t]));
    }

    return WzCard(
      padding: EdgeInsets.zero,
      clip: true,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('LEAGUE BALANCE', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, letterSpacing: 0.5, color: c.mutedForeground)),
                const SizedBox(height: 4),
                Text(formatCredits(balance), style: TextStyle(fontSize: 30, fontWeight: FontWeight.w700, color: c.foreground)),
                if (weekNet != 0) ...[
                  const SizedBox(height: 6),
                  Row(children: [
                    Icon(weekNet >= 0 ? LucideIcons.arrowUpRight : LucideIcons.arrowDownRight, size: 14,
                        color: weekNet >= 0 ? c.brand : c.destructive),
                    const SizedBox(width: 4),
                    Text('${_signed(weekNet)} this week',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: weekNet >= 0 ? c.brand : c.destructive)),
                  ]),
                ],
              ]),
            ),
            _spark(c, txns),
          ]),
        ),
        for (final g in groups) ...[
          Container(
            color: c.muted.withValues(alpha: 0.5),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(children: [
              Expanded(child: Text(g.label.toUpperCase(),
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 1, color: c.mutedForeground))),
              Text(_signed(g.net), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: g.net >= 0 ? c.brand : c.destructive)),
            ]),
          ),
          for (final t in g.items) _row(c, t),
        ],
      ]),
    );
  }

  /// Running balance for up to the 12 most recent entries, oldest → newest,
  /// normalized with a 20% floor so a flat stretch still shows bars.
  Widget _spark(WaygerzColors c, List<_Txn> txns) {
    final pts = txns.take(12).map((t) => t.balanceAfter).toList().reversed.toList();
    if (pts.length < 2) return const SizedBox.shrink();
    final lo = pts.reduce((a, b) => a < b ? a : b);
    final hi = pts.reduce((a, b) => a > b ? a : b);
    final span = (hi - lo) == 0 ? 1 : hi - lo;
    return ExcludeSemantics(
      child: SizedBox(
        height: 48,
        child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          for (final v in pts)
            Container(
              width: 6,
              height: 48 * (0.2 + (v - lo) / span * 0.8),
              margin: const EdgeInsets.only(left: 3),
              decoration: BoxDecoration(color: c.primary.withValues(alpha: 0.7), borderRadius: BorderRadius.circular(2)),
            ),
        ]),
      ),
    );
  }

  Widget _row(WaygerzColors c, _Txn t) {
    final (IconData icon, Color tint) = switch (t.type) {
      'wager_payout' => (LucideIcons.arrowUpRight, c.brand),
      'wager_hold' => (LucideIcons.arrowDownRight, c.destructive),
      'wager_refund' => (LucideIcons.rotateCcw, Tw.sky500),
      'league_grant' => (LucideIcons.flag, Tw.amber500),
      _ => (LucideIcons.wallet, c.mutedForeground),
    };
    final up = t.amount >= 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(border: Border(top: BorderSide(color: c.border))),
      child: Row(children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(color: tint.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(WaygerzRadius.xl)),
          child: Icon(icon, size: 16, color: tint),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_txnLabel[t.type] ?? t.type, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
            Text(clockTime(t.at.toIso8601String()), style: TextStyle(fontSize: 12, color: c.mutedForeground)),
          ]),
        ),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text(_signed(t.amount), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: up ? c.brand : c.destructive)),
          Text(formatCredits(t.balanceAfter), style: TextStyle(fontSize: 11, color: c.mutedForeground)),
        ]),
      ]),
    );
  }
}
