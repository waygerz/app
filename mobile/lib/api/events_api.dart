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

  /// Several games at once, keyed by external id (unknown ones are absent).
  Future<Map<String, SportEvent>> events(Iterable<String> ids) async {
    final unique = ids.where((i) => i.isNotEmpty).toSet().toList();
    final found = await Future.wait(unique.map((id) => event(id).catchError((_) => null)));
    return {for (final ev in found.whereType<SportEvent>()) ev.externalId: ev};
  }
}
