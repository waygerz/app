import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../screens/widgets.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import '../wagers.dart';

/// The web's `WagerBetCard` (leagues/[id]/_sections/wager-card.tsx): a caption
/// (state dot, kickoff, "vs / beat / lost to" opponent), then a two-row board —
/// team cells, the per-side pick column, and a tall result cell holding the
/// actions, the payout once decided, or the status badge. Tap for details.
class WagerBetCard extends StatelessWidget {
  const WagerBetCard({super.key, required this.group, required this.me, this.event, this.actions, this.leagueName});
  final WagerGroup group;
  final String me;
  final SportEvent? event;

  /// Buttons for the result cell (Accept / Decline / Confirm …), if any.
  final List<Widget>? actions;

  /// Shown on the cross-league bets list so each card names its league.
  final String? leagueName;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final v = _BetView(group, me, event, c);
    final w = group.rep;
    final soloOpp = group.opponents.length == 1 ? group.opponents.first : null;
    final when = event?.startTime != null ? formatStart(event!.startTime) : null;

    return InkWell(
      onTap: () => showWzSheet<void>(context, title: 'Bet details', builder: (_) => _BetDetails(view: v)),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          // caption
          Padding(
            padding: const EdgeInsets.fromLTRB(2, 0, 2, 6),
            child: Row(children: [
              Container(width: 8, height: 8, decoration: BoxDecoration(color: v.rail, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Expanded(
                child: Text.rich(
                  TextSpan(children: [
                    if (leagueName != null)
                      TextSpan(
                        text: '$leagueName · ',
                        style: TextStyle(fontWeight: FontWeight.w500, color: c.foreground.withValues(alpha: 0.8)),
                      ),
                    TextSpan(text: when ?? (v.field && (w.eventName ?? '').isNotEmpty ? w.eventName : 'Bet')),
                  ]),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: c.mutedForeground),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '${v.verb} ${soloOpp?.name ?? opponentsLabel([for (final o in group.opponents) o.name])}',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: v.toneText),
              ),
            ]),
          ),
          v.field ? _fieldBoard(c, v) : _board(c, v),
        ]),
      ),
    );
  }

  Widget _result(WaygerzColors c, _BetView v) {
    if (actions != null && actions!.isNotEmpty) {
      return Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (var i = 0; i < actions!.length; i++) ...[if (i > 0) const SizedBox(height: 4), actions![i]],
      ]);
    }
    if (v.decided) return StakeText(cents: group.rep.amountCents, treat: group.rep.treat, sign: v.sign, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: v.resultTone));
    return Center(child: wagerStatusBadge(group.rep, me));
  }

  Widget _board(WaygerzColors c, _BetView v) {
    const h = 44.0;
    const gap = 6.0;
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(
        child: Column(children: [
          _teamCell(c, v, v.rows[0], height: h),
          const SizedBox(height: gap),
          _teamCell(c, v, v.rows[1], height: h),
        ]),
      ),
      const SizedBox(width: gap),
      SizedBox(
        width: 44,
        child: Column(children: [
          _pickCell(c, v, v.rows[0].pick, height: h, fontSize: 12),
          const SizedBox(height: gap),
          _pickCell(c, v, v.rows[1].pick, height: h, fontSize: 12),
        ]),
      ),
      const SizedBox(width: gap),
      Container(
        width: 80,
        // Spans both rows; grows when it holds three action buttons.
        constraints: const BoxConstraints(minHeight: h * 2 + gap),
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(color: c.muted.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(WaygerzRadius.md)),
        child: Center(child: _result(c, v)),
      ),
    ]);
  }

  Widget _fieldBoard(WaygerzColors c, _BetView v) {
    return Row(children: [
      Expanded(
        child: Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          alignment: Alignment.centerLeft,
          decoration: BoxDecoration(color: c.muted.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(WaygerzRadius.md)),
          child: Text(wagerPick(group.rep, group.viewerSide), maxLines: 1, overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: v.iWon ? c.brand : v.iLost ? c.destructive : c.foreground)),
        ),
      ),
      const SizedBox(width: 6),
      Container(
        width: 84,
        height: 44,
        decoration: BoxDecoration(color: c.muted.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(WaygerzRadius.md)),
        child: Center(child: _result(c, v)),
      ),
    ]);
  }
}

// ---------------------------------------------------------------- pieces

/// A stake: "$5" (with an optional +/− sign), or the treat emoji for a $0 bet.
class StakeText extends StatelessWidget {
  const StakeText({super.key, required this.cents, this.treat, this.sign = '', this.style});
  final int cents;
  final String? treat;
  final String sign;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    if (cents == 0) {
      return Semantics(
        label: 'Bragging rights — loser buys the round',
        child: Text(treatEmoji(treat), style: TextStyle(fontSize: (style?.fontSize ?? 14) * 1.6, height: 1)),
      );
    }
    return Text('$sign${formatCredits(cents)}', style: style);
  }
}

/// The status badge the web shows for a wager (settled reads Won / Lost).
Widget wagerStatusBadge(Wager w, String me) {
  const s = BadgeVariant.secondary;
  return switch (w.status) {
    'open' => const WzBadge('Open', variant: s),
    'accepted' => const WzBadge('Accepted', variant: s),
    'completed' => const WzBadge('Completed', variant: s),
    'settled' => w.winnerUserId == me
        ? const WzBadge('Won', variant: BadgeVariant.success)
        : const WzBadge('Lost', variant: BadgeVariant.destructive),
    'refunded' => const WzBadge('Refunded', variant: s),
    'declined' => const WzBadge('Declined', variant: s),
    _ => const SizedBox.shrink(),
  };
}

class _Row {
  _Row(this.name, this.logo, this.abbr, this.score, this.lost, this.backed, this.pick);
  final String name;
  final String? logo;
  final String abbr;
  final int? score;
  final bool lost;
  final bool backed;
  final ({String label, bool mine}) pick;
}

/// Everything the card and its details view derive from one group.
class _BetView {
  _BetView(this.group, this.me, this.event, WaygerzColors c) {
    final w = group.rep;
    final side = group.viewerSide;
    field = event?.isFieldSport ?? false;
    isTotal = w.betType == 'total';
    final settled = w.status == 'settled';
    decided = settled || w.status == 'completed';
    iWon = decided && w.winnerUserId != null && w.winnerUserId == me;
    iLost = decided && w.winnerUserId != null && w.winnerUserId != me;
    verb = iWon ? 'beat' : iLost ? 'lost to' : 'vs';
    sign = iWon ? '+' : iLost ? '−' : '';
    started = event != null && event!.status != 'scheduled' && event!.status != 'cancelled';
    final isFinal = event?.status == 'final';
    final hs = event?.homeScore;
    final as_ = event?.awayScore;
    final homeLost = isFinal && hs != null && as_ != null && as_ > hs;
    final awayLost = isFinal && hs != null && as_ != null && hs > as_;
    final voided = const {'cancelled', 'declined', 'refunded'}.contains(w.status);
    final neutral = decided || voided;
    toneBg = iWon
        ? c.brand.withValues(alpha: 0.2)
        : iLost
            ? c.destructive.withValues(alpha: 0.2)
            : neutral
                ? c.muted.withValues(alpha: 0.6)
                : Tw.blue500.withValues(alpha: 0.2);
    toneText = iWon ? c.brand : iLost ? c.destructive : neutral ? c.mutedForeground : Tw.blue500;
    resultTone = iWon ? c.brand : iLost ? c.destructive : c.mutedForeground;
    rail = iWon ? c.brand : iLost ? c.destructive : neutral ? c.mutedForeground.withValues(alpha: 0.5) : Tw.blue500;

    final spreadLn = w.line == null ? null : (side == w.proposerSide ? w.line! : -w.line!);
    ({String label, bool mine}) pickFor(String rowKey) {
      if (isTotal) {
        final mine = (rowKey == 'away' && side == 'over') || (rowKey == 'home' && side == 'under');
        return (label: '${rowKey == 'away' ? 'O' : 'U'} ${w.line == null ? '' : formatLine(w.line!)}'.trim(), mine: mine);
      }
      if (w.betType == 'spread' && spreadLn != null) {
        final mine = rowKey == side;
        final ln = mine ? spreadLn : -spreadLn;
        return (label: '${ln > 0 ? '+' : ''}${formatLine(ln)}', mine: mine);
      }
      final mine = rowKey == side;
      return (label: mine ? 'ML' : '', mine: mine);
    }

    rows = [
      _Row(event?.awayTeam.isNotEmpty == true ? event!.awayTeam : w.awayTeam, event?.awayLogo,
          event?.awayAbbr ?? w.awayTeam, as_, awayLost, !isTotal && side == 'away', pickFor('away')),
      _Row(event?.homeTeam.isNotEmpty == true ? event!.homeTeam : w.homeTeam, event?.homeLogo,
          event?.homeAbbr ?? w.homeTeam, hs, homeLost, !isTotal && side == 'home', pickFor('home')),
    ];
  }

  final WagerGroup group;
  final String me;
  final SportEvent? event;
  late final bool field, isTotal, decided, iWon, iLost, started;
  late final String verb, sign;
  late final Color toneBg, toneText, resultTone, rail;
  late final List<_Row> rows;
}

Widget _teamCell(WaygerzColors c, _BetView v, _Row r, {required double height, double fontSize = 13}) {
  return Container(
    height: height,
    padding: const EdgeInsets.symmetric(horizontal: 8),
    decoration: BoxDecoration(
      color: r.backed ? v.toneBg : c.muted.withValues(alpha: 0.6),
      borderRadius: BorderRadius.circular(WaygerzRadius.md),
    ),
    child: Row(children: [
      TeamLogo(name: r.name, abbreviation: r.abbr, logo: r.logo, size: 24),
      const SizedBox(width: 6),
      Expanded(
        child: Text(r.name, maxLines: 1, overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: fontSize, fontWeight: r.lost ? FontWeight.w400 : FontWeight.w500,
                color: r.lost ? c.mutedForeground : c.foreground)),
      ),
      if (v.started && r.score != null)
        Text('${r.score}', style: TextStyle(fontSize: fontSize + 1, fontWeight: FontWeight.w700,
            color: r.lost ? c.mutedForeground : c.foreground, fontFeatures: const [FontFeature.tabularFigures()])),
    ]),
  );
}

Widget _pickCell(WaygerzColors c, _BetView v, ({String label, bool mine}) p, {required double height, required double fontSize}) {
  return Container(
    height: height,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      color: p.mine ? v.toneBg : c.muted.withValues(alpha: 0.6),
      borderRadius: BorderRadius.circular(WaygerzRadius.md),
    ),
    child: Text(p.label.isEmpty ? '—' : p.label,
        style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w600,
            color: p.mine ? v.toneText : c.mutedForeground, fontFeatures: const [FontFeature.tabularFigures()])),
  );
}

/// Read-only bet details (web BetDetailsDialog): opponent + outcome, the board
/// at sheet size, and a summary line; the body of a `showWzSheet`.
class _BetDetails extends StatelessWidget {
  const _BetDetails({required this.view});
  final _BetView view;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final v = view;
    final g = v.group;
    final w = g.rep;
    final opp = g.opponents.isEmpty ? null : g.opponents.first;
    final betType = switch (w.betType) { 'moneyline' => 'Straight up', 'spread' => 'Spread', _ => 'Total' };
    final matchup = v.field && (w.eventName ?? '').isNotEmpty ? w.eventName! : '${w.awayTeam} @ ${w.homeTeam}';

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
      Padding(
        padding: EdgeInsets.zero,
        child: Row(children: [
          if (opp != null) ...[
            UserAvatar(userId: opp.id, name: opp.name, avatarKey: opp.avatarKey, size: 44),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(opponentsLabel([for (final o in g.opponents) o.name]), maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.foreground)),
              Text(g.iAmProposer ? 'YOU CHALLENGED' : 'CHALLENGED YOU',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, letterSpacing: 0.5, color: c.mutedForeground)),
            ]),
          ),
          if (v.decided)
            WzBadge(v.iWon ? 'Won ${v.sign}${w.amountCents == 0 ? treatEmoji(w.treat) : formatCredits(w.amountCents)}'
                : v.iLost ? 'Lost ${v.sign}${w.amountCents == 0 ? treatEmoji(w.treat) : formatCredits(w.amountCents)}' : 'Push',
                variant: v.iWon ? BadgeVariant.success : v.iLost ? BadgeVariant.destructive : BadgeVariant.secondary)
          else
            wagerStatusBadge(w, v.me),
        ]),
      ),
      const SizedBox(height: 16),
      if (v.field)
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: c.muted.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(WaygerzRadius.md)),
          child: Text(wagerPick(w, g.viewerSide), textAlign: TextAlign.center,
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: v.iWon ? c.brand : v.iLost ? c.destructive : c.foreground)),
        )
      else
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(children: [
              _teamCell(c, v, v.rows[0], height: 48, fontSize: 14),
              const SizedBox(height: 6),
              _teamCell(c, v, v.rows[1], height: 48, fontSize: 14),
            ]),
          ),
          const SizedBox(width: 6),
          SizedBox(
            width: 56,
            child: Column(children: [
              _pickCell(c, v, v.rows[0].pick, height: 48, fontSize: 14),
              const SizedBox(height: 6),
              _pickCell(c, v, v.rows[1].pick, height: 48, fontSize: 14),
            ]),
          ),
          const SizedBox(width: 6),
          Container(
            width: 88,
            height: 102,
            decoration: BoxDecoration(color: c.muted.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(WaygerzRadius.md)),
            child: Center(
              child: v.decided
                  ? StakeText(cents: w.amountCents, treat: w.treat, sign: v.sign,
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: v.resultTone))
                  : wagerStatusBadge(w, v.me),
            ),
          ),
        ]),
      const SizedBox(height: 12),
      Text.rich(
        TextSpan(children: [
          TextSpan(text: '$betType · '),
          TextSpan(text: w.amountCents == 0 ? treatEmoji(w.treat) : formatCredits(w.amountCents)),
          TextSpan(text: ' stake · $matchup'),
        ]),
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 12, color: c.mutedForeground),
      ),
    ]);
  }
}
