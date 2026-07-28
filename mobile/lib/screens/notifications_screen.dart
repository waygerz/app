import 'package:flutter/material.dart';

import '../api/notifications_api.dart';
import '../models.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key, required this.api});
  final NotificationsApi api;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  late Future<List<FeedNotification>> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.api.feed();
  }

  Future<void> _refresh() async {
    final next = widget.api.feed();
    setState(() => _future = next);
    await next;
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      child: FutureBuilder<List<FeedNotification>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return _CenteredMessage(text: 'Couldn’t load notifications.\n${snap.error}');
          }
          final items = snap.data ?? [];
          if (items.isEmpty) {
            return const _CenteredMessage(text: 'No notifications yet.');
          }
          return ListView.separated(
            itemCount: items.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final n = items[i];
              return ListTile(
                leading: Icon(
                  n.read ? Icons.notifications_none : Icons.notifications_active,
                  color: n.read ? null : Theme.of(context).colorScheme.primary,
                ),
                title: Text(n.title),
                subtitle: Text(n.body),
                trailing: Text(_short(n.category),
                    style: Theme.of(context).textTheme.labelSmall),
              );
            },
          );
        },
      ),
    );
  }

  String _short(String category) {
    switch (category) {
      case 'wager_alert':
        return 'WAGER';
      case 'league_invite':
        return 'LEAGUE';
      case 'friend_request':
        return 'FRIEND';
      default:
        return category.toUpperCase();
    }
  }
}

class _CenteredMessage extends StatelessWidget {
  const _CenteredMessage({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    // Wrapped in a scroll view so RefreshIndicator still works when empty.
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 120),
          child: Center(child: Text(text, textAlign: TextAlign.center)),
        ),
      ],
    );
  }
}
