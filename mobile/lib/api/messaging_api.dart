import '../config.dart';
import 'api_client.dart';

/// Messaging service client. Only the unread count for now (the tab badge);
/// conversations and threads come with the Messages screen.
class MessagingApi {
  MessagingApi(this._api);
  final ApiClient _api;

  Future<int> unreadCount() async {
    final res = await _api.get('${Config.messaging}/conversations/unread-count');
    return (res['total'] as int?) ?? 0;
  }
}
