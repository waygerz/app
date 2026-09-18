import '../config.dart';
import '../models.dart';
import 'api_client.dart';

class NotificationsApi {
  NotificationsApi(this._api);
  final ApiClient _api;

  /// The feed plus the unread total (one call, like the web).
  Future<({List<FeedNotification> items, int unread})> feed({int limit = 50}) async {
    final res = await _api.get(withQuery('${Config.notifications}/me', {'limit': limit}));
    final list = (res['notifications'] as List<dynamic>? ?? []);
    return (
      items: list.map((e) => FeedNotification.fromJson(e as Map<String, dynamic>)).toList(),
      unread: (res['unread'] as int?) ?? 0,
    );
  }

  /// Log a genuine in-app open (engagement tracking). Fire-and-forget.
  Future<void> recordOpen(String id) => _api.post('${Config.notifications}/me/opened', body: {'id': id});

  Future<int> unreadCount() async {
    final res = await _api.get('${Config.notifications}/me/unread-count');
    return (res['unread'] as int?) ?? 0;
  }

  Future<void> markRead({List<String>? ids}) =>
      _api.post('${Config.notifications}/me/read', body: {'ids': ids});

  /// The per-(category, channel) preference matrix, incl. the `push` channel.
  Future<Map<String, dynamic>> preferences() =>
      _api.get('${Config.notifications}/me/preferences');

  Future<Map<String, dynamic>> updatePreferences(Map<String, dynamic> patch) =>
      _api.put('${Config.notifications}/me/preferences', body: patch);

  /// Register this device's push token (FCM). Call after obtaining the token.
  Future<void> registerDevice(String platform, String token) =>
      _api.post('${Config.notifications}/me/devices', body: {'platform': platform, 'token': token});

  Future<void> unregisterDevice(String token) =>
      _api.delete('${Config.notifications}/me/devices', body: {'token': token});
}
