import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../api/api_client.dart';
import '../api/leagues_api.dart';
import '../api/users_api.dart';
import '../format.dart';
import '../models.dart';
import '../shell/app_header.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import '../widgets/stake_chips.dart';
import 'league_detail_screen.dart';
import 'widgets.dart';

const _types = [
  ('head_to_head', 'Challenge members 1v1. Winner takes the pot.'),
  ('pickem', 'No money — pick winners each round and climb the table.'),
];

const _days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

/// Create a league (web app/(app)/leagues/new/page.tsx): type, name,
/// description, logo, period, starting balance (money leagues) and the
/// sport-leagues members can play. Opens the new league on success.
class CreateLeagueScreen extends StatefulWidget {
  const CreateLeagueScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<CreateLeagueScreen> createState() => _CreateLeagueScreenState();
}

class _CreateLeagueScreenState extends State<CreateLeagueScreen> {
  late final CatalogApi _catalog = CatalogApi(widget.api);
  late final Future<List<CatalogItem>> _sports = _catalog.sports();
  Future<List<CatalogItem>>? _sportLeagues;

  final _name = TextEditingController();
  final _description = TextEditingController();
  final _year = TextEditingController(text: '${DateTime.now().year}');
  final _starting = TextEditingController(text: '1000');

  String _type = 'head_to_head';
  String _periodType = 'season';
  String _weekStartsOn = 'tuesday';
  String _activeSport = '';
  final List<({String id, String name})> _chosen = [];

  Uint8List? _logo;
  String _logoType = 'image/jpeg';
  bool _creating = false;

  bool get _isMoney => _type != 'pickem';

  @override
  void initState() {
    super.initState();
    for (final c in [_name, _starting]) {
      c.addListener(() => setState(() {}));
    }
  }

  @override
  void dispose() {
    for (final c in [_name, _description, _year, _starting]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickLogo() async {
    final file = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 400, maxHeight: 400, imageQuality: 85);
    if (file == null) return;
    final bytes = await file.readAsBytes();
    setState(() {
      _logo = bytes;
      _logoType = file.mimeType ?? MediaApi.contentTypeFor(file.name);
    });
  }

  void _toggle(String id, String name) => setState(() {
        final i = _chosen.indexWhere((c) => c.id == id);
        i >= 0 ? _chosen.removeAt(i) : _chosen.add((id: id, name: name));
      });

  bool get _canSubmit =>
      _name.text.trim().isNotEmpty && _chosen.isNotEmpty && (!_isMoney || (double.tryParse(_starting.text) ?? 0) > 0);

  Future<void> _create() async {
    final toast = Toaster.of(context);
    final nav = Navigator.of(context);
    setState(() => _creating = true);
    try {
      // Upload the logo first; the league stores its media key.
      String? logoKey;
      if (_logo != null) logoKey = (await MediaApi(widget.api).upload('league_logo', _logo!, _logoType)).key;
      final lg = await LeaguesApi(widget.api).create(
        name: _name.text.trim(),
        description: _description.text.trim().isEmpty ? null : _description.text.trim(),
        logoKey: logoKey,
        leagueType: _type,
        periodType: _periodType,
        startingBalanceCents: _isMoney ? ((double.tryParse(_starting.text) ?? 0) * 100).round() : null,
        sports: _chosen,
        rules: _periodType == 'season'
            ? {'season_year': int.tryParse(_year.text.trim()) ?? DateTime.now().year}
            : {'week_starts_on': _weekStartsOn},
      );
      toast.success('Created ${lg.name}');
      nav.pushReplacement(MaterialPageRoute<void>(builder: (_) => LeagueDetailScreen(api: widget.api, league: lg)));
    } catch (e) {
      toast.failure(e);
      if (mounted) setState(() => _creating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    Widget label(String t) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(t, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.foreground)),
        );
    Widget hint(String t) => Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text(t, style: TextStyle(fontSize: 12, color: c.mutedForeground)),
        );
    Widget option(String text, bool on, VoidCallback onTap, {bool pill = false}) => InkWell(
          borderRadius: BorderRadius.circular(pill ? 999 : WaygerzRadius.lg),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: pickDecoration(c, on, pill: pill),
            child: Text(text, style: TextStyle(fontSize: 14, color: on ? c.foreground : c.mutedForeground)),
          ),
        );
    const gap = SizedBox(height: 24);

    return Scaffold(
      appBar: const WaygerzHeader.page('Create a league'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [
        label('League type'),
        for (final t in _types)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: InkWell(
              borderRadius: BorderRadius.circular(WaygerzRadius.xl),
              onTap: () => setState(() => _type = t.$1),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: pickDecoration(c, _type == t.$1, radius: WaygerzRadius.xl),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(leagueTypeLabel(t.$1), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
                  const SizedBox(height: 4),
                  Text(t.$2, style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                ]),
              ),
            ),
          ),
        const SizedBox(height: 16),
        label('League name'),
        TextField(controller: _name, style: const TextStyle(fontSize: 16), decoration: const InputDecoration(hintText: 'Office NBA')),
        gap,
        label('Description (optional)'),
        TextField(
          controller: _description,
          minLines: 3,
          maxLines: 6,
          style: const TextStyle(fontSize: 16),
          decoration: const InputDecoration(hintText: "What's this league about? (shown on the invite page)"),
        ),
        gap,
        label('League logo (optional)'),
        Row(children: [
          _logo == null
              ? LeagueAvatar(name: _name.text.isEmpty ? 'New League' : _name.text, id: _name.text.isEmpty ? 'preview' : _name.text, size: 96)
              : ClipRRect(
                  borderRadius: BorderRadius.circular(WaygerzRadius.xl),
                  child: Image.memory(_logo!, width: 96, height: 96, fit: BoxFit.cover),
                ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 8, runSpacing: 8, children: [
                WzButton(label: _logo == null ? 'Upload image' : 'Change image', variant: ButtonVariant.outline, onPressed: _pickLogo),
                if (_logo != null)
                  WzButton(label: 'Remove', variant: ButtonVariant.ghost, onPressed: () => setState(() => _logo = null)),
              ]),
              hint('Square works best. Leave blank for a generated avatar.'),
            ]),
          ),
        ]),
        gap,
        label('Period'),
        Wrap(spacing: 8, children: [
          option('Season', _periodType == 'season', () => setState(() => _periodType = 'season')),
          option('Weekly', _periodType == 'weekly', () => setState(() => _periodType = 'weekly')),
        ]),
        const SizedBox(height: 12),
        if (_periodType == 'season') ...[
          label('Season year'),
          SizedBox(
            width: 160,
            child: TextField(controller: _year, keyboardType: TextInputType.number, style: const TextStyle(fontSize: 16)),
          ),
        ] else if (_type == 'pickem')
          // Pick'em weeks come from the sport's real schedule; a reset day would be ignored.
          hint('Weeks follow the sport’s real schedule (Week 1, Week 2, …).')
        else ...[
          label('Week resets on'),
          WzSelect<String>(
            width: 200,
            title: 'Week resets on',
            value: _weekStartsOn,
            options: [for (final d in _days) (value: d, label: '${d[0].toUpperCase()}${d.substring(1)}')],
            onChanged: (d) => setState(() => _weekStartsOn = d),
          ),
          hint('e.g. NFL weeks run Tuesday → Monday, so pick Tuesday.'),
        ],
        if (_isMoney) ...[
          gap,
          label(r'Starting balance per member ($)'),
          TextField(controller: _starting, keyboardType: TextInputType.number, style: const TextStyle(fontSize: 16)),
          hint('No personal wallet — this is each member’s only funds in the league.'),
        ],
        gap,
        label('Sports'),
        FutureBuilder<List<CatalogItem>>(
          future: _sports,
          builder: (context, snap) {
            if (snap.connectionState == ConnectionState.waiting) {
              return Text('Loading sports…', style: TextStyle(fontSize: 14, color: c.mutedForeground));
            }
            if (snap.hasError) {
              return Text('Couldn’t load sports: ${errorText(snap.error)}', style: TextStyle(fontSize: 14, color: c.destructive));
            }
            return Wrap(spacing: 8, runSpacing: 8, children: [
              for (final s in snap.data ?? const <CatalogItem>[])
                option(s.name, _activeSport == s.slug, () => setState(() {
                      _activeSport = s.slug;
                      _sportLeagues = _catalog.leagues(s.slug);
                    })),
            ]);
          },
        ),
        if (_sportLeagues != null) ...[
          const SizedBox(height: 8),
          FutureBuilder<List<CatalogItem>>(
            future: _sportLeagues,
            builder: (context, snap) {
              if (snap.connectionState == ConnectionState.waiting) {
                return Text('Loading leagues…', style: TextStyle(fontSize: 14, color: c.mutedForeground));
              }
              return Wrap(spacing: 8, runSpacing: 8, children: [
                for (final l in snap.data ?? const <CatalogItem>[]) _leagueChip(c, l),
              ]);
            },
          ),
        ],
        if (_chosen.isNotEmpty) ...[
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final ch in _chosen)
              Container(
                padding: const EdgeInsets.fromLTRB(14, 2, 2, 2),
                decoration: BoxDecoration(color: c.muted, borderRadius: BorderRadius.circular(999)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Text(ch.name, style: TextStyle(fontSize: 14, color: c.foreground)),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(LucideIcons.x, size: 14),
                    tooltip: 'Remove ${ch.name}',
                    onPressed: () => _toggle(ch.id, ch.name),
                  ),
                ]),
              ),
          ]),
        ],
        hint('The only games members can bet on.'),
        const SizedBox(height: 32),
        WzButton(
          label: _creating ? 'Creating…' : 'Create league',
          size: ButtonSize.lg,
          expand: true,
          busy: _creating,
          onPressed: _canSubmit && !_creating ? _create : null,
        ),
        const SizedBox(height: 8),
        WzButton(label: 'Cancel', size: ButtonSize.lg, expand: true, variant: ButtonVariant.ghost,
            onPressed: _creating ? null : () => Navigator.of(context).pop()),
      ]),
    );
  }

  Widget _leagueChip(WaygerzColors c, CatalogItem l) {
    final id = (l.sportLeagueId?.isNotEmpty ?? false) ? l.sportLeagueId! : l.id;
    final label = (l.abbreviation?.isNotEmpty ?? false) ? l.abbreviation! : l.name;
    final on = _chosen.any((ch) => ch.id == id);
    final onPrimary = Theme.of(context).colorScheme.onPrimary;
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: () => _toggle(id, label),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: on ? c.primary : Colors.transparent,
          border: Border.all(color: on ? c.primary : c.input),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (l.logo != null) ...[
            Image.network(l.logo!, width: 16, height: 16, errorBuilder: (context, error, stack) => const SizedBox.shrink()),
            const SizedBox(width: 6),
          ],
          Text(label, style: TextStyle(fontSize: 14, color: on ? onPrimary : c.mutedForeground)),
        ]),
      ),
    );
  }
}
