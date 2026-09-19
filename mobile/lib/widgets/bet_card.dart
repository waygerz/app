import 'package:flutter/material.dart';

import '../format.dart';
import '../models.dart';
import '../screens/widgets.dart';
import '../theme/app_theme.dart';
import '../wagers.dart';

/// Neutral band colors: totals, and teams without a known color.
const _slate = Color(0xFF64748B);

/// The stacked bet card (web components/bet-card.tsx — change both together):
/// the other player and a headline, then a dark card with the viewer's side as
/// a hero band in their team's color, the other side as a slimmer band in
/// theirs, and a bar with kickoff / live cover / result and the stake.
/// Presentational — callers add the actions (Accept / Counter / Reject …).
class BetCard extends StatelessWidget {
  const BetCard({super.key, required this.wager, required this.me, this.event, this.myTurn});
  final Wager wager;
  final String me;

  /// The game, for colors, logos and live/final scores (null until loaded).
  final SportEvent? event;

  /// Whose turn it is, when the caller knows better than the wager (a /c link).
  final bool? myTurn;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final w = wager;
    final ev = event;
    final iAmProposer = w.proposerId == me;
    final involved = iAmProposer || w.acceptorId == me;
    // A bystander sees the proposer's side on top.
    final topSide = involved && !iAmProposer ? w.acceptorSide : w.proposerSide;
    final bottomSide = topSide == w.proposerSide ? w.acceptorSide : w.proposerSide;
    final otherName = involved ? (iAmProposer ? w.acceptorName : w.proposerName) : w.acceptorName;
    final otherId = involved ? (iAmProposer ? w.acceptorId : w.proposerId) : w.acceptorId;
    final otherAvatar = involved ? (iAmProposer ? w.acceptorAvatarKey : w.proposerAvatarKey) : w.acceptorAvatarKey;
    final turn = myTurn ?? w.myTurn ?? w.acceptorId == me;
    final countered = w.stakeRound > 0;
    final decided = w.status == 'completed' || w.status == 'settled';
    final topWon = decided && w.winnerUserId != null && w.winnerUserId == (involved ? me : w.proposerId);
    final topLost = decided && w.winnerUserId != null && !topWon;
    final terminal = const {'declined', 'cancelled', 'refunded'}.contains(w.status);
    final started = ev != null && (ev.status == 'live' || ev.status == 'final');
    final live = ev?.status == 'live';

    final headline = decided
        ? (w.winnerUserId == null ? 'Push' : involved ? (topWon ? 'You beat $otherName' : '$otherName beat you') : "${w.proposerName}'s bet")
        : terminal
            ? (w.status == 'declined'
                ? (involved && turn ? 'You declined this bet' : '$otherName declined')
                : w.status == 'cancelled'
                    ? 'Bet cancelled'
                    : 'Bet refunded')
            : !involved
                ? "${w.proposerName}'s bet"
                : turn && w.status == 'open'
                    ? '$otherName ${countered ? 'countered your bet' : 'sent you a bet'}'
                    : w.status == 'accepted'
                        ? 'You’re on with $otherName'
                        : 'Waiting on $otherName';

    final state = decided
        ? (w.winnerUserId == null ? 'PUSH' : topWon ? 'WON' : 'LOST')
        : terminal
            ? w.status.toUpperCase()
            : live
                ? 'LIVE'
                : w.status == 'accepted'
                    ? 'LOCKED IN' // accepted, not kicked off yet (web: same label)
                    : w.status == 'open' && turn
                        ? 'OFFERED'
                        : 'PENDING';

    final isTotal = w.betType == 'total';
    Color? hex(String? v) => TeamLogo.parseHex(v);
    Color bandColor(String side, Color fallback) {
      if (isTotal) return fallback;
      return hex(side == 'home' ? ev?.homeColor : ev?.awayColor) ?? fallback;
    }

    String pick(String side) => '${wagerPick(w, side)}${w.betType == 'moneyline' ? ' to win' : ''}';
    int? score(String side) {
      if (!started) return null;
      if (isTotal) return null;
      return side == 'home' ? ev.homeScore : ev.awayScore;
    }

    final away = ev?.awayAbbr ?? (ev?.awayTeam.isNotEmpty == true ? ev!.awayTeam : w.awayTeam);
    final home = ev?.homeAbbr ?? (ev?.homeTeam.isNotEmpty == true ? ev!.homeTeam : w.homeTeam);
    final kickoff = formatStart(ev?.startTime ?? w.startTime);
    final gameLine = started && ev.awayScore != null && ev.homeScore != null
        ? '$away ${ev.awayScore} – ${ev.homeScore} $home'
        : '$away @ $home · $kickoff';
    final runningTotal = isTotal && started && ev.awayScore != null && ev.homeScore != null
        ? ev.awayScore! + ev.homeScore!
        : null;

    final top = _Band(
      color: bandColor(topSide, c.primary),
      logo: isTotal ? null : (topSide == 'home' ? ev?.homeLogo : ev?.awayLogo),
      logoName: topSide == 'home' ? w.homeTeam : w.awayTeam,
      label: Text('${involved ? 'YOUR PICK' : w.proposerName.toUpperCase()} · $state', style: _label),
      pick: pick(topSide),
      sub: isTotal ? gameLine : null,
      score: isTotal ? runningTotal : score(topSide),
      hero: true,
      faded: topLost,
    );
    final bottom = _Band(
      color: bandColor(bottomSide, _slate),
      logo: isTotal ? null : (bottomSide == 'home' ? ev?.homeLogo : ev?.awayLogo),
      logoName: bottomSide == 'home' ? w.homeTeam : w.awayTeam,
      label: Row(children: [
        UserAvatar(userId: otherId, name: otherName, avatarKey: otherAvatar, size: 16),
        const SizedBox(width: 5),
        Flexible(child: Text(otherName.toUpperCase(), maxLines: 1, overflow: TextOverflow.ellipsis, style: _label)),
      ]),
      pick: pick(bottomSide),
      score: score(bottomSide),
      hero: false,
      faded: topWon,
    );

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
      Row(children: [
        UserAvatar(userId: otherId, name: otherName, avatarKey: otherAvatar, size: 40),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(headline, maxLines: 2, overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.foreground)),
            Text(w.leagueName?.isNotEmpty == true ? w.leagueName! : 'Head-to-head',
                style: TextStyle(fontSize: 12, color: c.mutedForeground)),
          ]),
        ),
      ]),
      const SizedBox(height: 12),
      // Always dark, like the top bar, so team colors read the same in both themes.
      Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: c.headerBackground,
          border: Border.all(color: c.headerBorder),
          borderRadius: BorderRadius.circular(WaygerzRadius.xl),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          top,
          Container(height: 1, color: Colors.white.withValues(alpha: 0.06)),
          bottom,
          _bar(c, w, ev, topSide, involved, decided, topWon, terminal, live, started, kickoff),
        ]),
      ),
    ]);
  }

  static const _label = TextStyle(
      fontSize: 10.5, fontWeight: FontWeight.w900, letterSpacing: 0.8, color: Color(0xC7FFFFFF));

  Widget _bar(WaygerzColors c, Wager w, SportEvent? ev, String side, bool involved, bool decided, bool topWon,
      bool terminal, bool live, bool started, String kickoff) {
    const muted = Color(0xFF9092A2);
    const green = Color(0xFF4ADE80);
    const red = Color(0xFFF87171);
    const tabular = [FontFeature.tabularFigures()];
    final cover = coverStatus(w, side, ev);
    final stake = w.amountCents > 0 ? formatCredits(w.amountCents) : treatEmoji(w.treat);
    final betType = switch (w.betType) { 'moneyline' => 'Straight up', 'spread' => 'Spread', _ => 'Total' };

    Widget pill(String text, Color fg, Color bg) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
          child: Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: fg)),
        );
    Widget coverText() => Text(cover!.text,
        style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: cover.ok ? green : red, fontFeatures: tabular));

    final List<Widget> left = terminal
        ? [pill(w.status[0].toUpperCase() + w.status.substring(1), muted, Colors.white.withValues(alpha: 0.08))]
        : live
            ? [pill('LIVE', red, red.withValues(alpha: 0.16)), if (cover != null) ...[const SizedBox(width: 8), coverText()]]
            : started && cover != null
                ? [coverText()]
                : [Flexible(child: Text('$kickoff · $betType', maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5, color: muted)))];

    final hasResult = decided && w.winnerUserId != null && involved;
    final right = hasResult
        ? Text.rich(TextSpan(children: [
            TextSpan(text: topWon ? 'Won ' : 'Lost ', style: const TextStyle(color: muted, fontWeight: FontWeight.w500)),
            TextSpan(text: '${topWon ? '+' : '−'}$stake'),
          ]), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: topWon ? green : red, fontFeatures: tabular))
        : decided && w.winnerUserId == null
            ? const Text('Push', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white))
            : Text.rich(TextSpan(children: [
                const TextSpan(text: 'Stake ', style: TextStyle(color: muted, fontWeight: FontWeight.w500, fontSize: 12.5)),
                TextSpan(text: stake),
              ]), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.white, fontFeatures: tabular));

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(border: Border(top: BorderSide(color: c.headerBorder))),
      child: Row(children: [
        Expanded(child: Row(children: left)),
        const SizedBox(width: 8),
        right,
      ]),
    );
  }
}

/// One side of the bet: a gradient in the side's color, a faded logo, the
/// label, the pick and (once scored) the score. The viewer's side is the hero.
class _Band extends StatelessWidget {
  const _Band({
    required this.color,
    required this.label,
    required this.pick,
    required this.hero,
    required this.faded,
    required this.logoName,
    this.logo,
    this.sub,
    this.score,
  });

  final Color color;
  final Widget label;
  final String pick;
  final bool hero;
  final bool faded;
  final String logoName;
  final String? logo;
  final String? sub;
  final int? score;

  // Desaturate and darken the losing side at the final.
  static const _fade = ColorFilter.matrix([
    0.33, 0.33, 0.33, 0, 0, //
    0.33, 0.33, 0.33, 0, 0,
    0.33, 0.33, 0.33, 0, 0,
    0, 0, 0, 0.7, 0,
  ]);

  @override
  Widget build(BuildContext context) {
    const tabular = [FontFeature.tabularFigures()];
    final logoSize = hero ? 86.0 : 60.0;
    final band = Container(
      constraints: BoxConstraints(minHeight: hero ? 92 : 64),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: hero ? Alignment.topLeft : Alignment.bottomLeft,
          end: hero ? Alignment.bottomRight : Alignment.topRight,
          colors: [color.withValues(alpha: 0.85), color.withValues(alpha: 0.15)],
        ),
      ),
      child: Stack(clipBehavior: Clip.none, alignment: Alignment.centerRight, children: [
        if (logo != null)
          Positioned(
            right: score == null ? -6 : 44,
            child: Opacity(
              opacity: 0.18,
              child: TeamLogo(name: logoName, abbreviation: '', logo: logo, size: logoSize),
            ),
          ),
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              label,
              const SizedBox(height: 2),
              Text(pick, maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: hero ? 26 : 16, fontWeight: FontWeight.w900, height: 1.15,
                      color: Colors.white, fontFeatures: tabular)),
              if (sub != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(sub!, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: Color(0xCCFFFFFF), fontFeatures: tabular)),
                ),
            ]),
          ),
          if (score != null) ...[
            const SizedBox(width: 8),
            Text('$score', style: TextStyle(fontSize: hero ? 32 : 26, fontWeight: FontWeight.w900, color: Colors.white,
                fontFeatures: tabular)),
          ],
        ]),
      ]),
    );
    return faded ? ColorFiltered(colorFilter: _fade, child: band) : band;
  }
}
