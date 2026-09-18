import 'dart:async';
import 'dart:convert';

import '../config.dart';
import 'api_client.dart';

class ConversationUser {
  ConversationUser({required this.id, required this.displayName, this.avatarKey});
  final String id;
  final String displayName;
  final String? avatarKey;

  factory ConversationUser.fromJson(Map<String, dynamic> j) =>
      ConversationUser(id: '${j['id']}', displayName: (j['display_name'] ?? '') as String, avatarKey: j['avatar_key'] as String?);
}

class ChatMessage {
  ChatMessage({
    required this.id,
    required this.conversationId,
    required this.authorId,
    required this.body,
    required this.createdAt,
    this.authorName,
    this.readAt,
    this.editedAt,
    this.deleted = false,
  });
  final String id;
  final String conversationId;
  final String authorId;
  final String? authorName;
  final String body;
  final String createdAt;
  final String? readAt;
  final String? editedAt;
  final bool deleted;

  ChatMessage withReadAt(String? at) => ChatMessage(
      id: id, conversationId: conversationId, authorId: authorId, body: body, createdAt: createdAt,
      authorName: authorName, readAt: at ?? readAt, editedAt: editedAt, deleted: deleted);

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: '${j['id']}',
        conversationId: '${j['conversation_id']}',
        authorId: '${j['author_id']}',
        authorName: j['author_name'] as String?,
        body: (j['body'] ?? '') as String,
        createdAt: (j['created_at'] ?? '') as String,
        readAt: j['read_at'] as String?,
        editedAt: j['edited_at'] as String?,
        deleted: (j['deleted'] ?? false) as bool,
      );
}

class Conversation {
  Conversation({required this.id, required this.type, required this.createdAt, this.leagueId, this.unreadCount = 0, this.lastMessage, this.otherUser});
  final String id;
  final String type; // direct | league
  final String? leagueId;
  final String createdAt;
  final int unreadCount;
  final ChatMessage? lastMessage;
  final ConversationUser? otherUser;

  factory Conversation.fromJson(Map<String, dynamic> j) => Conversation(
        id: '${j['id']}',
        type: (j['type'] ?? 'direct') as String,
        leagueId: j['league_id'] as String?,
        createdAt: (j['created_at'] ?? '') as String,
        unreadCount: (j['unread_count'] as int?) ?? 0,
        lastMessage: j['last_message'] is Map ? ChatMessage.fromJson((j['last_message'] as Map).cast<String, dynamic>()) : null,
        otherUser: j['other_user'] is Map ? ConversationUser.fromJson((j['other_user'] as Map).cast<String, dynamic>()) : null,
      );

  /// The chat's title: the league's name, the other person, or a fallback
  /// (web messages/helpers.ts conversationTitle).
  String title(Map<String, String> leagueNames) {
    if (type == 'league' && leagueId != null) return leagueNames[leagueId] ?? 'League chat';
    if ((otherUser?.displayName ?? '').isNotEmpty) return otherUser!.displayName;
    final author = lastMessage?.authorName;
    return author != null ? 'Chat with $author' : 'Direct message';
  }
}

/// One event from a thread's live stream.
class ThreadEvent {
  ThreadEvent(this.event, this.data);
  final String event; // connected | message | typing | messages_read | message_updated | message_deleted
  final Map<String, dynamic> data;
}

/// Messaging service client (`/v1/social/messaging`). Mirrors web/lib/messaging.ts.
class MessagingApi {
  MessagingApi(this._api);
  final ApiClient _api;
  String get _p => Config.messaging;

  Future<int> unreadCount() async {
    final res = await _api.get('$_p/conversations/unread-count');
    return (res['total'] as int?) ?? 0;
  }

  Future<List<Conversation>> conversations() async {
    final res = await _api.get('$_p/conversations');
    return [for (final c in (res['conversations'] as List<dynamic>?) ?? const []) Conversation.fromJson(c as Map<String, dynamic>)];
  }

  Future<Conversation> openDirect(String userId) async =>
      Conversation.fromJson((await _api.post('$_p/conversations', body: {'type': 'direct', 'user_id': userId}))['conversation']
          as Map<String, dynamic>);

  Future<Conversation> openLeague(String leagueId) async =>
      Conversation.fromJson((await _api.post('$_p/conversations', body: {'type': 'league', 'league_id': leagueId}))['conversation']
          as Map<String, dynamic>);

  Future<List<ChatMessage>> messages(String conversationId, {int limit = 50}) async {
    final res = await _api.get('$_p/conversations/$conversationId/messages?limit=$limit');
    return [for (final m in (res['messages'] as List<dynamic>?) ?? const []) ChatMessage.fromJson(m as Map<String, dynamic>)];
  }

  Future<ChatMessage> send(String conversationId, String body) async =>
      ChatMessage.fromJson((await _api.post('$_p/conversations/$conversationId/messages', body: {'body': body}))['message']
          as Map<String, dynamic>);

  Future<void> markRead(String conversationId) => _api.post('$_p/conversations/$conversationId/read');

  Future<void> sendTyping(String conversationId, bool typing) =>
      _api.post('$_p/conversations/$conversationId/typing', body: {'typing': typing});

  /// A thread's live events. Reconnects by itself: after a dropped or ended
  /// stream (the server closes each after 10 min) and after a 401 / 503 (the
  /// session is refreshed on reconnect), with backoff. [onReconnect] fires when
  /// a reopened stream is live, so the caller can refetch what it missed.
  /// Cancel the subscription to stop.
  Stream<ThreadEvent> thread(String conversationId, {required void Function() onReconnect}) {
    late StreamController<ThreadEvent> out;
    var stopped = false;
    var everConnected = false;
    var delay = const Duration(seconds: 1);
    StreamSubscription<String>? lines;

    Future<void> connect() async {
      while (!stopped) {
        try {
          final res = await _api.openStream('$_p/conversations/$conversationId/stream');
          final done = Completer<void>();
          var data = StringBuffer();
          lines = res.stream.transform(utf8.decoder).transform(const LineSplitter()).listen(
            (line) {
              if (line.isEmpty) {
                // A blank line ends an event.
                final raw = data.toString();
                data = StringBuffer();
                if (raw.isEmpty) return;
                try {
                  final json = jsonDecode(raw) as Map<String, dynamic>;
                  final ev = (json['event'] ?? '') as String;
                  if (ev == 'connected') {
                    delay = const Duration(seconds: 1);
                    if (everConnected) onReconnect();
                    everConnected = true;
                  } else if (!out.isClosed) {
                    out.add(ThreadEvent(ev, json));
                  }
                } on FormatException {
                  // ignore malformed payloads
                }
              } else if (line.startsWith('data:')) {
                data.write(line.substring(5).trimLeft());
              }
            },
            onDone: () => done.isCompleted ? null : done.complete(),
            onError: (_) => done.isCompleted ? null : done.complete(),
            cancelOnError: true,
          );
          await done.future;
        } on SessionExpired {
          break; // signed out: the app routes to login
        } catch (_) {
          // network error / 503 busy — back off and retry
        }
        if (stopped) break;
        await Future<void>.delayed(delay);
        delay = delay * 2 > const Duration(seconds: 30) ? const Duration(seconds: 30) : delay * 2;
      }
    }

    out = StreamController<ThreadEvent>(
      onListen: connect,
      onCancel: () async {
        stopped = true;
        await lines?.cancel();
      },
    );
    return out.stream;
  }
}
