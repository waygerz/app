import 'package:flutter_test/flutter_test.dart';
import 'package:waygerz/format.dart';

// Expectations mirror the web helpers these port (lib/wallet.ts formatCredits,
// event-card formatStart, standings formatRecord, …).
void main() {
  test('formatCredits drops .00 and groups thousands', () {
    expect(formatCredits(500), r'$5');
    expect(formatCredits(1250), r'$12.50');
    expect(formatCredits(120000), r'$1,200');
    expect(formatCredits(-2000), r'-$20');
    expect(formatCredits(0), r'$0');
  });

  test('inviteCodeFrom', () {
    expect(inviteCodeFrom(' l7k2pqx '), 'L7K2PQX');
    expect(inviteCodeFrom('https://waygerz.com/c/L7K2PQX'), 'L7K2PQX');
    expect(inviteCodeFrom('Join me: https://waygerz.com/c/b9xk2m3?ref=sms'), 'B9XK2M3');
    expect(inviteCodeFrom(''), '');
    expect(inviteCodeFrom('not a code'), '');
  });

  test('groupByKickoff', () {
    final sun1 = DateTime(2026, 9, 20, 13).toIso8601String();
    final sun4 = DateTime(2026, 9, 20, 16, 25).toIso8601String();
    final thu = DateTime(2026, 9, 17, 20, 15).toIso8601String();
    final games = [('b', sun1), ('tbd', null), ('d', sun4), ('a', thu), ('c', sun1)];
    final g = groupByKickoff(games, (e) => e.$2);
    expect(g.map((x) => x.day).toList(), ['Thursday', 'Sunday', 'Sunday', 'TBD']);
    expect(g.map((x) => x.time).toList(), ['8:15 PM', '1:00 PM', '4:25 PM', '']);
    expect(g[1].items.map((e) => e.$1).toList(), ['b', 'c']);
  });

  test('ordinal', () {
    expect(ordinal(1), '1st');
    expect(ordinal(2), '2nd');
    expect(ordinal(3), '3rd');
    expect(ordinal(4), '4th');
    expect(ordinal(11), '11th');
    expect(ordinal(12), '12th');
    expect(ordinal(13), '13th');
    expect(ordinal(21), '21st');
    expect(ordinal(112), '112th');
  });

  test('formatStart', () {
    expect(formatStart(null), 'TBD');
    expect(formatStart('nope'), 'TBD');
    final local = DateTime(2026, 9, 20, 13, 5).toIso8601String();
    expect(formatStart(local), 'Sun, Sep 20, 1:05 PM');
  });

  test('labels', () {
    expect(leagueTypeLabel('head_to_head'), 'Head-to-head');
    expect(leagueTypeLabel('pickem'), "Pick'em");
    expect(memberRoleLabel('commissioner'), 'Commish');
    expect(memberRoleLabel('owner'), 'Owner');
    expect(formatRecord(3, 1), '3–1');
    expect(formatRecord(3, 1, 2), '3–1–2');
    expect(treatEmoji('shot'), '🥃');
    expect(treatEmoji(null), '🍺');
  });

  test('timeAgo', () {
    final now = DateTime.now();
    expect(timeAgo(now.subtract(const Duration(seconds: 5)).toIso8601String()), 'just now');
    expect(timeAgo(now.subtract(const Duration(minutes: 5)).toIso8601String()), '5m ago');
    expect(timeAgo(now.subtract(const Duration(hours: 3)).toIso8601String()), '3h ago');
    expect(timeAgo(now.subtract(const Duration(days: 2)).toIso8601String()), '2d ago');
  });

  test('shortPeriodLabel (same rules as web)', () {
    expect(shortPeriodLabel('Hall of Fame Weekend'), 'HF');
    expect(shortPeriodLabel('Preseason Week 1'), 'P1');
    expect(shortPeriodLabel('Week 2'), 'W2');
    expect(shortPeriodLabel('Wild Card'), 'WC');
    expect(shortPeriodLabel('Divisional Round'), 'DIV');
    expect(shortPeriodLabel('Conference Championship'), 'CONF');
    expect(shortPeriodLabel('Pro Bowl'), 'PB');
    expect(shortPeriodLabel('Super Bowl'), 'SB');
    expect(shortPeriodLabel('Week of Sep 14'), '9/14');
    expect(shortPeriodLabel('Season 2026'), '2026');
    expect(shortPeriodLabel('Other'), 'O');
  });
}
