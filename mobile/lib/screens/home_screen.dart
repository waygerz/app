import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/messaging_api.dart';
import '../api/notifications_api.dart';
import '../app_nav.dart';
import '../auth/auth_controller.dart';
import '../push/push_service.dart';
import '../shell/app_header.dart';
import '../shell/bottom_nav.dart';
import '../ui/ui.dart';
import 'bets_screen.dart';
import 'leagues_screen.dart';
import 'messages_screen.dart';
import 'notifications_screen.dart';

/// The signed-in app shell, matching the webui on a phone: the dark top header
/// with the page title, and the bottom nav (Leagues · Bets · Alerts · Messages ·
/// Profile) with unread badges. Profile opens a sheet rather than a tab, as the
/// web's ProfileMenu does.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const _titles = ['My Leagues', 'My Bets', 'Notifications', 'Messages'];

  int _alerts = 0;
  int _messages = 0;
  Timer? _poll;

  // Created once per State (not per build) on the shared ApiClient owned by
  // AuthController, so rebuilds don't churn API objects.
  late final NotificationsApi _notifications;
  late final MessagingApi _messaging;
  late final PushService _push;
  late final AppNav _nav;
  final _messagesKey = GlobalKey<MessagesScreenState>();
  late final void Function() _removeSignOutHook;

  @override
  void initState() {
    super.initState();
    final api = context.read<AuthController>().api;
    _notifications = NotificationsApi(api);
    _messaging = MessagingApi(api);
    _push = PushService(_notifications);
    _nav = context.read<AppNav>();
    // Stop pushes to this device for this account before signing out.
    _removeSignOutHook = context.read<AuthController>().onBeforeSignOut(_push.unregister);
    // Signed in: open any link that arrived while signed out, and start push.
    _nav.attach(api);
    _push.register(
      onOpen: _nav.open,
      onForeground: (title, body) {
        _refreshBadges();
        if (mounted && title.isNotEmpty) Toaster.of(context).info(body.isEmpty ? title : '$title — $body');
      },
    );
    _refreshBadges();
    // The web polls both counts every 60s.
    _poll = Timer.periodic(const Duration(seconds: 60), (_) => _refreshBadges());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _nav.attach(null);
    _removeSignOutHook();
    super.dispose();
  }

  Future<void> _refreshBadges() async {
    final results = await Future.wait<int?>([
      _notifications.unreadCount().then<int?>((v) => v).catchError((_) => null),
      _messaging.unreadCount().then<int?>((v) => v).catchError((_) => null),
    ]);
    if (!mounted) return;
    setState(() {
      _alerts = results[0] ?? _alerts;
      _messages = results[1] ?? _messages;
    });
  }

  void _onTap(int i) {
    _nav.selectTab(i);
    if (i == AppNav.tabMessages) _messagesKey.currentState?.reload();
    _refreshBadges();
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final tab = context.watch<AppNav>().tab;

    final tabs = <Widget>[
      LeaguesScreen(api: auth.api),
      BetsScreen(api: auth.api),
      NotificationsScreen(api: auth.api, onChanged: _refreshBadges),
      MessagesScreen(key: _messagesKey, api: auth.api, onChanged: _refreshBadges),
    ];

    return Scaffold(
      appBar: WaygerzHeader.page(_titles[tab]),
      body: IndexedStack(index: tab, children: tabs),
      bottomNavigationBar: WaygerzBottomNav(
        index: tab,
        onTap: _onTap,
        items: [
          const NavItem(label: 'Leagues', icon: WaygerzBottomNav.leagues),
          const NavItem(label: 'Bets', icon: WaygerzBottomNav.bets),
          NavItem(label: 'Alerts', icon: WaygerzBottomNav.alerts, badge: _alerts),
          NavItem(label: 'Messages', icon: WaygerzBottomNav.messages, badge: _messages),
        ],
      ),
    );
  }
}
