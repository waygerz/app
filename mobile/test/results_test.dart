import 'package:flutter_test/flutter_test.dart';
import 'package:waygerz/api/comments_api.dart';
import 'package:waygerz/format.dart';
import 'package:waygerz/models.dart';
import 'package:waygerz/wagers.dart';

Wager settled(String id, {required String winner, int amount = 1000, String? treat, String opp = 'bo'}) => Wager(
      id: id, leagueId: 'L', eventId: 'e$id', status: 'settled', betType: 'moneyline',
      proposerSide: 'home', acceptorSide: 'away', amountCents: amount, treat: treat,
      proposerId: 'me', acceptorId: opp, proposerName: 'Me', acceptorName: opp.toUpperCase(), winnerUserId: winner,
    );

void main() {
  test('reconcile nets dollars, beers and shots separately, per opponent', () {
    final r = reconcile([
      settled('1', winner: 'me', amount: 2000),
      settled('2', winner: 'bo', amount: 500),
      settled('3', winner: 'me', amount: 0, treat: 'beer'),
      settled('4', winner: 'cy', amount: 0, treat: 'shot', opp: 'cy'),
      Wager(id: '5', leagueId: 'L', eventId: 'e5', status: 'refunded', betType: 'moneyline', proposerSide: 'home',
          acceptorSide: 'away', amountCents: 900, proposerId: 'me', acceptorId: 'bo'),
    ], 'me');
    expect(r.wins, 2);
    expect(r.losses, 2);
    expect(r.netCents, 1500);
    expect(r.netBeers, 1);
    expect(r.netShots, -1);
    expect(r.perOpp['bo']!.netCents, 1500);
    expect(r.perOpp['cy']!.netShots, -1);
    expect(r.even, isFalse);
  });

  test('chat time labels', () {
    final now = DateTime.now();
    expect(shortAgo(now.subtract(const Duration(seconds: 10)).toIso8601String()), 'now');
    expect(shortAgo(now.subtract(const Duration(minutes: 7)).toIso8601String()), '7m');
    expect(dayLabel(now.toIso8601String()), 'Today');
    expect(dayLabel(now.subtract(const Duration(days: 1)).toIso8601String()), 'Yesterday');
    expect(clockTime(DateTime(2026, 9, 18, 0, 5).toIso8601String()), '12:05 AM');
    expect(clockTime(DateTime(2026, 9, 18, 13, 30).toIso8601String()), '1:30 PM');
  });

  test('top reaction emoji, most used first', () {
    const e = PostEngagement(reactions: {'fire': 3, 'like': 5, 'haha': 1, 'wow': 0, 'rekt': 2}, total: 11);
    expect(e.topEmojis, '👍🔥😭');
  });
}
