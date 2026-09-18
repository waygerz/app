import '../config.dart';
import '../models.dart';
import 'api_client.dart';

/// Client for the leagues service (`/v1/gameplay/leagues`) — Pick'em play +
/// the league container shared with H2H. Mirrors web/lib/leagues.ts.
class LeaguesApi {
  LeaguesApi(this._api);
  final ApiClient _api;
  String get _p => Config.leagues;

  Future<List<League>> myLeagues() async {
    final res = await _api.get('$_p/');
    final list = (res['leagues'] as List<dynamic>? ?? []);
    return list.map((e) => League.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<League> league(String id) async {
    final res = await _api.get('$_p/$id');
    return League.fromJson(res['league'] as Map<String, dynamic>);
  }

  /// Create a league (the caller becomes its commissioner).
  Future<League> create({
    required String name,
    String? description,
    String? logoKey,
    required String leagueType,
    required String periodType,
    int? startingBalanceCents,
    required List<({String id, String name})> sports,
    required Map<String, dynamic> rules,
  }) async {
    final res = await _api.post('$_p/', body: {
      'name': name,
      'description': description,
      'logo_url': logoKey,
      'league_type': leagueType,
      'period_type': periodType,
      'starting_balance_cents': startingBalanceCents,
      'sports': [for (final s in sports) {'sport_league_id': s.id, 'name': s.name}],
      'rules': rules,
    });
    return League.fromJson(res['league'] as Map<String, dynamic>);
  }

  Future<League> activate(String id) async {
    final res = await _api.post('$_p/$id/activate');
    return League.fromJson(res['league'] as Map<String, dynamic>);
  }

  Future<List<LeaguePeriod>> periods(String id) async {
    final res = await _api.get('$_p/$id/periods');
    final list = (res['periods'] as List<dynamic>? ?? []);
    return list.map((e) => LeaguePeriod.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Commissioner: rebuild the weeks from the sports' schedules.
  Future<List<LeaguePeriod>> regeneratePeriods(String id) async {
    final res = await _api.post('$_p/$id/periods/regenerate');
    final list = (res['periods'] as List<dynamic>? ?? []);
    return list.map((e) => LeaguePeriod.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<Pick>> getPicks(String leagueId, String periodId) async {
    final res = await _api.get('$_p/$leagueId/periods/$periodId/picks');
    final list = (res['picks'] as List<dynamic>? ?? []);
    return list.map((e) => Pick.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Upsert this member's picks for an open period. Each entry is
  /// `{event_id, side}` with an optional `tiebreaker_total` on the last game.
  Future<List<Pick>> submitPicks(
    String leagueId,
    String periodId,
    List<Map<String, dynamic>> picks,
  ) async {
    final res = await _api.put('$_p/$leagueId/periods/$periodId/picks', body: {'picks': picks});
    final list = (res['picks'] as List<dynamic>? ?? []);
    return list.map((e) => Pick.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<List<StandingRow>> standings(String id) async {
    final res = await _api.get('$_p/$id/standings');
    final list = (res['standings'] as List<dynamic>? ?? []);
    return list.map((e) => StandingRow.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// The caller's pending league invites.
  Future<List<LeagueInvite>> invites() async {
    final res = await _api.get('$_p/invites');
    final list = (res['invites'] as List<dynamic>? ?? []);
    return list.map((e) => LeagueInvite.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Accept a pending invite (the backend requires one; 404 otherwise).
  Future<void> acceptInvite(String leagueId) => _api.post('$_p/$leagueId/join');

  // Invite links (/c/<code>) go through InvitesApi, which routes by code prefix.
}
