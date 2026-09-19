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
