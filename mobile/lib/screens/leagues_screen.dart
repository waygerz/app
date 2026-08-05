import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../api/leagues_api.dart';
import '../models.dart';
import 'league_detail_screen.dart';
import 'widgets.dart';

/// The caller's leagues — Pick'em and H2H — with a tap-through to detail.
class LeaguesScreen extends StatefulWidget {
  const LeaguesScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<LeaguesScreen> createState() => _LeaguesScreenState();
}

class _LeaguesScreenState extends State<LeaguesScreen> {
  late final LeaguesApi _leagues = LeaguesApi(widget.api);
  late Future<List<League>> _future = _leagues.myLeagues();

  Future<void> _reload() async {
    final f = _leagues.myLeagues();
    setState(() => _future = f);
    await f;
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _reload,
      child: FutureBuilder<List<League>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return ErrorState(message: '${snap.error}', onRetry: _reload);
          }
          final leagues = snap.data ?? const <League>[];
          if (leagues.isEmpty) {
            return ListView(children: const [
              SizedBox(height: 120),
              EmptyState(icon: Icons.emoji_events_outlined, label: 'No leagues yet'),
            ]);
          }
          return ListView.separated(
            itemCount: leagues.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, i) => _LeagueTile(api: widget.api, league: leagues[i]),
          );
        },
      ),
    );
  }
}

class _LeagueTile extends StatelessWidget {
  const _LeagueTile({required this.api, required this.league});
  final ApiClient api;
  final League league;

  @override
  Widget build(BuildContext context) {
    final subtitle = [
      league.isMoney ? 'Head-to-Head' : "Pick'em",
      '${league.memberCount} member${league.memberCount == 1 ? '' : 's'}',
    ].join(' · ');
    return ListTile(
      leading: LeagueAvatar(name: league.name),
      title: Text(league.name, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(subtitle),
      trailing: league.isDraft
          ? const Chip(label: Text('Draft'), visualDensity: VisualDensity.compact)
          : const Icon(Icons.chevron_right),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => LeagueDetailScreen(api: api, league: league)),
      ),
    );
  }
}
