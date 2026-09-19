import 'package:flutter/material.dart';

import '../format.dart';
import '../screens/widgets.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';

/// A league's invite preview (the `/c/<code>` league card, web
/// components/league-invite-card.tsx): logo, name, type + members, who invited,
/// the description and the league's settings. Presentational — the /c screen
/// and the notification sheet add their own Join / Dismiss.
class LeagueInviteCard extends StatelessWidget {
  const LeagueInviteCard({super.key, required this.league});

  /// The resolved code's `preview` (the league).
  final Map<String, dynamic> league;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final lg = league;
    final name = (lg['name'] ?? '') as String;
    final type = (lg['league_type'] ?? '') as String;
    final members = (lg['member_count'] as int?) ?? 0;
    final rules = (lg['rules'] as Map?) ?? const {};
    final period = lg['period_type'] == 'season'
        ? 'Season${rules['season_year'] != null ? ' ${rules['season_year']}' : ''}'
        : 'Weekly${rules['week_starts_on'] != null ? ' · resets ${rules['week_starts_on']}' : ''}';
    final sports = [
      for (final s in (lg['sports'] as List<dynamic>?) ?? const []) ((s as Map)['name'] ?? s['sport_league_id']).toString()
    ];

    Widget row(String label, String value) => Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
            const SizedBox(height: 2),
            Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.foreground)),
          ]),
        );

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
      Center(child: LeagueAvatar(name: name, id: '${lg['id']}', logo: lg['logo_url'] as String?, size: 88)),
      const SizedBox(height: 12),
      Text(name, textAlign: TextAlign.center,
          style: TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: c.foreground)),
      const SizedBox(height: 4),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        WzBadge(leagueTypeLabel(type)),
        const SizedBox(width: 8),
        Text('$members member${members == 1 ? '' : 's'}', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
      ]),
      if (lg['commissioner_name'] != null) ...[
        const SizedBox(height: 8),
        Text.rich(TextSpan(children: [
          const TextSpan(text: 'Invited by '),
          TextSpan(text: '${lg['commissioner_name']}', style: TextStyle(fontWeight: FontWeight.w500, color: c.foreground)),
        ]), textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
      ],
      if ((lg['description'] ?? '').toString().isNotEmpty) ...[
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: c.muted.withValues(alpha: 0.5), borderRadius: BorderRadius.circular(WaygerzRadius.lg)),
          child: Text('${lg['description']}', style: TextStyle(fontSize: 14, color: c.foreground)),
        ),
      ],
      const SizedBox(height: 12),
      row('Period', period),
      if (type != 'pickem') row('Starting balance', formatCredits((lg['starting_balance_cents'] as int?) ?? 0)),
      if (lg['min_wager_cents'] != null) row('Min wager', formatCredits(lg['min_wager_cents'] as int)),
      if (lg['max_wager_cents'] != null) row('Max wager', formatCredits(lg['max_wager_cents'] as int)),
      if (sports.isNotEmpty) row('Sports', sports.join(', ')),
    ]);
  }
}
