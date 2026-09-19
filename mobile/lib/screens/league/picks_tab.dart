import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../api/api_client.dart';
import '../../api/events_api.dart';
import '../../api/leagues_api.dart';
import '../../format.dart';
import '../../models.dart';
import '../../theme/app_theme.dart';
import '../../ui/ui.dart';
import '../../wagers.dart' show formatLine;
import '../widgets.dart';

/// Pick'em "My Picks" (web _sections/play.tsx PickemPlay): pick a week, tap a
/// team per game, set the tie-breaker (total points) on the week's last game,
/// and save from the pinned bar. Only the open week is editable, and it locks
/// an hour before its first game. Graded games show ✓ / ✗.
class PicksTab extends StatefulWidget {
  const PicksTab({super.key, required this.api, required this.league, required this.header, required this.onRefresh});
  final ApiClient api;
  final League league;
  final List<Widget> header;
  final Future<void> Function() onRefresh;

  @override
  State<PicksTab> createState() => _PicksTabState();
}

class _PicksTabState extends State<PicksTab> {
  late final LeaguesApi _leagues = LeaguesApi(widget.api);
  late final EventsApi _events = EventsApi(widget.api);

  List<LeaguePeriod>? _periods;
  Object? _periodsError;
  String _periodId = '';

  List<SportEvent>? _games;
  Map<String, Pick> _saved = {};
  Object? _weekError;

  /// Unsaved selections: event id → home | away.
  final Map<String, String> _sel = {};
  final _tiebreaker = TextEditingController();

  /// The save bar's "no tie-breaker" scrolls here and focuses the field.
  final _tbKey = GlobalKey();
  final _tbFocus = FocusNode();
  bool _saving = false;
  bool _syncing = false;

  @override
  void initState() {
    super.initState();
    _tiebreaker.addListener(() => setState(() {}));
    _loadPeriods();
  }

  @override
  void dispose() {
    _tiebreaker.dispose();
    _tbFocus.dispose();
    super.dispose();
  }

  LeaguePeriod? get _period => _periods?.where((p) => p.id == _periodId).firstOrNull;

  Future<void> _loadPeriods() async {
    try {
      final ps = [...await _leagues.periods(widget.league.id)]..sort((a, b) => a.index.compareTo(b.index));
      if (!mounted) return;
      // Default to the open week, else the latest.
      final open = ps.where((p) => p.isOpen).firstOrNull;
      setState(() {
        _periods = ps;
        _periodsError = null;
        if (ps.every((p) => p.id != _periodId)) _periodId = open?.id ?? (ps.isEmpty ? '' : ps.last.id);
      });
      await _loadWeek();
    } catch (e) {
      if (mounted) setState(() => _periodsError = e);
    }
  }

  Future<void> _loadWeek() async {
    final period = _period;
    if (period == null) return;
    setState(() {
      _games = null;
      _weekError = null;
      _sel.clear();
      _tiebreaker.clear();
    });
    try {
      final sportIds = [for (final s in widget.league.sports) s.id];
      final results = await Future.wait([
        sportIds.isEmpty ? Future.value(<SportEvent>[]) : _events.inWindow(sportIds, period.startsAt, period.endsAt),
        _leagues.getPicks(widget.league.id, period.id),
      ]);
      if (!mounted || period.id != _periodId) return;
      final games = results[0] as List<SportEvent>;
      final picks = results[1] as List<Pick>;
      setState(() {
        _games = games;
        _saved = {for (final p in picks) p.eventId: p};
        final tb = _lastGame(games) == null ? null : _saved[_lastGame(games)!.externalId]?.tiebreakerTotal;
        if (tb != null) _tiebreaker.text = '$tb';
      });
    } catch (e) {
      if (mounted) setState(() => _weekError = e);
    }
  }

  Future<void> _reload() async {
    await Future.wait([_loadPeriods(), widget.onRefresh()]);
  }

  /// The tie-breaker lives on the week's last game (latest start).
  static SportEvent? _lastGame(List<SportEvent> games) {
    SportEvent? latest;
    DateTime? latestAt;
    for (final e in games) {
      final t = DateTime.tryParse(e.startTime ?? '');
      if (t == null) continue;
      if (latestAt == null || t.isAfter(latestAt)) {
        latest = e;
        latestAt = t;
      }
    }
    return latest;
  }

  /// The spread for one side (home line; away is its inverse; 0 is EVEN).
  static String? _sideSpread(SportEvent ev, String side) {
    final line = ev.odds?.spreadLine;
    if (line == null) return null;
    final v = side == 'home' ? line : -line;
    if (v == 0) return 'EVEN';
    final s = v == v.roundToDouble() ? v.toInt().toString() : v.toString();
    return v > 0 ? '+$s' : s;
  }

  Future<void> _save() async {
    final toast = Toaster.of(context);
    final games = _games ?? const <SportEvent>[];
    final last = _lastGame(games);
    final picks = [for (final e in _sel.entries) <String, dynamic>{'event_id': e.key, 'side': e.value}];
    if (last != null && _tiebreaker.text.trim().isNotEmpty) {
      final tb = (double.tryParse(_tiebreaker.text.trim()) ?? 0).round().clamp(0, 1 << 30);
      final found = picks.where((p) => p['event_id'] == last.externalId).firstOrNull;
      final side = _sel[last.externalId] ?? _saved[last.externalId]?.pickSide;
      if (found != null) {
        found['tiebreaker_total'] = tb;
      } else if (side != null) {
        picks.add({'event_id': last.externalId, 'side': side, 'tiebreaker_total': tb});
      }
    }
    setState(() => _saving = true);
    try {
      final saved = await _leagues.submitPicks(widget.league.id, _periodId, picks);
      toast.success('Picks saved');
      if (mounted) {
        setState(() {
          _sel.clear();
          _saved = {for (final p in saved) p.eventId: p};
        });
      }
    } catch (e) {
      toast.failure(e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _sync() async {
    final toast = Toaster.of(context);
    setState(() => _syncing = true);
    try {
      await _leagues.regeneratePeriods(widget.league.id);
      toast.success('Schedule synced');
      await _loadPeriods();
    } catch (e) {
      toast.failure(e);
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  static const _weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  /// The week's games grouped by kickoff (same start time), in start order, for
  /// the "SUNDAY · 1:00 PM" headers (web play.tsx kickoffGroups).
  static List<({String day, String time, List<SportEvent> games})> _kickoffGroups(List<SportEvent> games) {
    DateTime? at(SportEvent e) => DateTime.tryParse(e.startTime ?? '')?.toLocal();
    final sorted = [...games]..sort((a, b) {
        final ta = at(a), tb = at(b);
        if (ta == null || tb == null) return ta == null ? (tb == null ? 0 : 1) : -1;
        return ta.compareTo(tb);
      });
    final out = <({String day, String time, List<SportEvent> games})>[];
    String? lastKey;
    for (final e in sorted) {
      final key = e.startTime ?? 'tbd';
      if (key == lastKey) {
        out.last.games.add(e);
        continue;
      }
      lastKey = key;
      final d = at(e);
      out.add((day: d == null ? 'TBD' : _weekdays[d.weekday - 1], time: clockTime(e.startTime), games: [e]));
    }
    return out;
  }

  void _jumpToTiebreaker() {
    final ctx = _tbKey.currentContext;
    if (ctx == null) return;
    Scrollable.ensureVisible(ctx, alignment: 0.5, duration: const Duration(milliseconds: 300))
        .then((_) => _tbFocus.requestFocus());
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final period = _period;
    final games = _games ?? const <SportEvent>[];
    final editable = period?.isOpen ?? false;

    // Picks lock one hour before the week's first game.
    DateTime? firstStart;
    for (final e in games) {
      final t = DateTime.tryParse(e.startTime ?? '');
      if (t != null && (firstStart == null || t.isBefore(firstStart))) firstStart = t;
    }
    final lockAt = firstStart?.subtract(const Duration(hours: 1));
    final locked = lockAt != null && !DateTime.now().isBefore(lockAt);
    final canEdit = editable && !locked;
    final last = _lastGame(games);
    final savedTb = last == null ? null : _saved[last.externalId]?.tiebreakerTotal;
    final tbText = _tiebreaker.text.trim();
    final tbDirty = tbText.isNotEmpty && (savedTb == null || double.tryParse(tbText)?.round() != savedTb);
    final unsaved = _sel.length;
    final hasChanges = unsaved > 0 || tbDirty;
    final pickedCount = games.where((e) => (_sel[e.externalId] ?? _saved[e.externalId]?.pickSide) != null).length;
    final tbMissing = last != null && tbText.isEmpty;
    final showBar = games.isNotEmpty && editable;

    final body = <Widget>[];
    if (_periods == null && _periodsError == null) {
      body.add(const Skeleton(height: 160, radius: WaygerzRadius.xl));
    } else if (_periodsError != null) {
      body.add(ErrorCard(title: "Couldn't load the weeks", error: _periodsError, onRetry: _loadPeriods));
    } else if (_periods!.isEmpty) {
      body.add(CenterCard(children: [
        Text('No weeks scheduled yet.', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
        if (widget.league.myRole == 'commissioner')
          WzButton(label: _syncing ? 'Syncing…' : 'Sync schedule', size: ButtonSize.sm,
              variant: ButtonVariant.outline, busy: _syncing, onPressed: _sync),
      ]));
    } else {
      body.addAll([
        WeekChips<String>(
          weeks: [for (final p in _periods!) WeekChip(p.id, shortPeriodLabel(p.label), p.label)],
          value: _periodId,
          onChanged: (id) {
            setState(() => _periodId = id);
            _loadWeek();
          },
        ),
        const SizedBox(height: 16),
        SectionTitle(
          '${editable ? 'Make your Picks' : 'Picks'} · ${period?.label ?? ''}',
          subtitle: editable
              ? (lockAt == null
                  ? null
                  : locked
                      ? 'Picks are locked — the first game is about to start.'
                      : '$pickedCount/${games.length} picked · locks ${formatStart(lockAt.toIso8601String())}')
              : period?.status == 'upcoming'
                  ? 'This week hasn’t opened yet — preview only.'
                  : 'This week is closed.',
        ),
        const SizedBox(height: 16),
        if (_weekError != null)
          ErrorCard(title: "Couldn't load this week", error: _weekError, onRetry: _loadWeek)
        else if (_games == null)
          const Skeleton(height: 96, radius: WaygerzRadius.xl)
        else if (games.isEmpty)
          Text('No games scheduled for this week.', style: TextStyle(fontSize: 14, color: c.mutedForeground))
        else
          // Games under kickoff headers; each game is its two team rows + spread.
          for (final grp in _kickoffGroups(games)) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 0, 2, 10),
              child: Row(children: [
                Expanded(
                  child: Text(grp.day.toUpperCase(),
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 1, color: c.mutedForeground)),
                ),
                Text(grp.time, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.mutedForeground)),
              ]),
            ),
            for (final ev in grp.games)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _game(c, ev, canEdit: canEdit, isLast: ev.externalId == last?.externalId),
              ),
            const SizedBox(height: 4),
          ],
      ]);
    }

    return Stack(children: [
      RefreshIndicator(
        onRefresh: _reload,
        child: ListView(
          padding: EdgeInsets.fromLTRB(16, 20, 16, showBar ? 112 : 32),
          children: [...widget.header, ...body],
        ),
      ),
      if (showBar)
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: Container(
            decoration: BoxDecoration(
              color: c.background.withValues(alpha: 0.95),
              border: Border(top: BorderSide(color: c.border)),
            ),
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(children: [
                  Expanded(
                    child: Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
                      Text(
                        locked
                            ? 'Picks are locked for this week.'
                            : hasChanges
                                ? '$unsaved unsaved pick${unsaved == 1 ? '' : 's'}${tbDirty ? ' + tie-breaker' : ''}'
                                : 'Tap a team to make a pick.',
                        style: TextStyle(fontSize: 12, color: c.mutedForeground),
                      ),
                      if (!locked && tbMissing)
                        Semantics(
                          button: true,
                          label: 'No tie-breaker yet. Go to the tie-breaker.',
                          excludeSemantics: true,
                          child: InkWell(
                            onTap: _jumpToTiebreaker,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              child: Text(' · 🎯 no tie-breaker ↓',
                                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                                      color: Theme.of(context).brightness == Brightness.dark ? Tw.amber400 : Tw.amber600)),
                            ),
                          ),
                        ),
                    ]),
                  ),
                  const SizedBox(width: 12),
                  WzButton(
                    label: _saving ? 'Saving…' : 'Save picks',
                    size: ButtonSize.lg,
                    busy: _saving,
                    onPressed: locked || !hasChanges ? null : _save,
                  ),
                ]),
              ),
            ),
          ),
        ),
    ]);
  }

  Widget _game(WaygerzColors c, SportEvent ev, {required bool canEdit, required bool isLast}) {
    final g = _saved[ev.externalId];
    final graded = g != null && g.correct != null;
    final disabled = graded || !canEdit;
    final current = _sel[ev.externalId] ?? g?.pickSide;

    Widget side(String s) {
      final isHome = s == 'home';
      final name = isHome ? ev.homeTeam : ev.awayTeam;
      final abbr = (isHome ? ev.homeAbbr : ev.awayAbbr) ?? '';
      final logo = isHome ? ev.homeLogo : ev.awayLogo;
      final active = current == s;
      final isMyPick = graded && g.pickSide == s;
      final picked = active || isMyPick;
      final tone = isMyPick
          ? (g.correct! ? c.brand : c.destructive).withValues(alpha: 0.2)
          : active
              ? Tw.blue500.withValues(alpha: 0.2)
              : c.muted.withValues(alpha: 0.6);
      final spread = _sideSpread(ev, s);
      return Row(children: [
        Expanded(
          child: Opacity(
            opacity: disabled && !picked ? 0.6 : 1,
            child: Material(
              color: tone,
              borderRadius: BorderRadius.circular(WaygerzRadius.md),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: disabled ? null : () => setState(() => _sel[ev.externalId] = s),
                child: Container(
                  height: 48,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Row(children: [
                    TeamLogo(name: name, abbreviation: abbr, logo: logo, size: 32),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
                    ),
                    if (picked) Icon(LucideIcons.check, size: 16, color: c.foreground.withValues(alpha: 0.7)),
                  ]),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 6),
        Container(
          width: 60,
          height: 48,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: c.muted.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(WaygerzRadius.md)),
          child: Text(spread ?? '—', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.mutedForeground)),
        ),
      ]);
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      // The kickoff is in the group header; a graded game shows its result.
      if (graded) ...[
        Align(
          alignment: Alignment.centerRight,
          child: WzBadge(g.correct! ? '✓ correct' : '✗ wrong',
              variant: g.correct! ? BadgeVariant.success : BadgeVariant.destructive),
        ),
        const SizedBox(height: 6),
      ],
      side('away'),
      const SizedBox(height: 6),
      side('home'),
      // The tie-breaker: a row in the same shading as the teams, so it reads as
      // part of the pick; the 🎯 and number box set it apart (web play.tsx).
      if (isLast) ...[
        const SizedBox(height: 6),
        Container(
          key: _tbKey,
          height: 52,
          padding: const EdgeInsets.only(left: 10, right: 6),
          decoration: BoxDecoration(color: c.muted.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(WaygerzRadius.md)),
          child: Row(children: [
            const ExcludeSemantics(child: Text('🎯', style: TextStyle(fontSize: 16))),
            const SizedBox(width: 10),
            Expanded(
              child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Tie-breaker', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
                Text('Total points', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
              ]),
            ),
            SizedBox(
              width: 80,
              height: 40,
              child: TextField(
                controller: _tiebreaker,
                focusNode: _tbFocus,
                enabled: !disabled,
                keyboardType: TextInputType.number,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, fontFeatures: [FontFeature.tabularFigures()]),
                decoration: InputDecoration(
                  hintText: ev.odds?.total != null ? formatLine(ev.odds!.total!) : '48',
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(vertical: 9),
                ),
              ),
            ),
          ]),
        ),
      ],
    ]);
  }
}
