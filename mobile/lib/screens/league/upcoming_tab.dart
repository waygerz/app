import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../api/events_api.dart';
import '../../auth/auth_controller.dart';
import '../../format.dart';
import '../../models.dart';
import '../../theme/app_theme.dart';
import '../../ui/ui.dart';
import '../../wagers.dart';
import '../../widgets/bet_sheet.dart';
import '../widgets.dart';

enum _Range { today, week }

/// Head-to-head "Upcoming" (web _sections/upcoming.tsx): not-yet-started games
/// across the league's sports — Today or the next 7 days, filterable by sport —
/// as matchup cards. Tap a game to bet on it.
class UpcomingTab extends StatefulWidget {
  const UpcomingTab({super.key, required this.api, required this.league, required this.header, required this.onBetSent});
  final ApiClient api;
  final League league;
  final List<Widget> header;

  /// After a bet goes out (the league switches to My Bets).
  final VoidCallback onBetSent;

  @override
  State<UpcomingTab> createState() => _UpcomingTabState();
}

class _UpcomingTabState extends State<UpcomingTab> {
  late final EventsApi _events = EventsApi(widget.api);
  late Future<List<SportEvent>> _future = _load();
  _Range _range = _Range.today;
  String _sport = 'all';

  /// Each sport-league's own upcoming games, merged, so a daily sport can't
  /// crowd out one whose next game is weeks away (web useScheduled).
  Future<List<SportEvent>> _load() async {
    final lists = await Future.wait([for (final s in widget.league.sports) _events.upcoming(s.id)]);
    return lists.expand((l) => l).toList();
  }

  Future<void> _reload() async {
    final f = _load();
    setState(() => _future = f);
    await f;
  }

  /// Not started, and either today or within 7 days, soonest first. The web
  /// decides "today" in the league's timezone; the app uses the phone's.
  List<SportEvent> _inRange(List<SportEvent> all) {
    final now = DateTime.now();
    final weekEnd = now.add(const Duration(days: 7));
    final out = all.where((e) {
      final t = DateTime.tryParse(e.startTime ?? '')?.toLocal();
      if (t == null || !t.isAfter(now)) return false;
      return _range == _Range.today
          ? (t.year == now.year && t.month == now.month && t.day == now.day)
          : !t.isAfter(weekEnd);
    }).toList();
    out.sort((a, b) => (a.startTime ?? '').compareTo(b.startTime ?? ''));
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final me = context.read<AuthController>().user?.id ?? '';
    final canBet = widget.league.isActive;
    final names = {for (final s in widget.league.sports) s.id: s.name.isEmpty ? s.id : s.name};

    return RefreshIndicator(
      onRefresh: _reload,
      child: FutureBuilder<List<SportEvent>>(
        future: _future,
        builder: (context, snap) {
          final inRange = _inRange(snap.data ?? const []);
          // Sport pills only for sports playing in the range, soonest first.
          final sports = <String>[];
          for (final e in inRange) {
            final id = e.sportLeagueId ?? '';
            if (id.isNotEmpty && !sports.contains(id)) sports.add(id);
          }
          final active = _sport != 'all' && sports.contains(_sport) ? _sport : 'all';
          final shown = active == 'all' ? inRange : inRange.where((e) => e.sportLeagueId == active).toList();

          return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [
            ...widget.header,
            Align(
              alignment: Alignment.centerLeft,
              child: WzSegmented<_Range>(
                options: const [(value: _Range.today, label: 'Today'), (value: _Range.week, label: 'This week')],
                value: _range,
                onChanged: (r) => setState(() => _range = r),
              ),
            ),
            const SizedBox(height: 12),
            if (sports.length > 1) ...[
              PillTabs<String>(
                tabs: [const PillTab('all', 'All'), for (final id in sports) PillTab(id, names[id] ?? id)],
                value: active,
                onChanged: (v) => setState(() => _sport = v),
              ),
              const SizedBox(height: 12),
            ],
            if (snap.data == null && snap.connectionState == ConnectionState.waiting)
              ...List.generate(3, (_) => const Padding(
                    padding: EdgeInsets.only(bottom: 12),
                    child: Skeleton(height: 112, radius: WaygerzRadius.xl),
                  ))
            else if (snap.hasError)
              ErrorCard(title: "Couldn't load the schedule", error: snap.error, onRetry: _reload)
            else if (shown.isEmpty)
              Text(
                _range == _Range.today ? 'No more games today. Try “This week”.' : 'No games in the next 7 days.',
                style: TextStyle(fontSize: 14, color: c.mutedForeground),
              )
            else
              ScheduleBoard(
                events: shown,
                onSelect: canBet
                    ? (ev) async {
                        final sent = await showBetSheet(context, api: widget.api, league: widget.league, event: ev, me: me);
                        if (sent) widget.onBetSent();
                      }
                    : null,
              ),
          ]);
        },
      ),
    );
  }
}

/// The schedule (web components/event-card.tsx ScheduleBoard): one matchup
/// card per game. The whole card opens the bet sheet, where you pick a side, so
/// the lines are plain muted text — not boxes that look like separate picks.
class ScheduleBoard extends StatelessWidget {
  const ScheduleBoard({super.key, required this.events, this.onSelect});
  final List<SportEvent> events;
  final ValueChanged<SportEvent>? onSelect;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (final (i, ev) in events.indexed) ...[
        if (i > 0) const SizedBox(height: 12),
        _card(c, ev),
      ],
    ]);
  }

  Widget _card(WaygerzColors c, SportEvent ev) {
    final sp = ev.odds?.spreadLine;
    final ou = ev.odds?.total;
    String signed(double v) => '${v > 0 ? '+' : ''}${formatLine(v)}';
    const tabular = [FontFeature.tabularFigures()];

    Widget team(String name, String? abbr, String? logo, String? line) => Row(children: [
          TeamLogo(name: name, abbreviation: abbr ?? '', logo: logo, size: 24),
          const SizedBox(width: 10),
          Expanded(
            child: Text(name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
          ),
          if (line != null)
            Text(line, style: TextStyle(fontSize: 14, color: c.mutedForeground, fontFeatures: tabular)),
        ]);

    final footer = ou != null ? 'O/U ${formatLine(ou)}' : sp != null ? '' : 'Lines not posted';
    final radius = BorderRadius.circular(WaygerzRadius.xl);
    final content = Padding(
      padding: const EdgeInsets.all(12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(formatStart(ev.startTime), style: TextStyle(fontSize: 12, color: c.mutedForeground)),
        const SizedBox(height: 8),
        team(ev.awayTeam, ev.awayAbbr, ev.awayLogo, sp == null ? null : signed(-sp)),
        const SizedBox(height: 8),
        team(ev.homeTeam, ev.homeAbbr, ev.homeLogo, sp == null ? null : signed(sp)),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.only(top: 8),
          decoration: BoxDecoration(border: Border(top: BorderSide(color: c.border))),
          child: Row(children: [
            Expanded(
              child: Text(footer, style: TextStyle(fontSize: 12, color: c.mutedForeground, fontFeatures: tabular)),
            ),
            if (onSelect != null)
              ExcludeSemantics(
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Text('Bet', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.primary)),
                  Icon(LucideIcons.chevronRight, size: 16, color: c.primary),
                ]),
              ),
          ]),
        ),
      ]),
    );
    return Material(
      color: c.card,
      shape: RoundedRectangleBorder(borderRadius: radius, side: BorderSide(color: c.border)),
      clipBehavior: Clip.antiAlias,
      child: onSelect == null
          ? content
          : Semantics(
              button: true,
              label: 'Bet on ${ev.awayTeam} at ${ev.homeTeam}',
              child: InkWell(onTap: () => onSelect!(ev), child: content),
            ),
    );
  }
}
