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

  Future<League> activate(String id) async {
    final res = await _api.post('$_p/$id/activate');
    return League.fromJson(res['league'] as Map<String, dynamic>);
  }

  Future<List<LeaguePeriod>> periods(String id) async {
    final res = await _api.get('$_p/$id/periods');
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

  Future<List<League>> invites() async {
    final res = await _api.get('$_p/invites');
    final list = (res['invites'] as List<dynamic>? ?? []);
    return list.map((e) => League.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> acceptInvite(String leagueId) => _api.post('$_p/$leagueId/join');

  /// Preview a `/c/<code>` invite link (JWT-optional on the backend).
  Future<Map<String, dynamic>> resolveCode(String code) => _api.get('$_p/c/$code');

  /// Act on a `/c/<code>` link — e.g. `{action: "join"}`.
  Future<Map<String, dynamic>> actOnCode(String code, String action) =>
      _api.post('$_p/c/$code/act', body: {'action': action});
}
