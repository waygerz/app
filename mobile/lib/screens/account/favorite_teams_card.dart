import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/users_api.dart';
import '../../auth/auth_controller.dart';
import '../../models.dart';
import '../../theme/app_theme.dart';
import '../widgets.dart';

/// Favorite teams (web: components/account/favorite-teams-card.tsx). Loads the
/// authoritative list from the users service before allowing edits — saving
/// replaces the whole list, so editing a guessed-empty list would wipe it.
/// Edits apply optimistically and resync from the server on failure.
class FavoriteTeamsCard extends StatefulWidget {
  const FavoriteTeamsCard({super.key});

  @override
  State<FavoriteTeamsCard> createState() => _FavoriteTeamsCardState();
}

class _FavoriteTeamsCardState extends State<FavoriteTeamsCard> {
  late final UsersApi _users;
  List<FavoriteTeam>? _teams;
  bool _error = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _users = UsersApi(context.read<AuthController>().api);
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = false);
    try {
      final p = await _users.myProfile();
      if (mounted) setState(() => _teams = p.favoriteTeams);
    } catch (_) {
      if (mounted) setState(() => _error = true);
    }
  }

  Future<void> _persist(List<FavoriteTeam> next) async {
    final auth = context.read<AuthController>();
    setState(() {
      _teams = next;
      _saving = true;
    });
    try {
      await _users.saveFavorites(next);
      await auth.refreshProfile();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not save favorite teams')));
      }
      try {
        final p = await _users.myProfile();
        if (mounted) setState(() => _teams = p.favoriteTeams);
      } catch (_) {/* keep optimistic state */}
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _add(FavoriteTeam t) {
    final teams = _teams;
    if (teams == null || teams.length >= maxFavoriteTeams || teams.any((e) => e.sameAs(t))) return;
    _persist([...teams, t]);
  }

  void _remove(int i) => _persist([..._teams!]..removeAt(i));

  void _makePrimary(int i) {
    final teams = [..._teams!];
    final t = teams.removeAt(i);
    _persist([t, ...teams]);
  }

  Future<void> _openPicker() async {
    final picked = await showModalBottomSheet<FavoriteTeam>(
      context: context,
      isScrollControlled: true,
      builder: (_) => FractionallySizedBox(heightFactor: 0.85, child: _TeamPicker(existing: _teams ?? const [])),
    );
    if (picked != null) _add(picked);
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final teams = _teams;
    final full = teams != null && teams.length >= maxFavoriteTeams;

    return SectionCard(
      title: 'Favorite teams',
      trailing: teams == null
          ? null
          : Text('${teams.length}/$maxFavoriteTeams', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
      children: [
        if (teams == null)
          _error
              ? Row(children: [
                  Text('Couldn’t load your favorite teams. ', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
                  GestureDetector(
                    onTap: _load,
                    child: Text('Retry', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.primary)),
                  ),
                ])
              : const Center(child: Padding(padding: EdgeInsets.all(8), child: CircularProgressIndicator()))
        else if (teams.isEmpty)
          Text('Add up to $maxFavoriteTeams teams to show them on your profile.',
              style: TextStyle(fontSize: 14, color: c.mutedForeground))
        else
          DecoratedBox(
            decoration: BoxDecoration(border: Border(top: BorderSide(color: c.border))),
            child: Column(children: [
              for (var i = 0; i < teams.length; i++)
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
                  child: Row(children: [
                    TeamLogo(name: teams[i].name, abbreviation: teams[i].abbreviation, logo: teams[i].logo, color: teams[i].color),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(teams[i].name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                        Text(teams[i].league.toUpperCase(), style: TextStyle(fontSize: 12, color: c.mutedForeground)),
                      ]),
                    ),
                    if (i == 0)
                      Text('PRIMARY',
                          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: c.mutedForeground))
                    else
                      OutlinedButton.icon(
                        onPressed: _saving ? null : () => _makePrimary(i),
                        icon: const Icon(LucideIcons.star, size: 14),
                        label: const Text('Primary', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(44, 44),
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          foregroundColor: c.mutedForeground,
                          side: BorderSide(color: c.border),
                        ),
                      ),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 44,
                      height: 44,
                      child: OutlinedButton(
                        onPressed: _saving ? null : () => _remove(i),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(44, 44),
                          padding: EdgeInsets.zero,
                          foregroundColor: c.mutedForeground,
                          side: BorderSide(color: c.border),
                        ),
                        child: const Icon(LucideIcons.x, size: 16),
                      ),
                    ),
                  ]),
                ),
            ]),
          ),
        if (teams != null) ...[
          const SizedBox(height: 12),
          OutlinedButton(
            onPressed: _saving || full ? null : _openPicker,
            child: Text(full ? 'Maximum reached' : '+ Add team'),
          ),
        ],
      ],
    );
  }
}

/// Sport → league → team picker (web: components/team-picker.tsx), with a
/// search box on the team step. Pops the chosen team.
class _TeamPicker extends StatefulWidget {
  const _TeamPicker({required this.existing});
  final List<FavoriteTeam> existing;

  @override
  State<_TeamPicker> createState() => _TeamPickerState();
}

class _TeamPickerState extends State<_TeamPicker> {
  late final CatalogApi _catalog;
  CatalogItem? _sport;
  CatalogItem? _league;
  late Future<List<CatalogItem>> _sports;
  Future<List<CatalogItem>>? _leagues;
  Future<List<FavoriteTeam>>? _teams;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _catalog = CatalogApi(context.read<AuthController>().api);
    _sports = _catalog.sports();
  }

  void _back() => setState(() {
        if (_league != null) {
          _league = null;
          _teams = null;
          _query = '';
        } else {
          _sport = null;
          _leagues = null;
        }
      });

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final step = _league != null ? 2 : (_sport != null ? 1 : 0);
    final title = step == 0 ? 'Pick a sport' : (step == 1 ? _sport!.name : _league!.name);

    Widget list<T>(Future<List<T>>? future, Widget Function(T) row, {bool Function(T)? filter}) {
      return FutureBuilder<List<T>>(
        future: future,
        builder: (context, snap) {
          if (snap.hasError) {
            return Center(child: Text('Couldn’t load the catalog.', style: TextStyle(color: c.mutedForeground)));
          }
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final items = filter == null ? snap.data! : snap.data!.where(filter).toList();
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            itemCount: items.length,
            separatorBuilder: (context, i) => const SizedBox(height: 6),
            itemBuilder: (context, i) => row(items[i]),
          );
        },
      );
    }

    Widget tile(String label, VoidCallback onTap, {Widget? leading, Widget? trailing, bool enabled = true}) {
      return Material(
        color: c.muted.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(WaygerzRadius.md),
        child: InkWell(
          borderRadius: BorderRadius.circular(WaygerzRadius.md),
          onTap: enabled ? onTap : null,
          child: Container(
            constraints: const BoxConstraints(minHeight: 48),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(children: [
              if (leading != null) ...[leading, const SizedBox(width: 10)],
              Expanded(
                child: Text(label,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: enabled ? c.foreground : c.mutedForeground)),
              ),
              trailing ?? Icon(LucideIcons.chevronRight, size: 16, color: c.mutedForeground),
            ]),
          ),
        ),
      );
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(8, 0, 16, 8),
        child: Row(children: [
          if (step > 0) IconButton(onPressed: _back, icon: const Icon(LucideIcons.chevronLeft)) else const SizedBox(width: 8),
          Expanded(child: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600))),
        ]),
      ),
      if (step == 2)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: TextField(
            decoration: const InputDecoration(hintText: 'Search teams', prefixIcon: Icon(LucideIcons.search, size: 18)),
            onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
          ),
        ),
      Expanded(
        child: switch (step) {
          0 => list<CatalogItem>(_sports, (s) => tile(s.name, () => setState(() {
                    _sport = s;
                    _leagues = _catalog.leagues(s.slug);
                  }))),
          1 => list<CatalogItem>(_leagues, (l) => tile(l.name, () => setState(() {
                    _league = l;
                    _teams = _catalog.teams(_sport!.slug, l.slug);
                  }))),
          _ => list<FavoriteTeam>(
              _teams,
              (t) {
                final added = widget.existing.any((e) => e.sameAs(t));
                return tile(
                  t.name,
                  () => Navigator.of(context).pop(t),
                  enabled: !added,
                  leading: TeamLogo(name: t.name, abbreviation: t.abbreviation, logo: t.logo, color: t.color, size: 32),
                  trailing: added ? Icon(LucideIcons.check, size: 16, color: c.brand) : const SizedBox.shrink(),
                );
              },
              filter: (t) => _query.isEmpty || t.name.toLowerCase().contains(_query),
            ),
        },
      ),
    ]);
  }
}
