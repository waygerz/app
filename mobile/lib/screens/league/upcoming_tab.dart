import 'package:flutter/material.dart';
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
/// as a Winner / Spread / Total board. Tap a game to bet on it.
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

/// The sportsbook board (web components/event-card.tsx ScheduleBoard): a
/// Winner / Spread / Total header, then a row per game — team lines (the
/// straight-up pick), spread and total cells (lines only; Waygerz bets straight
/// up, so no prices), and the kickoff time.
class ScheduleBoard extends StatelessWidget {
  const ScheduleBoard({super.key, required this.events, this.onSelect});
  final List<SportEvent> events;
  final ValueChanged<SportEvent>? onSelect;

  static const _col = 72.0;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    Widget head(String t, {bool fixed = true}) => SizedBox(
          width: fixed ? _col : null,
          child: Text(t,
              textAlign: fixed ? TextAlign.center : TextAlign.left,
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, letterSpacing: 1, color: c.mutedForeground)),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(children: [
          const SizedBox(width: 4),
          Expanded(child: head('WINNER', fixed: false)),
          const SizedBox(width: 8),
          head('SPREAD'),
          const SizedBox(width: 8),
          head('TOTAL'),
        ]),
      ),
      for (final ev in events) _row(c, ev),
    ]);
  }

  Widget _row(WaygerzColors c, SportEvent ev) {
    final sp = ev.odds?.spreadLine;
    final ou = ev.odds?.total;
    String signed(double v) => '${v > 0 ? '+' : ''}${formatLine(v)}';

    Widget cell(String? text) => Container(
          width: _col,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: c.muted.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(WaygerzRadius.md)),
          child: Opacity(
            opacity: text == null ? 0.4 : 1,
            child: Text(text ?? '—',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: text == null ? c.mutedForeground : c.foreground)),
          ),
        );

    Widget team(String name, String? abbr, String? logo) => Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(color: c.muted.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(WaygerzRadius.md)),
          child: Row(children: [
            TeamLogo(name: name, abbreviation: abbr ?? '', logo: logo, size: 24),
            const SizedBox(width: 8),
            // Abbreviation on a phone, as the web shows below `sm`.
            Expanded(
              child: Text((abbr ?? '').isNotEmpty ? abbr! : name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
            ),
          ]),
        );

    final content = Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(
            child: Column(children: [
              team(ev.awayTeam, ev.awayAbbr, ev.awayLogo),
              const SizedBox(height: 8),
              team(ev.homeTeam, ev.homeAbbr, ev.homeLogo),
            ]),
          ),
          const SizedBox(width: 8),
          Column(children: [
            cell(sp == null ? null : signed(-sp)),
            const SizedBox(height: 8),
            cell(sp == null ? null : signed(sp)),
          ]),
          const SizedBox(width: 8),
          Column(children: [
            cell(ou == null ? null : 'O ${formatLine(ou)}'),
            const SizedBox(height: 8),
            cell(ou == null ? null : 'U ${formatLine(ou)}'),
          ]),
        ]),
        const SizedBox(height: 8),
        Text(formatStart(ev.startTime), style: TextStyle(fontSize: 12, color: c.mutedForeground)),
      ]),
    );
    if (onSelect == null) return content;
    return InkWell(borderRadius: BorderRadius.circular(WaygerzRadius.lg), onTap: () => onSelect!(ev), child: content);
  }
}
