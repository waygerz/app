import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/notifications_api.dart';
import '../auth/auth_controller.dart';
import '../models.dart';
import 'notifications_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final notifications = NotificationsApi(auth.api);

    final tabs = <Widget>[
      const _Placeholder(icon: Icons.emoji_events_outlined, label: 'Leagues & bets go here'),
      NotificationsScreen(api: notifications),
      _ProfileTab(user: auth.user, onLogout: auth.logout),
    ];

    const titles = ['Leagues', 'Notifications', 'Profile'];
    return Scaffold(
      appBar: AppBar(title: Text(titles[_tab])),
      body: IndexedStack(index: _tab, children: tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.sports_basketball_outlined), label: 'Leagues'),
          NavigationDestination(icon: Icon(Icons.notifications_outlined), label: 'Alerts'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile'),
        ],
      ),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 48, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Text(label, style: Theme.of(context).textTheme.bodyMedium),
        ],
      ),
    );
  }
}

class _ProfileTab extends StatelessWidget {
  const _ProfileTab({required this.user, required this.onLogout});
  final User? user;
  final Future<void> Function() onLogout;

  @override
  Widget build(BuildContext context) {
    final u = user;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircleAvatar(radius: 36, child: Icon(Icons.person, size: 36)),
          const SizedBox(height: 12),
          Text(u?.displayName ?? 'You', style: Theme.of(context).textTheme.titleLarge),
          if (u != null && u.phone.isNotEmpty)
            Text(u.phone, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: onLogout,
            icon: const Icon(Icons.logout),
            label: const Text('Log out'),
          ),
        ],
      ),
    );
  }
}
