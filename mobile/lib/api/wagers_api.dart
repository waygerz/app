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
    final q = <String>[];
    if (leagueId != null) q.add('league_id=$leagueId');
    if (status != null) q.add('status=$status');
    final qs = q.isEmpty ? '' : '?${q.join('&')}';
    final res = await _api.get('$_p/wagers$qs');
    final list = (res['wagers'] as List<dynamic>? ?? []);
    return list.map((e) => Wager.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Wager> wager(String id) async {
    final res = await _api.get('$_p/wagers/$id');
    return Wager.fromJson(res['wager'] as Map<String, dynamic>);
  }

  /// Propose a wager to one or more co-members. `acceptorIds` fans out to one
  /// independent 1v1 offer each. `amountCents` may be 0 (bragging rights).
  Future<void> propose({
    required String leagueId,
    required String eventId,
    required String betType, // moneyline | spread | total
    required String proposerSide, // home|away or over|under
    required int amountCents,
    required List<String> acceptorIds,
    double? line,
  }) {
    return _api.post('$_p/wagers', body: {
      'league_id': leagueId,
      'event_id': eventId,
      'bet_type': betType,
      'proposer_side': proposerSide,
      'amount_cents': amountCents,
      'acceptor_ids': acceptorIds,
      if (line != null) 'line': line,
    });
  }

  Future<void> accept(String id) => _api.post('$_p/wagers/$id/accept');
  Future<void> decline(String id) => _api.post('$_p/wagers/$id/decline');
  Future<void> cancel(String id) => _api.post('$_p/wagers/$id/cancel');
  Future<void> requestCancel(String id) => _api.post('$_p/wagers/$id/cancel/request');
  Future<void> approveCancel(String id) => _api.post('$_p/wagers/$id/cancel/approve');
  Future<void> rejectCancel(String id) => _api.post('$_p/wagers/$id/cancel/reject');
}
