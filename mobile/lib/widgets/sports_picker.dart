import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../api/api_client.dart';
import '../api/users_api.dart';
import '../models.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import 'stake_chips.dart';

/// The league sport-leagues picker (web create + manage): a sport's tabs,
/// then its leagues as toggles, then the chosen ones as removable chips.
/// Owns nothing but the catalog fetches — [chosen] lives with the caller.
class SportsPicker extends StatefulWidget {
  const SportsPicker({super.key, required this.api, required this.chosen, required this.onToggle});
  final ApiClient api;
  final List<({String id, String name})> chosen;
  final void Function(String id, String name) onToggle;

  @override
  State<SportsPicker> createState() => _SportsPickerState();
}

class _SportsPickerState extends State<SportsPicker> {
  late final CatalogApi _catalog = CatalogApi(widget.api);
  late final Future<List<CatalogItem>> _sports = _catalog.sports();
  String _active = '';
  Future<List<CatalogItem>>? _leagues;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final onPrimary = Theme.of(context).colorScheme.onPrimary;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
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
              InkWell(
                borderRadius: BorderRadius.circular(WaygerzRadius.lg),
                onTap: () => setState(() {
                  _active = s.slug;
                  _leagues = _catalog.leagues(s.slug);
                }),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: pickDecoration(c, _active == s.slug),
                  child: Text(s.name, style: TextStyle(fontSize: 14, color: _active == s.slug ? c.foreground : c.mutedForeground)),
                ),
              ),
          ]);
        },
      ),
      if (_leagues != null) ...[
        const SizedBox(height: 8),
        FutureBuilder<List<CatalogItem>>(
          future: _leagues,
          builder: (context, snap) {
            if (snap.connectionState == ConnectionState.waiting) {
              return Text('Loading leagues…', style: TextStyle(fontSize: 14, color: c.mutedForeground));
            }
            return Wrap(spacing: 8, runSpacing: 8, children: [
              for (final l in snap.data ?? const <CatalogItem>[]) _chip(c, onPrimary, l),
            ]);
          },
        ),
      ],
      if (widget.chosen.isNotEmpty) ...[
        const SizedBox(height: 12),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final ch in widget.chosen)
            Container(
              padding: const EdgeInsets.fromLTRB(14, 2, 2, 2),
              decoration: BoxDecoration(color: c.muted, borderRadius: BorderRadius.circular(999)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text(ch.name, style: TextStyle(fontSize: 14, color: c.foreground)),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(LucideIcons.x, size: 14),
                  tooltip: 'Remove ${ch.name}',
                  onPressed: () => widget.onToggle(ch.id, ch.name),
                ),
              ]),
            ),
        ]),
      ],
      Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Text('The only games members can bet on.', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
      ),
    ]);
  }

  Widget _chip(WaygerzColors c, Color onPrimary, CatalogItem l) {
    final id = (l.sportLeagueId?.isNotEmpty ?? false) ? l.sportLeagueId! : l.id;
    final label = (l.abbreviation?.isNotEmpty ?? false) ? l.abbreviation! : l.name;
    final on = widget.chosen.any((ch) => ch.id == id);
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: () => widget.onToggle(id, label),
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
