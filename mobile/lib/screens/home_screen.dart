import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../api/messaging_api.dart';
import '../api/notifications_api.dart';
import '../app_nav.dart';
import '../auth/auth_controller.dart';
import '../models.dart';
import '../push/push_service.dart';
import '../shell/app_header.dart';
import '../shell/bottom_nav.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import 'account/account_screen.dart';
import 'bets_screen.dart';
import 'leagues_screen.dart';
import 'notifications_screen.dart';
import 'widgets.dart';

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

  @override
  void initState() {
    super.initState();
    final api = context.read<AuthController>().api;
    _notifications = NotificationsApi(api);
    _messaging = MessagingApi(api);
    _push = PushService(_notifications);
    _nav = context.read<AppNav>();
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
    if (i == 4) {
      _openProfile();
      return;
    }
    _nav.selectTab(i);
    _refreshBadges();
  }

  void _openProfile() {
    final auth = context.read<AuthController>();
    showModalBottomSheet<void>(
      context: context,
      builder: (_) => _ProfileSheet(
        user: auth.user,
        onLogout: () async {
          await _push.unregister(); // no more pushes to this device for this account
          await auth.logout();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final user = auth.user;
    final tab = context.watch<AppNav>().tab;

    final tabs = <Widget>[
      LeaguesScreen(api: auth.api),
      BetsScreen(api: auth.api),
      NotificationsScreen(api: auth.api, onChanged: _refreshBadges),
      const _MessagesPlaceholder(),
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
          NavItem(
            label: 'Profile',
            avatar: UserAvatar(userId: user?.id ?? '', name: user?.displayName ?? '?', avatarKey: user?.avatarKey, size: 24),
          ),
        ],
      ),
    );
  }
}

class _MessagesPlaceholder extends StatelessWidget {
  const _MessagesPlaceholder();

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [
      CenterCard(children: [
        Icon(LucideIcons.messageCircle, size: 24, color: c.mutedForeground),
        Text('Messages are coming to the app soon.\nUse waygerz.com to chat for now.',
            textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
      ]),
    ]);
  }
}

class _ProfileSheet extends StatelessWidget {
  const _ProfileSheet({required this.user, required this.onLogout});
  final User? user;
  final Future<void> Function() onLogout;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final u = user;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(children: [
              UserAvatar(userId: u?.id ?? '', name: u?.displayName ?? '?', avatarKey: u?.avatarKey, size: 48),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(u?.displayName ?? 'You',
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                  if (u != null && u.phone.isNotEmpty)
                    Text(u.phone, style: TextStyle(fontSize: 13, color: c.mutedForeground)),
                ]),
              ),
            ]),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: () {
                final nav = Navigator.of(context);
                nav.pop();
                nav.push(MaterialPageRoute<void>(builder: (_) => const AccountScreen()));
              },
              icon: const Icon(LucideIcons.settings, size: 16),
              label: const Text('Account'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () {
                Navigator.of(context).pop();
                onLogout();
              },
              icon: const Icon(LucideIcons.logOut, size: 16),
              label: const Text('Log out'),
            ),
          ],
        ),
      ),
    );
  }
}
