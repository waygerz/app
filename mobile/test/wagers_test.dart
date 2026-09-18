import 'package:flutter_test/flutter_test.dart';
import 'package:waygerz/models.dart';
import 'package:waygerz/wagers.dart';

Wager w({
  String id = 'w1',
  String status = 'open',
  String betType = 'spread',
  double? line = -3.5,
  String proposerSide = 'home',
  String acceptorSide = 'away',
  String proposer = 'me',
  String acceptor = 'bo',
  String acceptorName = 'Bo',
  int amount = 500,
  String? start,
  String event = 'e1',
}) =>
    Wager(
      id: id, leagueId: 'L', eventId: event, status: status, betType: betType,
      proposerSide: proposerSide, acceptorSide: acceptorSide, amountCents: amount,
      proposerId: proposer, acceptorId: acceptor, acceptorName: acceptorName, proposerName: 'Me',
      line: line, homeTeam: 'Bills', awayTeam: 'Jets', startTime: start,
    );

// Mirrors web/lib/wagers.ts + bets-common.tsx behavior.
void main() {
  test('wagerPick flips the spread for the other side', () {
    final x = w();
    expect(wagerPick(x, 'home'), 'Bills -3.5');
    expect(wagerPick(x, 'away'), 'Jets +3.5');
    expect(wagerPick(w(betType: 'total', line: 47.0), 'over'), 'Over 47');
    expect(wagerPick(w(betType: 'moneyline', line: null), 'away'), 'Jets');
  });

  test('viewerSide follows the viewer role', () {
    expect(viewerSide(w(), 'me'), 'home');
    expect(viewerSide(w(), 'bo'), 'away');
  });

  test('identical offers to several people fold into one group', () {
    final gs = groupWagers([
      w(id: 'a', acceptor: 'bo', acceptorName: 'Bo'),
      w(id: 'b', acceptor: 'cy', acceptorName: 'Cy'),
      w(id: 'c', acceptor: 'di', acceptorName: 'Di', amount: 1000), // different stake
    ], 'me');
    expect(gs.length, 2);
    expect(gs.first.ids, ['a', 'b']);
    expect(gs.first.opponents.map((o) => o.name), ['Bo', 'Cy']);
    expect(gs.first.iAmProposer, isTrue);
  });

  test('opponentsLabel', () {
    expect(opponentsLabel(['A', 'B']), 'A, B');
    expect(opponentsLabel(['A', 'B', 'C', 'D']), 'A, B +2');
  });

  test('filters and sort by game time, newest first', () {
    final list = [
      w(id: 'open', start: '2026-09-20T17:00:00Z'),
      w(id: 'acc', status: 'accepted', start: '2026-09-21T17:00:00Z'),
      w(id: 'done', status: 'completed', start: '2026-09-19T17:00:00Z'),
      w(id: 'won', status: 'settled'),
      w(id: 'off', status: 'cancelled'),
    ];
    expect(filterWagers(list, BetFilter.pending).map((x) => x.id), ['open']);
    expect(filterWagers(list, BetFilter.active).map((x) => x.id), ['acc', 'done']);
    expect(filterWagers(list, BetFilter.closed).map((x) => x.id), ['won']);
    expect(filterWagers(list, BetFilter.cancelled).map((x) => x.id), ['off']);
    expect(filterWagers(list, BetFilter.all).first.id, 'acc');
  });

  test('cancelLocked 10 minutes before kickoff', () {
    final soon = DateTime.now().add(const Duration(minutes: 5)).toUtc().toIso8601String();
    final later = DateTime.now().add(const Duration(hours: 2)).toUtc().toIso8601String();
    expect(cancelLocked(w(start: soon)), isTrue);
    expect(cancelLocked(w(start: later)), isFalse);
    expect(cancelLocked(w()), isFalse); // unknown start never locks
  });
}
