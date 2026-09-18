import '../config.dart';
import 'api_client.dart';

/// A pending friend request (`GET /friends/requests`).
class FriendRequest {
  FriendRequest({required this.id, required this.userId, required this.displayName, this.avatarKey});
  final String id;
  final String userId;
  final String displayName;
  final String? avatarKey;

  factory FriendRequest.fromJson(Map<String, dynamic> j) => FriendRequest(
        id: '${j['id']}',
        userId: '${j['user_id']}',
        displayName: (j['display_name'] ?? '') as String,
        avatarKey: j['avatar_key'] as String?,
      );
}

/// Client for the friends service (`/v1/social/friends`). Mirrors web/lib/friends.ts.
class FriendsApi {
  FriendsApi(this._api);
  final ApiClient _api;
  String get _p => Config.friends;

  Future<({List<FriendRequest> incoming, List<FriendRequest> outgoing})> requests() async {
    final res = await _api.get('$_p/requests');
    List<FriendRequest> parse(Object? v) => ((v as List<dynamic>?) ?? const [])
        .map((e) => FriendRequest.fromJson(e as Map<String, dynamic>))
        .toList();
    return (incoming: parse(res['incoming']), outgoing: parse(res['outgoing']));
  }

  Future<void> accept(String requestId) => _api.post('$_p/requests/$requestId/accept');
  Future<void> decline(String requestId) => _api.post('$_p/requests/$requestId/decline');
}
