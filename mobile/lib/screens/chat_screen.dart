import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../api/events_api.dart';
import '../api/messaging_api.dart';
import '../api/wagers_api.dart';
import '../auth/auth_controller.dart';
import '../format.dart';
import '../models.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import 'widgets.dart';

/// Group-chat sender name colors (web messages/helpers.ts senderColor).
const _nameColors = [
  Color(0xFFA78BFA), Color(0xFFF472B6), Color(0xFF2DD4BF), Color(0xFFFBBF24),
  Color(0xFF38BDF8), Color(0xFF34D399), Color(0xFFE879F9), Color(0xFFFB923C),
];

Color _senderColor(String id) {
  var h = 0;
  for (final u in id.codeUnits) {
    h = (h * 31 + u) & 0xFFFFFFFF;
  }
  return _nameColors[h % _nameColors.length];
}

/// One chat (web messages/[conversationId]/page.tsx): day dividers, bubbles
/// (sender names in league chats, read ticks in DMs), a typing indicator,
/// live updates over the thread stream, the scores of this pair's active bets,
/// and quick openers on an empty DM.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.api, required this.conversation, required this.title});
  final ApiClient api;
  final Conversation conversation;
  final String title;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  late final MessagingApi _messaging = MessagingApi(widget.api);
  final _draft = TextEditingController();
  final _scroll = ScrollController();
  List<ChatMessage>? _messages;
  Object? _error;
  String? _typing;
  Timer? _typingStop;
  Timer? _typingSend;
  StreamSubscription<ThreadEvent>? _live;
  List<SportEvent> _scores = [];
  bool _sending = false;

  Conversation get conv => widget.conversation;
  bool get _isLeague => conv.type == 'league' && conv.leagueId != null;
  String get _me => context.read<AuthController>().user?.id ?? '';

  @override
  void initState() {
    super.initState();
    _draft.addListener(() => setState(() {}));
    _load();
    _messaging.markRead(conv.id).catchError((_) {});
    _live = _messaging.thread(conv.id, onReconnect: _load).listen(_onEvent);
    _loadScores();
  }

  @override
  void dispose() {
    _live?.cancel();
    _typingStop?.cancel();
    _typingSend?.cancel();
    _messaging.sendTyping(conv.id, false).catchError((_) {});
    _draft.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final list = await _messaging.messages(conv.id);
      if (!mounted) return;
      setState(() {
        _messages = list;
        _error = null;
      });
      _toBottom();
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  /// Scores for every game this pair has an open or accepted bet on (DMs).
  Future<void> _loadScores() async {
    final other = conv.type == 'direct' ? conv.otherUser?.id : null;
    if (other == null) return;
    try {
      final me = _me;
      final bets = await WagersApi(widget.api).mine();
      final ids = {
        for (final w in bets)
          if ((w.status == 'open' || w.status == 'accepted') && (w.proposerId == me ? w.acceptorId : w.proposerId) == other) w.eventId,
      };
      final events = await EventsApi(widget.api).events(ids);
      if (mounted) setState(() => _scores = events.values.where((e) => e.status != 'cancelled').toList());
    } catch (_) {/* score strip is optional */}
  }

  void _onEvent(ThreadEvent ev) {
    final d = ev.data;
    final list = [...?_messages];
    switch (ev.event) {
      case 'message' when d['message'] is Map:
        final m = ChatMessage.fromJson((d['message'] as Map).cast<String, dynamic>());
        if (list.every((x) => x.id != m.id)) list.add(m);
        _messaging.markRead(conv.id).catchError((_) {});
        setState(() {
          _messages = list;
          if (m.authorId != _me) _typing = null;
        });
        _toBottom();
      case 'typing' when '${d['user_id']}' != _me:
        _typingStop?.cancel();
        if (d['typing'] == true) {
          setState(() => _typing = (d['display_name'] as String?) ?? 'Someone');
          _typingStop = Timer(const Duration(seconds: 3), () => mounted ? setState(() => _typing = null) : null);
        } else {
          setState(() => _typing = null);
        }
      case 'messages_read':
        final ids = {for (final id in (d['message_ids'] as List<dynamic>?) ?? const []) '$id'};
        setState(() => _messages = [for (final m in list) ids.contains(m.id) ? m.withReadAt(d['read_at'] as String?) : m]);
      case 'message_updated' || 'message_deleted' when d['message'] is Map:
        final u = ChatMessage.fromJson((d['message'] as Map).cast<String, dynamic>());
        setState(() => _messages = [for (final m in list) m.id == u.id ? u : m]);
    }
  }

  void _toBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  void _onDraftChanged(String value) {
    _typingSend?.cancel();
    _typingSend = Timer(const Duration(milliseconds: 250),
        () => _messaging.sendTyping(conv.id, value.trim().isNotEmpty).catchError((_) {}));
  }

  Future<void> _send([String? text]) async {
    final body = (text ?? _draft.text).trim();
    if (body.isEmpty || _sending) return;
    final toast = Toaster.of(context);
    setState(() => _sending = true);
    try {
      final m = await _messaging.send(conv.id, body);
      if (text == null) _draft.clear();
      final list = [...?_messages];
      if (list.every((x) => x.id != m.id)) list.add(m);
      setState(() => _messages = list);
      _toBottom();
    } catch (e) {
      toast.failure(e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Widget _avatar(double size) => _isLeague
      ? LeagueAvatar(name: widget.title, id: conv.leagueId, size: size)
      : UserAvatar(userId: conv.otherUser?.id ?? conv.id, name: widget.title, avatarKey: conv.otherUser?.avatarKey, size: size);

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(children: [
          _avatar(32),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
              if (_isLeague) const Text('League chat', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w400, color: Colors.white70)),
            ]),
          ),
        ]),
      ),
      body: Column(children: [
        if (_scores.isNotEmpty)
          Container(
            decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.all(8),
              child: Row(children: [for (final e in _scores) Padding(padding: const EdgeInsets.only(right: 8), child: _scoreCard(c, e))]),
            ),
          ),
        Expanded(child: _thread(c)),
        Container(
          decoration: BoxDecoration(border: Border(top: BorderSide(color: c.border))),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(children: [
                Expanded(
                  child: TextField(
                    controller: _draft,
                    onChanged: _onDraftChanged,
                    onSubmitted: (_) => _send(),
                    textInputAction: TextInputAction.send,
                    style: const TextStyle(fontSize: 16),
                    decoration: const InputDecoration(hintText: 'Type a message…'),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  tooltip: 'Send message',
                  onPressed: _sending || _draft.text.trim().isEmpty ? null : _send,
                  icon: const Icon(LucideIcons.send, size: 16),
                ),
              ]),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _thread(WaygerzColors c) {
    if (_messages == null) {
      return Center(
        child: _error != null
            ? Padding(padding: const EdgeInsets.all(16), child: ErrorCard(title: "Couldn't load messages", error: _error, onRetry: _load))
            : Text('Loading messages…', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
      );
    }
    final msgs = _messages!;
    if (msgs.isEmpty) return _emptyThread(c);

    final items = <Widget>[];
    var lastDay = '';
    var lastAuthor = '';
    for (final m in msgs) {
      final day = dayLabel(m.createdAt);
      if (day != lastDay) {
        lastDay = day;
        lastAuthor = '';
        items.add(Center(
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 6),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
            decoration: BoxDecoration(
              color: c.muted.withValues(alpha: 0.5),
              border: Border.all(color: c.border),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(day.toUpperCase(), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w500, letterSpacing: 1, color: c.mutedForeground)),
          ),
        ));
      }
      final mine = m.authorId == _me;
      final showSender = _isLeague && !mine && m.authorId != lastAuthor;
      lastAuthor = mine ? _me : m.authorId;
      items.add(_bubble(c, m, mine: mine, showSender: showSender));
    }
    if (_typing != null) {
      items.add(Align(
        alignment: Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.only(top: 4),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(color: c.muted, border: Border.all(color: c.border), borderRadius: BorderRadius.circular(16)),
          child: Semantics(label: '$_typing is typing', child: Text('•••', style: TextStyle(color: c.mutedForeground))),
        ),
      ));
    }
    return ListView(controller: _scroll, padding: const EdgeInsets.all(16), children: items);
  }

  Widget _bubble(WaygerzColors c, ChatMessage m, {required bool mine, required bool showSender}) {
    final text = m.deleted
        ? Text('Message deleted', style: TextStyle(fontSize: 14, fontStyle: FontStyle.italic, color: c.mutedForeground))
        : Text(m.body, style: TextStyle(fontSize: 14, color: mine ? Theme.of(context).colorScheme.onPrimary : c.foreground));
    const r = Radius.circular(16);
    const tail = Radius.circular(6);

    if (_isLeague && !mine) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 6, right: 40),
        child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          if (showSender) UserAvatar(userId: m.authorId, name: m.authorName ?? 'Member', size: 24) else const SizedBox(width: 24),
          const SizedBox(width: 8),
          Flexible(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (showSender)
                Padding(
                  padding: const EdgeInsets.only(left: 4, bottom: 2),
                  child: Text(m.authorName ?? 'Member', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: _senderColor(m.authorId))),
                ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: c.muted,
                  border: Border.all(color: c.border),
                  borderRadius: const BorderRadius.only(topLeft: r, topRight: r, bottomRight: r, bottomLeft: tail),
                ),
                child: m.editedAt != null && !m.deleted
                    ? Text.rich(TextSpan(children: [
                        TextSpan(text: m.body),
                        TextSpan(text: ' · edited', style: TextStyle(fontSize: 10, color: c.mutedForeground)),
                      ]), style: TextStyle(fontSize: 14, color: c.foreground))
                    : text,
              ),
            ]),
          ),
        ]),
      );
    }

    return Padding(
      padding: EdgeInsets.only(bottom: 6, left: mine ? 60 : 0, right: mine ? 0 : 60),
      child: Column(crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start, children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: mine ? c.primary : c.muted,
            borderRadius: mine
                ? const BorderRadius.only(topLeft: r, topRight: r, bottomLeft: r, bottomRight: tail)
                : const BorderRadius.only(topLeft: r, topRight: r, bottomRight: r, bottomLeft: tail),
          ),
          child: text,
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text('${clockTime(m.createdAt)}${m.editedAt != null && !m.deleted ? ' · edited' : ''}',
                style: TextStyle(fontSize: 10, color: c.mutedForeground)),
            if (mine && m.readAt != null && conv.type == 'direct') ...[
              const SizedBox(width: 4),
              Icon(LucideIcons.checkCheck, size: 12, color: c.primary.withValues(alpha: 0.8), semanticLabel: 'Read'),
            ],
          ]),
        ),
      ]),
    );
  }

  Widget _emptyThread(WaygerzColors c) {
    return ListView(padding: const EdgeInsets.all(24), children: [
      const SizedBox(height: 48),
      Center(child: _avatar(80)),
      const SizedBox(height: 16),
      Text(widget.title, textAlign: TextAlign.center, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: c.foreground)),
      const SizedBox(height: 4),
      Text(
        _isLeague
            ? 'This is the start of the ${widget.title} chat.'
            : "You're connected on Waygerz. Say something to get the trash talk started.",
        textAlign: TextAlign.center,
        style: TextStyle(fontSize: 14, color: c.mutedForeground),
      ),
      if (!_isLeague) ...[
        const SizedBox(height: 16),
        Wrap(alignment: WrapAlignment.center, spacing: 8, runSpacing: 8, children: [
          for (final t in const ['👋 Hey', 'Good luck this week', 'Wanna bet?'])
            ActionChip(label: Text(t), onPressed: _sending ? null : () => _send(t)),
        ]),
      ],
    ]);
  }

  /// One active bet's game: teams + score (or kickoff), live in red.
  Widget _scoreCard(WaygerzColors c, SportEvent e) {
    final started = e.status == 'live' || e.status == 'final';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: c.card, border: Border.all(color: c.border), borderRadius: BorderRadius.circular(WaygerzRadius.lg)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(
          e.status == 'live' ? 'LIVE' : e.status == 'final' ? 'FINAL' : formatStart(e.startTime),
          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: e.status == 'live' ? c.destructive : c.mutedForeground),
        ),
        Text('${e.awayAbbr ?? e.awayTeam}${started ? ' ${e.awayScore ?? ''}' : ''}  ·  ${e.homeAbbr ?? e.homeTeam}${started ? ' ${e.homeScore ?? ''}' : ''}',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.foreground)),
      ]),
    );
  }
}
