/// Wager display logic shared by the bets screens — a port of web/lib/wagers.ts
/// and app/(app)/bets/bets-common.tsx, so both clients group, label, filter
/// and gate actions identically.
library;

import 'models.dart';

/// Cancelling shuts this long before kickoff (contests CANCEL_LOCK_SECONDS).
const cancelLockWindow = Duration(minutes: 10);

/// True once a wager is inside the pre-game window where nobody may cancel.
bool cancelLocked(Wager w) {
  final t = w.startTime == null ? null : DateTime.tryParse(w.startTime!);
  if (t == null) return false; // unknown start doesn't lock, same as the backend
  return !DateTime.now().isBefore(t.subtract(cancelLockWindow));
}

/// The side the viewer backs, whoever proposed.
String viewerSide(Wager w, String me) => w.proposerId == me ? w.proposerSide : w.acceptorSide;

/// "Bills -3.5", "Over 47.5", or just the team for a moneyline.
String wagerPick(Wager w, String side) {
  if (w.betType == 'total') return '${side == 'over' ? 'Over' : 'Under'} ${_num(w.line)}'.trim();
  final team = side == 'home' ? w.homeTeam : w.awayTeam;
  if (w.betType == 'spread' && w.line != null) {
    final ln = side == w.proposerSide ? w.line! : -w.line!;
    return '$team ${ln > 0 ? '+' : ''}${_num(ln)}';
  }
  return team;
}

/// A line without a trailing ".0" (3.0 → "3", -3.5 → "-3.5").
String _num(double? v) {
  if (v == null) return '';
  return v == v.roundToDouble() ? v.toInt().toString() : v.toString();
}

String formatLine(double v) => _num(v);

/// "Ann, Bo" or "Ann, Bo +2".
String opponentsLabel(List<String> names) =>
    names.length <= 2 ? names.join(', ') : '${names[0]}, ${names[1]} +${names.length - 2}';

class Opponent {
  const Opponent(this.id, this.name, this.avatarKey);
  final String id;
  final String name;
  final String? avatarKey;
}

/// One card: the same bet offered to several people folds into a group.
class WagerGroup {
  WagerGroup(this.key, this.rep, this.iAmProposer, this.viewerSide);
  final String key;

  /// Representative — every sibling shares game, pick, stake, status and action.
  final Wager rep;
  final List<Wager> wagers = [];
  final List<Opponent> opponents = [];
  final bool iAmProposer;
  final String viewerSide;

  List<String> get ids => [for (final w in wagers) w.id];
}

// Siblings only merge when they'd render an identical card AND offer the
// identical action (same game/pick/stake/status/role, cancel and outcome state).
String _groupKey(Wager w, String me) {
  final cancel = w.cancelRequestedBy == null ? 'none' : (w.cancelRequestedBy == me ? 'mine' : 'theirs');
  final outcome = w.winnerUserId == null ? 'undecided' : (w.winnerUserId == me ? 'won' : 'lost');
  return [
    w.eventId, viewerSide(w, me), w.betType, w.line ?? '', w.amountCents, w.status,
    w.proposerId == me ? 'P' : 'A', cancel, outcome,
  ].join('|');
}

/// Fold a flat wager list into cards, preserving first-seen order.
List<WagerGroup> groupWagers(List<Wager> wagers, String me) {
  final byKey = <String, WagerGroup>{};
  for (final w in wagers) {
    final key = _groupKey(w, me);
    final g = byKey.putIfAbsent(key, () => WagerGroup(key, w, w.proposerId == me, viewerSide(w, me)));
    g.wagers.add(w);
    g.opponents.add(g.iAmProposer
        ? Opponent(w.acceptorId, w.acceptorName, w.acceptorAvatarKey)
        : Opponent(w.proposerId, w.proposerName, w.proposerAvatarKey));
  }
  return byKey.values.toList();
}

enum BetFilter { all, active, pending, closed, cancelled }

const betFilterLabels = {
  BetFilter.all: 'All',
  BetFilter.active: 'Active',
  BetFilter.pending: 'Pending',
  BetFilter.closed: 'Closed',
  BetFilter.cancelled: 'Cancelled',
};

/// The bets tab filters, sorted by game time, latest first (unknown last).
List<Wager> filterWagers(List<Wager> wagers, BetFilter f) {
  final picked = switch (f) {
    BetFilter.pending => wagers.where((w) => w.status == 'open'),
    BetFilter.active => wagers.where((w) => w.status == 'accepted' || w.status == 'completed'),
    BetFilter.closed => wagers.where((w) => const {'settled', 'declined', 'refunded'}.contains(w.status)),
    BetFilter.cancelled => wagers.where((w) => w.status == 'cancelled'),
    BetFilter.all => wagers,
  }.toList();
  int ms(Wager w) => DateTime.tryParse(w.startTime ?? '')?.millisecondsSinceEpoch ?? 0;
  picked.sort((a, b) => ms(b).compareTo(ms(a)));
  return picked;
}

enum BetSort { dateDesc, dateAsc, stakeDesc }

const betSortLabels = {
  BetSort.dateDesc: 'Newest game',
  BetSort.dateAsc: 'Oldest game',
  BetSort.stakeDesc: 'Biggest stake',
};

/// Web components/bet-sort-menu.tsx `sortGroups`.
List<WagerGroup> sortGroups(List<WagerGroup> groups, BetSort sort) {
  int start(WagerGroup g) => DateTime.tryParse(g.rep.startTime ?? '')?.millisecondsSinceEpoch ?? 0;
  final out = [...groups];
  out.sort((a, b) => switch (sort) {
        BetSort.stakeDesc => b.rep.amountCents.compareTo(a.rep.amountCents),
        BetSort.dateAsc => start(a).compareTo(start(b)),
        BetSort.dateDesc => start(b).compareTo(start(a)),
      });
  return out;
}

/// The current line from a side's perspective (stored proposer-perspective;
/// only a spread flips for the acceptor). Null for a moneyline.
double? lineForSide(Wager w, String side) {
  if (w.line == null || w.betType == 'moneyline') return null;
  if (w.betType == 'spread') return side == w.proposerSide ? w.line : -w.line!;
  return w.line; // total — same both sides
}

/// A line as read on the viewer's side: signed spread ("+3.5"), bare total ("47").
String lineStr(String betType, double? line) {
  if (line == null) return '';
  if (betType == 'total') return formatLine(line);
  return '${line > 0 ? '+' : ''}${formatLine(line)}';
}

/// Dollars for an editable stake field: "10", "12.50".
String centsToDollars(int cents) => cents % 100 == 0 ? '${cents ~/ 100}' : (cents / 100).toStringAsFixed(2);

/// A stake the user typed, in cents; null when it isn't a valid amount.
int? parseStakeCents(String dollars) {
  final n = double.tryParse(dollars.trim());
  if (n == null || n.isNaN || n < 0) return null;
  return (n * 100).round();
}

/// One opponent's net for a week (web results.tsx OppRecon).
class OppRecon {
  OppRecon(this.name);
  final String name;
  int netCents = 0, netBeers = 0, netShots = 0, wins = 0, losses = 0;
}

/// A week's decided bets netted from the viewer's side: dollars, beers and
/// shots kept apart (different currencies), overall and per opponent. Pushes
/// and refunds don't move it (web results.tsx reconcile).
class Recon {
  int wins = 0, losses = 0, netCents = 0, netBeers = 0, netShots = 0;
  final Map<String, OppRecon> perOpp = {};

  bool get even => netCents == 0 && netBeers == 0 && netShots == 0;
}

Recon reconcile(List<Wager> wagers, String me) {
  final r = Recon();
  for (final w in wagers) {
    if (w.status != 'settled' || w.winnerUserId == null) continue;
    final iWon = w.winnerUserId == me;
    final iProposed = w.proposerId == me;
    final o = r.perOpp.putIfAbsent(iProposed ? w.acceptorId : w.proposerId,
        () => OppRecon(iProposed ? w.acceptorName : w.proposerName));
    final d = iWon ? 1 : -1;
    if (iWon) {
      r.wins++;
      o.wins++;
    } else {
      r.losses++;
      o.losses++;
    }
    if (w.amountCents == 0 && w.treat == 'shot') {
      r.netShots += d;
      o.netShots += d;
    } else if (w.amountCents == 0) {
      r.netBeers += d;
      o.netBeers += d;
    } else {
      r.netCents += d * w.amountCents;
      o.netCents += d * w.amountCents;
    }
  }
  return r;
}
