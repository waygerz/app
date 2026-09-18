import 'package:flutter/material.dart';

import 'models.dart';
import 'screens/create_league_screen.dart';
import 'screens/invite_screen.dart';
import 'screens/league_detail_screen.dart';
import 'api/api_client.dart';
import 'api/leagues_api.dart';
import 'api/messaging_api.dart';
import 'screens/chat_screen.dart';
import 'screens/friends_screen.dart';

/// App-wide navigation: the shell's bottom-nav tab, and routing of Waygerz
/// links — the same paths the web uses (`/c/<code>`, `/leagues/<id>`,
/// `/bets`, …) — whether they arrive as an Android App Link, a push tap, or
/// from inside the app. A link that arrives while signed out is held and
/// opened after sign-in.
class AppNav extends ChangeNotifier {
  final navigatorKey = GlobalKey<NavigatorState>();

  static const tabLeagues = 0;
  static const tabBets = 1;
  static const tabNotifications = 2;
  static const tabMessages = 3;

  int _tab = tabLeagues;
  int get tab => _tab;

  ApiClient? _api;
  String? _pending;

  /// Set once signed in (HomeScreen); cleared on sign-out.
  void attach(ApiClient? api) {
    _api = api;
    if (api == null) _tab = tabLeagues; // next sign-in starts on Leagues
    if (api != null && _pending != null) {
      final link = _pending!;
      _pending = null;
      // After the shell's first frame, so the navigator is ready.
      WidgetsBinding.instance.addPostFrameCallback((_) => open(link));
    }
  }

  void selectTab(int i) {
    if (i == _tab) return;
    _tab = i;
    notifyListeners();
  }

  /// Route a full URL or a path. Unknown paths land on the leagues tab.
  void open(String link) {
    final api = _api;
    final nav = navigatorKey.currentState;
    if (api == null || nav == null) {
      _pending = link; // signed out (or not built yet): open after sign-in
      return;
    }
    final uri = Uri.tryParse(link);
    final seg = (uri?.pathSegments ?? const <String>[]).where((s) => s.isNotEmpty).toList();
    if (seg.isEmpty) return _home(nav, tabLeagues);

    switch (seg.first) {
      case 'c' when seg.length > 1:
        nav.push(MaterialPageRoute<void>(builder: (_) => InviteScreen(api: api, code: seg[1])));
      case 'leagues' when seg.length > 1 && seg[1] == 'new':
        nav.push(MaterialPageRoute<void>(builder: (_) => CreateLeagueScreen(api: api)));
      case 'leagues' when seg.length > 1:
        // A stub is enough: the detail screen loads the league itself.
        final stub = League(id: seg[1], name: '', leagueType: 'head_to_head', status: 'active');
        nav.push(MaterialPageRoute<void>(builder: (_) => LeagueDetailScreen(api: api, league: stub)));
      case 'friends':
        nav.push(MaterialPageRoute<void>(builder: (_) => FriendsScreen(api: api)));
      case 'messages' when seg.length > 1:
        _openChat(nav, api, seg[1]);
      case 'bets':
        _home(nav, tabBets);
      case 'notifications':
        _home(nav, tabNotifications);
      case 'messages':
        _home(nav, tabMessages);
      default:
        _home(nav, tabLeagues);
    }
  }

  /// A chat link: find the conversation (the list carries its title data).
  Future<void> _openChat(NavigatorState nav, ApiClient api, String id) async {
    try {
      final convs = await MessagingApi(api).conversations();
      final conv = convs.where((c) => c.id == id).firstOrNull;
      if (conv == null) return _home(nav, tabMessages);
      final names = conv.type == 'league'
          ? {for (final l in await LeaguesApi(api).myLeagues().catchError((_) => <League>[])) l.id: l.name}
          : const <String, String>{};
      nav.push(MaterialPageRoute<void>(builder: (_) => ChatScreen(api: api, conversation: conv, title: conv.title(names))));
    } catch (_) {
      _home(nav, tabMessages);
    }
  }

  void _home(NavigatorState nav, int tab) {
    nav.popUntil((r) => r.isFirst);
    selectTab(tab);
  }
}
