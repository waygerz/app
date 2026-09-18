import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../api/events_api.dart';
import '../../auth/auth_controller.dart';
import '../../models.dart';
import '../../theme/app_theme.dart';
import '../../ui/ui.dart';
import '../../widgets/bet_sheet.dart';
import 'upcoming_tab.dart';

/// Head-to-head Sports (web _sections/sports.tsx): team search, then
/// Upcoming (today, all sports) or one sport's schedule paged a week at a time
/// from its first game. Tap a game to bet on it.
class SportsTab extends StatefulWidget {
  const SportsTab({super.key, required this.api, required this.league, required this.header, required this.onBetSent});
  final ApiClient api;
  final League league;
  final List<Widget> header;
  final VoidCallback onBetSent;

  @override
  State<SportsTab> createState() => _SportsTabState();
}

class _SportsTabState extends State<SportsTab> {
  late final EventsApi _events = EventsApi(widget.api);
  late Future<List<SportEvent>> _future = _load();
  String _tab = 'upcoming';
  int _weeks = 1;
  String _q = '';

  Future<List<SportEvent>> _load() async {
    final lists = await Future.wait([for (final s in widget.league.sports) _events.upcoming(s.id)]);
    return lists.expand((l) => l).toList();
  }

  Future<void> _reload() async {
    final f = _load();
    setState(() => _future = f);
    await f;
  }

  static int _ms(SportEvent e) => DateTime.tryParse(e.startTime ?? '')?.millisecondsSinceEpoch ?? 0;

  bool _matches(SportEvent e, String q) => [e.homeTeam, e.awayTeam, e.homeAbbr, e.awayAbbr, e.name, e.shortName]
      .any((v) => (v ?? '').toLowerCase().contains(q));

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final lg = widget.league;
    final me = context.read<AuthController>().user?.id ?? '';
    final canBet = lg.isActive;

    if (lg.sports.isEmpty) {
      return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [
        ...widget.header,
        CenterCard(children: [
          Icon(LucideIcons.trophy, size: 24, color: c.mutedForeground),
          Text('No sports set for this league yet.', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
        ]),
      ]);
    }

    final sports = [...lg.sports]..sort((a, b) => (a.name.isEmpty ? a.id : a.name).compareTo(b.name.isEmpty ? b.id : b.name));

    return RefreshIndicator(
      onRefresh: _reload,
      child: FutureBuilder<List<SportEvent>>(
        future: _future,
        builder: (context, snap) {
          final evs = snap.data ?? const <SportEvent>[];
          final q = _q.trim().toLowerCase();
          final now = DateTime.now();

          List<SportEvent> base;
          var hasMore = false;
          if (_tab == 'upcoming') {
            // Today's not-yet-started games across every sport (the phone's day).
            base = evs.where((e) {
              final t = DateTime.tryParse(e.startTime ?? '')?.toLocal();
              return t != null && t.isAfter(now) && t.year == now.year && t.month == now.month && t.day == now.day;
            }).toList()
              ..sort((a, b) => _ms(a).compareTo(_ms(b)));
          } else {
            // One sport, paged a week at a time from its first upcoming game.
            final sorted = evs.where((e) => e.sportLeagueId == _tab).toList()..sort((a, b) => _ms(a).compareTo(_ms(b)));
            final end = sorted.isEmpty ? 0 : _ms(sorted.first) + _weeks * 7 * 24 * 3600 * 1000;
            hasMore = q.isEmpty && sorted.any((e) => _ms(e) > end);
            base = q.isEmpty ? sorted.where((e) => _ms(e) <= end).toList() : sorted;
          }
          final shown = q.isEmpty ? base : base.where((e) => _matches(e, q)).toList();

          return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [
            ...widget.header,
            SearchField(hint: 'Search teams', onChanged: (v) => setState(() => _q = v)),
            const SizedBox(height: 16),
            PillTabs<String>(
              tabs: [
                const PillTab('upcoming', 'Upcoming'),
                for (final s in sports) PillTab(s.id, s.name.isEmpty ? s.id : s.name),
              ],
              value: _tab,
              onChanged: (t) => setState(() {
                if (t != _tab) _weeks = 1;
                _tab = t;
              }),
            ),
            const SizedBox(height: 16),
            if (_tab == 'upcoming' && q.isEmpty) ...[
              Text('Today’s games across all your sports${canBet ? ' · tap a game to bet' : ''}.',
                  style: TextStyle(fontSize: 12, color: c.mutedForeground)),
              const SizedBox(height: 16),
            ],
            if (snap.data == null && snap.connectionState == ConnectionState.waiting)
              ...List.generate(4, (_) => const Padding(
                    padding: EdgeInsets.only(bottom: 8),
                    child: Skeleton(height: 64, radius: WaygerzRadius.lg),
                  ))
            else if (snap.hasError)
              ErrorCard(title: "Couldn't load the schedule", error: snap.error, onRetry: _reload)
            else if (shown.isEmpty)
              CenterCard(children: [
                Icon(LucideIcons.calendarDays, size: 24, color: c.mutedForeground),
                Text(
                  q.isNotEmpty
                      ? 'No games match “${_q.trim()}”.'
                      : _tab == 'upcoming'
                          ? 'No more games today. Pick a sport tab for its full schedule.'
                          : 'No upcoming games right now.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 14, color: c.mutedForeground),
                ),
              ])
            else ...[
              ScheduleBoard(
                events: shown,
                onSelect: canBet
                    ? (ev) async {
                        final sent = await showBetSheet(context, api: widget.api, league: lg, event: ev, me: me);
                        if (sent) widget.onBetSent();
                      }
                    : null,
              ),
              if (hasMore) ...[
                const SizedBox(height: 16),
                WzButton(label: 'Show next week', variant: ButtonVariant.outline, expand: true,
                    onPressed: () => setState(() => _weeks++)),
              ],
            ],
          ]);
        },
      ),
    );
  }
}
