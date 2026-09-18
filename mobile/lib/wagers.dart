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
