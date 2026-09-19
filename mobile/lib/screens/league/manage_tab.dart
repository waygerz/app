import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../api/api_client.dart';
import '../../api/leagues_api.dart';
import '../../api/users_api.dart';
import '../../models.dart';
import '../../theme/app_theme.dart';
import '../../ui/ui.dart';
import '../../widgets/sports_picker.dart';
import '../widgets.dart';

/// Curated zones for the picker (web manage.tsx); the backend takes any IANA name.
const _timezones = [
  ('America/New_York', 'Eastern (New York)'),
  ('America/Chicago', 'Central (Chicago)'),
  ('America/Denver', 'Mountain (Denver)'),
  ('America/Phoenix', 'Arizona (no DST)'),
  ('America/Los_Angeles', 'Pacific (Los Angeles)'),
  ('America/Anchorage', 'Alaska (Anchorage)'),
  ('Pacific/Honolulu', 'Hawaii (Honolulu)'),
  ('America/Toronto', 'Toronto'),
  ('America/Vancouver', 'Vancouver'),
  ('Europe/London', 'London'),
];

/// The commissioner's Manage tab (web _sections/manage.tsx): a grouped
/// settings list — League Details (logo/name/description/sports), Rules &
/// Limits (money leagues), and Weekly Period — each row opening a sheet to
/// edit it, plus an always-visible Danger zone (archive) below the list.
class ManageTab extends StatelessWidget {
  const ManageTab({super.key, required this.api, required this.league, required this.header, required this.onRefresh, required this.onArchived});
  final ApiClient api;
  final League league;
  final List<Widget> header;
  final Future<void> Function() onRefresh;
  final VoidCallback onArchived;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    if (league.myRole != 'commissioner') {
      return ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [
        ...header,
        CenterCard(children: [
          Icon(LucideIcons.lock, size: 24, color: c.mutedForeground),
          Text('Only the commissioner can manage this league.', textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: c.mutedForeground)),
        ]),
      ]);
    }
    final showPeriod = league.isActive && league.periodType == 'weekly';
    final sportsSummary = league.sports.isEmpty
        ? 'No sports yet'
        : league.sports.take(2).map((s) => s.name.isEmpty ? s.id : s.name).join(', ') +
            (league.sports.length > 2 ? ' +${league.sports.length - 2}' : '');
    final whoCanPropose = league.rules['who_can_propose'] == 'commissioner' ? 'Commissioner only' : 'Any member';
    final rulesSummary = league.isMoney
        ? '${_dollarsLabel(league.minWagerCents, "min")} · ${_dollarsLabel(league.maxWagerCents, "max")} · $whoCanPropose'
        : '';
    final period = league.currentPeriod;
    final periodSummary = period == null ? '—' : '${period.label} · ${_cap(period.status)}';

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [
        ...header,
        _SettingsGroup(label: 'League', children: [
          _SettingsRow(
            icon: LucideIcons.tag,
            title: 'League Details',
            summary: '${league.name} · $sportsSummary',
            onTap: () => showWzSheet<void>(context, title: 'League Details', tall: true, scroll: true,
                builder: (_) => _Details(key: ValueKey('details-${league.id}'), api: api, league: league, onSaved: onRefresh)),
          ),
          if (league.isMoney)
            _SettingsRow(
              icon: LucideIcons.settings,
              title: 'Rules & Limits',
              summary: rulesSummary,
              onTap: () => showWzSheet<void>(context, title: 'Rules & Limits',
                  builder: (_) => _Rules(key: ValueKey('rules-${league.id}'), api: api, league: league, onSaved: onRefresh)),
            ),
        ]),
        if (showPeriod) ...[
          const SizedBox(height: 20),
          _SettingsGroup(label: 'Season', children: [
            _SettingsRow(
              icon: LucideIcons.calendarClock,
              title: 'Weekly Period',
              summary: periodSummary,
              onTap: () => showWzSheet<void>(context, title: 'Weekly Period', builder: (_) => Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Text('Current: $periodSummary', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
                      const SizedBox(height: 20),
                      _ConfirmedAction(
                        label: 'Advance period',
                        busyLabel: 'Advancing…',
                        title: 'Advance to the next period?',
                        description: 'This closes the current week now and opens the next one. Open bets settle as usual.',
                        expand: true,
                        run: () async {
                          await LeaguesApi(api).advancePeriod(league.id);
                          await onRefresh();
                          return 'Period advanced';
                        },
                      ),
                    ]),
                  )),
            ),
          ]),
        ],
        const SizedBox(height: 20),
        Text('DANGER ZONE', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 1, color: c.mutedForeground)),
        const SizedBox(height: 10),
        _DangerCard(
          title: 'Archive league',
          description: 'Removes it from everyone’s dashboard. Balances and history are preserved.',
          action: _ConfirmedAction(
            label: 'Archive league',
            busyLabel: 'Archiving…',
            title: 'Archive “${league.name}”?',
            description: 'It disappears from everyone’s dashboard. Balances and history are preserved.',
            destructive: true,
            expand: true,
            run: () async {
              await LeaguesApi(api).archive(league.id);
              onArchived();
              return 'League archived';
            },
          ),
        ),
      ]),
    );
  }

  static String _dollarsLabel(int? cents, String which) => cents == null || cents == 0 ? 'No $which' : '\$${cents / 100 == (cents ~/ 100) ? cents ~/ 100 : cents / 100} $which';

  static String _cap(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
}

/// A labeled group of settings rows: a small uppercase label, then a single
/// bordered, divided list (so a multi-row group reads as one card, not one
/// border per row) — the app's grouped-list pattern, as on My Leagues.
class _SettingsGroup extends StatelessWidget {
  const _SettingsGroup({required this.label, required this.children});
  final String label;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Padding(
        padding: const EdgeInsets.only(left: 2, bottom: 10),
        child: Text(label.toUpperCase(), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 1, color: c.mutedForeground)),
      ),
      Container(
        decoration: BoxDecoration(
          color: c.card,
          borderRadius: BorderRadius.circular(WaygerzRadius.xl),
          border: Border.all(color: c.border),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) Divider(height: 1, thickness: 1, color: c.border),
            children[i],
          ],
        ]),
      ),
    ]);
  }
}

/// One row in a settings group: an icon chip, a title + one-line summary, and
/// a chevron — tapping opens that setting's sheet. Generous padding (16px)
/// and a 60px min-height keep it a comfortable tap target.
class _SettingsRow extends StatelessWidget {
  const _SettingsRow({required this.icon, required this.title, required this.summary, required this.onTap});
  final IconData icon;
  final String title;
  final String summary;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 60),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: c.muted, borderRadius: BorderRadius.circular(WaygerzRadius.lg)),
              child: Icon(icon, size: 18, color: c.foreground),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
                Text(summary, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12, color: c.mutedForeground)),
              ]),
            ),
            const SizedBox(width: 8),
            Icon(LucideIcons.chevronRight, size: 20, color: c.mutedForeground),
          ]),
        ),
      ),
    );
  }
}

/// The red-tinted card for a destructive, always-visible action — outside the
/// settings list, not one more row to tap through to.
class _DangerCard extends StatelessWidget {
  const _DangerCard({required this.title, required this.description, required this.action});
  final String title;
  final String description;
  final Widget action;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: c.destructive.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(WaygerzRadius.xl),
        border: Border.all(color: c.destructive.withValues(alpha: 0.3)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.destructive)),
        const SizedBox(height: 6),
        Text(description, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
        const SizedBox(height: 16),
        action,
      ]),
    );
  }
}

/// An outline button that confirms, runs, and toasts the result.
class _ConfirmedAction extends StatefulWidget {
  const _ConfirmedAction({
    required this.label,
    required this.busyLabel,
    required this.title,
    required this.description,
    required this.run,
    this.destructive = false,
    this.expand = false,
  });
  final String label;
  final String busyLabel;
  final String title;
  final String description;
  final bool destructive;
  final bool expand;
  final Future<String> Function() run;

  @override
  State<_ConfirmedAction> createState() => _ConfirmedActionState();
}

class _ConfirmedActionState extends State<_ConfirmedAction> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    return WzButton(
      label: _busy ? widget.busyLabel : widget.label,
      variant: widget.destructive ? ButtonVariant.destructive : ButtonVariant.outline,
      busy: _busy,
      expand: widget.expand,
      size: ButtonSize.lg,
      onPressed: () async {
        final ok = await confirmWz(context, title: widget.title, description: widget.description,
            confirmLabel: widget.label, destructive: widget.destructive);
        if (!ok || !context.mounted) return;
        final toast = Toaster.of(context);
        setState(() => _busy = true);
        try {
          toast.success(await widget.run());
        } catch (e) {
          toast.failure(e);
        } finally {
          if (mounted) setState(() => _busy = false);
        }
      },
    );
  }
}

// ------------------------------------------------------------------ details

class _Details extends StatefulWidget {
  const _Details({super.key, required this.api, required this.league, required this.onSaved});
  final ApiClient api;
  final League league;
  final Future<void> Function() onSaved;

  @override
  State<_Details> createState() => _DetailsState();
}

class _DetailsState extends State<_Details> {
  late final _name = TextEditingController(text: widget.league.name);
  late final _description = TextEditingController(text: widget.league.description ?? '');
  late final List<({String id, String name})> _chosen = [
    for (final s in widget.league.sports) (id: s.id, name: s.name.isEmpty ? s.id : s.name),
  ];
  bool _saving = false;
  bool _logoBusy = false;

  @override
  void initState() {
    super.initState();
    _name.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final toast = Toaster.of(context);
    setState(() => _saving = true);
    try {
      await LeaguesApi(widget.api).update(widget.league.id, {
        'name': _name.text.trim(),
        'description': _description.text.trim().isEmpty ? null : _description.text.trim(),
        'sports': [for (final s in _chosen) {'sport_league_id': s.id, 'name': s.name}],
      });
      toast.success('League updated');
      await widget.onSaved();
    } catch (e) {
      toast.failure(e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _setLogo({required bool remove}) async {
    final toast = Toaster.of(context);
    String? key;
    if (!remove) {
      final file = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 400, maxHeight: 400, imageQuality: 85);
      if (file == null) return;
      setState(() => _logoBusy = true);
      try {
        final bytes = await file.readAsBytes();
        key = (await MediaApi(widget.api).upload('league_logo', bytes, file.mimeType ?? MediaApi.contentTypeFor(file.name))).key;
      } catch (e) {
        toast.failure(e);
        if (mounted) setState(() => _logoBusy = false);
        return;
      }
    }
    setState(() => _logoBusy = true);
    try {
      await LeaguesApi(widget.api).update(widget.league.id, {'logo_url': key});
      toast.success(remove ? 'Logo removed' : 'Logo updated');
      await widget.onSaved();
    } catch (e) {
      toast.failure(e);
    } finally {
      if (mounted) setState(() => _logoBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final lg = widget.league;
    Widget label(String t) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(t, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.foreground)),
        );
    final hasLogo = (lg.logoUrl ?? '').isNotEmpty;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      label('Logo'),
      Row(children: [
        LeagueAvatar(name: _name.text, id: lg.id, logo: lg.logoUrl, size: 96),
        const SizedBox(width: 16),
        Expanded(
          child: Wrap(spacing: 8, runSpacing: 8, children: [
            WzButton(label: _logoBusy ? 'Uploading…' : hasLogo ? 'Change logo' : 'Upload logo', icon: LucideIcons.imagePlus,
                size: ButtonSize.sm, variant: ButtonVariant.outline, onPressed: _logoBusy ? null : () => _setLogo(remove: false)),
            if (hasLogo)
              WzButton(label: 'Remove', icon: LucideIcons.trash2, size: ButtonSize.sm, variant: ButtonVariant.outline,
                  onPressed: _logoBusy ? null : () => _setLogo(remove: true)),
          ]),
        ),
      ]),
      const SizedBox(height: 20),
      label('Name'),
      TextField(controller: _name, style: const TextStyle(fontSize: 16)),
      const SizedBox(height: 20),
      label('Description'),
      TextField(
        controller: _description,
        minLines: 3,
        maxLines: 6,
        style: const TextStyle(fontSize: 16),
        decoration: const InputDecoration(hintText: "What's this league about? (shown on the invite page)"),
      ),
      const SizedBox(height: 20),
      label('Available leagues'),
      SportsPicker(
        api: widget.api,
        chosen: _chosen,
        onToggle: (id, name) => setState(() {
          final i = _chosen.indexWhere((s) => s.id == id);
          i >= 0 ? _chosen.removeAt(i) : _chosen.add((id: id, name: name));
        }),
      ),
      const SizedBox(height: 24),
      WzButton(
        label: _saving ? 'Saving…' : 'Save details',
        busy: _saving,
        expand: true,
        size: ButtonSize.lg,
        onPressed: _name.text.trim().isNotEmpty && _chosen.isNotEmpty && !_saving ? _save : null,
      ),
    ]);
  }
}

// -------------------------------------------------------------------- rules

class _Rules extends StatefulWidget {
  const _Rules({super.key, required this.api, required this.league, required this.onSaved});
  final ApiClient api;
  final League league;
  final Future<void> Function() onSaved;

  @override
  State<_Rules> createState() => _RulesState();
}

class _RulesState extends State<_Rules> {
  late final _min = TextEditingController(text: _dollars(widget.league.minWagerCents));
  late final _max = TextEditingController(text: _dollars(widget.league.maxWagerCents));
  late String _who = widget.league.rules['who_can_propose'] == 'commissioner' ? 'commissioner' : 'any';
  late String _tz = widget.league.timezone ?? 'America/New_York';
  bool _saving = false;

  static String _dollars(int? cents) => cents == null || cents == 0 ? '' : '${cents / 100 == (cents ~/ 100) ? cents ~/ 100 : cents / 100}';

  @override
  void initState() {
    super.initState();
    for (final c in [_min, _max]) {
      c.addListener(() => setState(() {}));
    }
  }

  @override
  void dispose() {
    _min.dispose();
    _max.dispose();
    super.dispose();
  }

  /// Blank = no limit; otherwise a number ≥ 0, and max ≥ min (web zod schema).
  (String?, String?) get _errors {
    final min = _min.text.trim();
    final max = _max.text.trim();
    final minV = double.tryParse(min);
    final maxV = double.tryParse(max);
    final minErr = min.isNotEmpty && (minV == null || minV < 0) ? 'Enter a number ≥ 0, or leave blank.' : null;
    var maxErr = max.isNotEmpty && (maxV == null || maxV < 0) ? 'Enter a number ≥ 0, or leave blank.' : null;
    if (maxErr == null && minV != null && maxV != null && maxV < minV) maxErr = 'Max must be at least the minimum.';
    return (minErr, maxErr);
  }

  Future<void> _save() async {
    final toast = Toaster.of(context);
    setState(() => _saving = true);
    int? cents(String v) => v.trim().isEmpty ? null : (double.parse(v.trim()) * 100).round();
    try {
      await LeaguesApi(widget.api).update(widget.league.id, {
        'min_wager_cents': cents(_min.text),
        'max_wager_cents': cents(_max.text),
        'rules': {...widget.league.rules, 'who_can_propose': _who},
        'timezone': _tz,
      });
      toast.success('Rules saved');
      await widget.onSaved();
    } catch (e) {
      toast.failure(e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final (minErr, maxErr) = _errors;
    Widget label(String t) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(t, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.foreground)),
        );
    Widget hint(String t) => Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(t, style: TextStyle(fontSize: 12, color: c.mutedForeground)),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      label(r'Min wager ($)'),
      TextField(controller: _min, keyboardType: TextInputType.number,
          decoration: InputDecoration(hintText: 'none', errorText: minErr)),
      const SizedBox(height: 20),
      label(r'Max wager ($)'),
      TextField(controller: _max, keyboardType: TextInputType.number,
          decoration: InputDecoration(hintText: 'none', errorText: maxErr)),
      if (widget.league.leagueType == 'head_to_head') ...[
        const SizedBox(height: 20),
        label('Who can propose bets'),
        WzSelect<String>(
          title: 'Who can propose bets',
          value: _who,
          options: const [(value: 'any', label: 'Any member'), (value: 'commissioner', label: 'Commissioner only')],
          onChanged: (v) => setState(() => _who = v),
        ),
        hint('Limit who can start head-to-head bets.'),
      ],
      const SizedBox(height: 20),
      label('League timezone'),
      WzSelect<String>(
        title: 'League timezone',
        value: _tz,
        options: [
          for (final t in _timezones) (value: t.$1, label: t.$2),
          if (_timezones.every((t) => t.$1 != _tz)) (value: _tz, label: _tz),
        ],
        onChanged: (v) => setState(() => _tz = v),
      ),
      hint('Weeks roll over at 4:00 AM in this timezone, so late night games finish before a period closes.'),
      const SizedBox(height: 24),
      WzButton(
        label: _saving ? 'Saving…' : 'Save rules',
        busy: _saving,
        expand: true,
        size: ButtonSize.lg,
        onPressed: minErr == null && maxErr == null && !_saving ? _save : null,
      ),
    ]);
  }
}
