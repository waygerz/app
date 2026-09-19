import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../api/api_client.dart';
import '../api/events_api.dart';
import '../api/wagers_api.dart';
import '../format.dart';
import '../models.dart';
import '../screens/widgets.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import '../wagers.dart';
import 'stake_chips.dart';

/// Open the two-step bet flow for a game (web ScheduleBetDialog). Resolves
/// true when at least one bet was sent.
Future<bool> showBetSheet(BuildContext context,
    {required ApiClient api, required League league, required SportEvent event, required String me}) async {
  final sent = await showWzSheetWith<bool>(
    context,
    builder: (_) => _BetSheet(api: api, league: league, event: event, me: me),
  );
  return sent ?? false;
}

class _BetSheet extends StatefulWidget {
  const _BetSheet({required this.api, required this.league, required this.event, required this.me});
  final ApiClient api;
  final League league;
  final SportEvent event;
  final String me;

  @override
  State<_BetSheet> createState() => _BetSheetState();
}

class _BetSheetState extends State<_BetSheet> {
  late final WagersApi _wagers = WagersApi(widget.api);
  bool _membersStep = false;

  // The picked cell: side + market (+ line for spread/total). Nothing is picked
  // until the user taps a cell.
  String _side = 'away';
  String _betType = 'moneyline';
  double? _line;
  bool _picked = false;

  String _dollars = '10';
  String _treat = 'beer';
  final List<String> _selected = [];
  bool _sending = false;

  EventOdds? _odds;

  SportEvent get ev => widget.event;

  @override
  void initState() {
    super.initState();
    _odds = ev.odds;
    if (_odds == null) {
      EventsApi(widget.api).odds(ev).then((o) {
        if (mounted) setState(() => _odds = o);
      }).catchError((_) {});
    }
  }

  String _team(String s) => s == 'away' ? ev.awayTeam : ev.homeTeam;
  String? _logo(String s) => s == 'away' ? ev.awayLogo : ev.homeLogo;
  String _abbr(String s) => (s == 'away' ? ev.awayAbbr : ev.homeAbbr) ?? '';

  static String _sign(double v) => '${v > 0 ? '+' : ''}${formatLine(v)}';

  void _pick(String side, String betType, double? line) => setState(() {
        _side = side;
        _betType = betType;
        _line = betType == 'moneyline' ? null : line;
        _picked = true;
      });

  bool _isSel(String side, String betType) => _picked && _side == side && _betType == betType;

  String get _pickText => _betType == 'total'
      ? '${_side == 'over' ? 'Over' : 'Under'} ${formatLine(_line ?? 0)}'
      : '${_team(_side)}${_betType == 'spread' && _line != null ? ' ${_sign(_line!)}' : ''}';

  int? get _cents => parseStakeCents(_dollars);

  Future<void> _send() async {
    final toast = Toaster.of(context);
    final nav = Navigator.of(context);
    setState(() => _sending = true);
    try {
      final r = await _wagers.propose(
        leagueId: widget.league.id,
        eventId: ev.externalId,
        side: _side,
        amountCents: _cents!,
        acceptorIds: _selected,
        betType: _betType,
        line: _betType == 'moneyline' ? null : _line,
        treat: _treat,
      );
      if (r.created > 0) toast.success('Bet sent to ${r.created} member${r.created == 1 ? '' : 's'}');
      for (final e in r.errors) {
        toast.error(e);
      }
      nav.pop(r.created > 0);
    } catch (e) {
      toast.failure(e);
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ev = widget.event;
    return WzSheet(
      title: '${ev.awayTeam} @ ${ev.homeTeam}',
      description: formatStart(ev.startTime),
      child: _membersStep ? _members(context) : _config(context),
    );
  }

  // ----------------------------------------------------------- step 1: config
  Widget _config(BuildContext context) {
    final c = WaygerzColors.of(context);
    final spread = _odds?.spreadLine;
    final total = _odds?.total;
    final cents = _cents;
    final ready = _picked && cents != null;

    Widget cell({required bool on, required bool enabled, required String? label, required VoidCallback onTap}) => SizedBox(
          width: 64,
          height: 48,
          child: Opacity(
            opacity: enabled ? 1 : 0.4,
            child: InkWell(
              borderRadius: BorderRadius.circular(WaygerzRadius.md),
              onTap: enabled ? onTap : null,
              child: Container(
                alignment: Alignment.center,
                decoration: pickDecoration(c, on, radius: WaygerzRadius.md),
                child: Text(label ?? '—',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500,
                        color: label == null ? c.mutedForeground : c.foreground)),
              ),
            ),
          ),
        );

    Widget head(String t, {double? width}) => SizedBox(
          width: width,
          child: Text(t, textAlign: width == null ? TextAlign.left : TextAlign.center,
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, letterSpacing: 1, color: c.mutedForeground)),
        );

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        const SizedBox(width: 4),
        Expanded(child: head('WINNER')),
        const SizedBox(width: 6),
        head('SPREAD', width: 64),
        const SizedBox(width: 6),
        head('TOTAL', width: 64),
      ]),
      const SizedBox(height: 6),
      for (final s in const ['away', 'home'])
        Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(border: s == 'away' ? Border(bottom: BorderSide(color: c.border)) : null),
          child: Row(children: [
            // The team name IS the straight-up (Winner) pick.
            Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(WaygerzRadius.md),
                onTap: () => _pick(s, 'moneyline', null),
                child: Container(
                  height: 48,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  decoration: pickDecoration(c, _isSel(s, 'moneyline'), radius: WaygerzRadius.md),
                  child: Row(children: [
                    TeamLogo(name: _team(s), abbreviation: _abbr(s), logo: _logo(s), size: 32),
                    const SizedBox(width: 10),
                    Expanded(child: Text(_team(s), maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.foreground))),
                  ]),
                ),
              ),
            ),
            const SizedBox(width: 6),
            cell(
              on: _isSel(s, 'spread'),
              enabled: spread != null,
              label: spread == null ? null : _sign(s == 'away' ? -spread : spread),
              onTap: () => _pick(s, 'spread', s == 'away' ? -spread! : spread!),
            ),
            const SizedBox(width: 6),
            // Total: over on the away row, under on the home row.
            cell(
              on: _isSel(s == 'away' ? 'over' : 'under', 'total'),
              enabled: total != null,
              label: total == null ? null : '${s == 'away' ? 'O' : 'U'} ${formatLine(total)}',
              onTap: () => _pick(s == 'away' ? 'over' : 'under', 'total', total),
            ),
          ]),
        ),
      const SizedBox(height: 16),
      StakeChips(
        dollars: _dollars,
        onDollars: (v) => setState(() => _dollars = v),
        treat: _treat,
        onTreat: (t) => setState(() => _treat = t),
      ),
      const SizedBox(height: 20),
      WzButton(
        label: _picked ? 'Next · $_pickText' : 'Next',
        expand: true,
        onPressed: ready ? () => setState(() => _membersStep = true) : null,
      ),
    ]);
  }

  // ---------------------------------------------------------- step 2: members
  Widget _members(BuildContext context) {
    final c = WaygerzColors.of(context);
    final opponents = widget.league.members.where((m) => m.userId != widget.me).toList();
    final betLabel = switch (_betType) { 'moneyline' => 'Straight up', 'spread' => 'Spread', _ => 'Total' };
    final cents = _cents ?? 0;

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [
        if (_betType != 'total') ...[
          TeamLogo(name: _team(_side), abbreviation: _abbr(_side), logo: _logo(_side), size: 32),
          const SizedBox(width: 10),
        ],
        Expanded(child: Text(_pickText, maxLines: 1, overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground))),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(color: c.secondary, borderRadius: BorderRadius.circular(999)),
          child: Text('$betLabel · ${cents == 0 ? '${treatEmoji(_treat)} (loser buys the round)' : formatCredits(cents)}',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.foreground)),
        ),
      ]),
      Padding(
        padding: EdgeInsets.only(top: 4, left: _betType != 'total' ? 42 : 0),
        child: Text('${ev.shortName ?? '${ev.awayTeam} at ${ev.homeTeam}'}'
            '${ev.startTime != null ? ' · ${formatStart(ev.startTime)}' : ''}',
            maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: c.mutedForeground)),
      ),
      const SizedBox(height: 16),
      MemberPicker(
        opponents: opponents,
        selected: _selected,
        onToggle: (id) => setState(() => _selected.contains(id) ? _selected.remove(id) : _selected.add(id)),
      ),
      const SizedBox(height: 20),
      WzButton(
        label: _sending ? 'Sending…' : 'Bet${_selected.length > 1 ? ' (${_selected.length})' : ''}',
        expand: true,
        busy: _sending,
        onPressed: _selected.isEmpty || _cents == null || _sending ? null : _send,
      ),
      const SizedBox(height: 8),
      WzButton(label: 'Back', expand: true, variant: ButtonVariant.outline,
          onPressed: _sending ? null : () => setState(() => _membersStep = false)),
    ]);
  }
}

/// "Challenge members" (web MemberPicker): selected members as removable chips,
/// a search box past eight members, and a checkable row per member.
class MemberPicker extends StatefulWidget {
  const MemberPicker({super.key, required this.opponents, required this.selected, required this.onToggle});
  final List<LeagueMember> opponents;
  final List<String> selected;
  final ValueChanged<String> onToggle;

  @override
  State<MemberPicker> createState() => _MemberPickerState();
}

class _MemberPickerState extends State<MemberPicker> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final needle = _q.trim().toLowerCase();
    final shown = needle.isEmpty
        ? widget.opponents
        : widget.opponents.where((m) => m.displayName.toLowerCase().contains(needle)).toList();
    final chosen = widget.opponents.where((m) => widget.selected.contains(m.userId)).toList();

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text.rich(TextSpan(children: [
        const TextSpan(text: 'Challenge members'),
        if (chosen.isNotEmpty)
          TextSpan(text: ' · ${chosen.length} selected', style: TextStyle(fontWeight: FontWeight.w400, color: c.mutedForeground)),
      ]), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.foreground)),
      const SizedBox(height: 8),
      if (widget.opponents.isEmpty)
        Text('No other members to challenge yet.', style: TextStyle(fontSize: 14, color: c.mutedForeground))
      else ...[
        if (chosen.isNotEmpty) ...[
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final m in chosen)
              InkWell(
                borderRadius: BorderRadius.circular(999),
                onTap: () => widget.onToggle(m.userId),
                child: Container(
                  padding: const EdgeInsets.fromLTRB(4, 4, 8, 4),
                  decoration: BoxDecoration(color: c.primary.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(999)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    UserAvatar(userId: m.userId, name: m.displayName, avatarKey: m.avatarKey, size: 20),
                    const SizedBox(width: 6),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 144),
                      child: Text(m.displayName, maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: c.primary)),
                    ),
                    const SizedBox(width: 4),
                    Icon(LucideIcons.x, size: 12, color: c.primary, semanticLabel: 'Remove ${m.displayName}'),
                  ]),
                ),
              ),
          ]),
          const SizedBox(height: 8),
        ],
        if (widget.opponents.length > 8) ...[
          SearchField(hint: 'Search members', onChanged: (v) => setState(() => _q = v)),
          const SizedBox(height: 8),
        ],
        for (final m in shown)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: InkWell(
              borderRadius: BorderRadius.circular(WaygerzRadius.lg),
              onTap: () => widget.onToggle(m.userId),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: pickDecoration(c, widget.selected.contains(m.userId)),
                child: Row(children: [
                  UserAvatar(userId: m.userId, name: m.displayName, avatarKey: m.avatarKey, size: 40),
                  const SizedBox(width: 12),
                  Expanded(child: Text(m.displayName, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.foreground))),
                  _check(c, widget.selected.contains(m.userId)),
                ]),
              ),
            ),
          ),
        if (needle.isNotEmpty && shown.isEmpty)
          Text('No members match “${_q.trim()}”.', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
      ],
    ]);
  }

  Widget _check(WaygerzColors c, bool on) => Container(
        width: 20,
        height: 20,
        decoration: BoxDecoration(
          color: on ? c.primary : Colors.transparent,
          shape: BoxShape.circle,
          border: Border.all(color: on ? c.primary : c.input),
        ),
        child: on ? Icon(LucideIcons.check, size: 14, color: Theme.of(context).colorScheme.onPrimary) : null,
      );
}
