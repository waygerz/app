import '../config.dart';
import '../models.dart';
import 'api_client.dart';

/// Game lookups from the ingestor's cache (no provider quota). Mirrors
/// web/lib/ingestor.ts `fetchEvent`.
class EventsApi {
  EventsApi(this._api);
  final ApiClient _api;

  /// One game by its external id; null when the ingestor doesn't know it.
  Future<SportEvent?> event(String externalId) async {
    try {
      final res = await _api.get('${Config.ingestor}/events/${Uri.encodeComponent(externalId)}');
      final ev = res['event'];
      return ev is Map<String, dynamic> ? SportEvent.fromJson(ev) : null;
    } on ApiException catch (e) {
      if (e.statusCode == 404) return null;
      rethrow;
    }
  }

  /// Not-yet-started games for one sport-league, soonest first. Fetched per
  /// sport so a daily sport can't crowd out the others (web useScheduled).
  Future<List<SportEvent>> upcoming(String sportLeagueId, {int limit = 400}) async {
    final res = await _api.get(withQuery('${Config.ingestor}/events', {
      'status': 'scheduled',
      'limit': limit,
      'starts_after': DateTime.now().toUtc().toIso8601String(),
      'sport_league_id': sportLeagueId,
    }));
    return _list(res);
  }

  /// Every game in a league period's window (any status, so a finished week
  /// still shows results), scoped to the league's sport-leagues.
  Future<List<SportEvent>> inWindow(List<String> sportLeagueIds, String? startsAt, String? endsAt) async {
    final res = await _api.get(withQuery('${Config.ingestor}/events', {
      'limit': 250,
      if (sportLeagueIds.isNotEmpty) 'sport_league_id': sportLeagueIds.join(','),
      'starts_after': startsAt,
      'starts_before': endsAt,
    }));
    return _list(res);
  }

  /// Lines for one game on demand (quota-guarded by the ingestor).
  Future<EventOdds?> odds(SportEvent ev) async {
    final res = await _api.get(
        '${Config.ingestor}/sports/${ev.sport}/leagues/${ev.league}/events/${Uri.encodeComponent(ev.externalId)}/odds');
    final o = res['odds'];
    return o is Map<String, dynamic> ? EventOdds.fromJson(o) : null;
  }

  static List<SportEvent> _list(Map<String, dynamic> res) => ((res['events'] as List<dynamic>?) ?? const [])
      .map((e) => SportEvent.fromJson(e as Map<String, dynamic>))
      .toList();

  /// Several games at once, keyed by external id (unknown ones are absent).
  Future<Map<String, SportEvent>> events(Iterable<String> ids) async {
    final unique = ids.where((i) => i.isNotEmpty).toSet().toList();
    final found = await Future.wait(unique.map((id) => event(id).catchError((_) => null)));
    return {for (final ev in found.whereType<SportEvent>()) ev.externalId: ev};
  }
}
