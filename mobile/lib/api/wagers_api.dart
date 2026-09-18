import '../config.dart';
import '../models.dart';
import 'api_client.dart';

/// Client for the contests service (`/v1/gameplay/contests`) — even-money H2H
/// wagers. Mirrors web/lib/wagers.ts.
class WagersApi {
  WagersApi(this._api);
  final ApiClient _api;
  String get _p => Config.contests;

  /// The caller's wagers, optionally scoped to a league and/or status.
  Future<List<Wager>> mine({String? leagueId, String? status}) async {
    final res = await _api.get(
        withQuery('$_p/wagers', {'league_id': leagueId, 'status': status}));
    final list = (res['wagers'] as List<dynamic>? ?? []);
    return list.map((e) => Wager.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Wager> wager(String id) async {
    final res = await _api.get('$_p/wagers/$id');
    return Wager.fromJson(res['wager'] as Map<String, dynamic>);
  }

  /// Propose a wager to one or more co-members. `acceptorIds` fans out to one
  /// independent 1v1 offer each. `amountCents` may be 0 (bragging rights).
  /// Offer a bet to one or more members. Same contract as the web: `side` is
  /// the proposer's side (home|away or over|under); a $0 bet names a `treat`;
  /// field-sport matchups pass `homeTeam` / `awayTeam`. Returns how many offers
  /// were created plus the per-member errors (a 400 if none were).
  Future<({int created, List<String> errors})> propose({
    required String leagueId,
    required String eventId,
    required String side,
    required int amountCents,
    required List<String> acceptorIds,
    String betType = 'moneyline', // moneyline | spread | total
    double? line,
    String? treat, // beer | shot, for $0 bets
    String? homeTeam,
    String? awayTeam,
  }) async {
    final res = await _api.post('$_p/wagers', body: {
      'league_id': leagueId,
      'event_id': eventId,
      'bet_type': betType,
      'side': side,
      'amount_cents': amountCents,
      'acceptor_ids': acceptorIds,
      if (line != null) 'line': line,
      if (treat != null) 'treat': treat,
      if (homeTeam != null) 'home_team': homeTeam,
      if (awayTeam != null) 'away_team': awayTeam,
    });
    final errors = ((res['errors'] as List<dynamic>?) ?? [])
        .map((e) => '${(e as Map<String, dynamic>)['error']}')
        .toList();
    return (created: ((res['created'] as List<dynamic>?) ?? []).length, errors: errors);
  }

  Future<void> accept(String id) => _api.post('$_p/wagers/$id/accept');
  Future<void> decline(String id) => _api.post('$_p/wagers/$id/decline');

  /// Reopen a bet you declined, so it can be accepted after all (until kickoff).
  Future<void> undecline(String id) => _api.post('$_p/wagers/$id/undecline');

  /// Withdraw your own open offer.
  Future<void> cancel(String id) => _api.post('$_p/wagers/$id/cancel');

  /// Renegotiate an open bet: a new stake and, for a spread/total, a new line
  /// in the caller's own perspective (the server normalizes it).
  Future<void> counter(String id, {required int amountCents, double? line, String? treat}) =>
      _api.post('$_p/wagers/$id/counter', body: {
        'amount_cents': amountCents,
        'line': line,
        if (treat != null) 'treat': treat,
      });

  /// The score-decided winner confirms a completed bet, which pays them.
  Future<void> confirm(String id) => _api.post('$_p/wagers/$id/confirm');
  Future<void> requestCancel(String id) => _api.post('$_p/wagers/$id/cancel/request');
  Future<void> approveCancel(String id) => _api.post('$_p/wagers/$id/cancel/approve');
  Future<void> rejectCancel(String id) => _api.post('$_p/wagers/$id/cancel/reject');
}
