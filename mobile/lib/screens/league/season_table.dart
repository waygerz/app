import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../api/api_client.dart';
import '../../api/leagues_api.dart';
import '../../auth/auth_controller.dart';
import '../../format.dart';
import '../../models.dart';
import '../../theme/app_theme.dart';
import '../../ui/ui.dart';
import '../widgets.dart';

/// The Standings tab's Overall chip (web _sections/season-table.tsx): the
/// season table — server rank, W–L, and balance + net for money leagues. The
/// Standings host renders the title; rebuild with a new key to reload.
class SeasonTable extends StatefulWidget {
  const SeasonTable({super.key, required this.api, required this.league});
  final ApiClient api;
  final League league;

  @override
  State<SeasonTable> createState() => _SeasonTableState();
}

class _SeasonTableState extends State<SeasonTable> {
  late Future<List<StandingRow>> _future = LeaguesApi(widget.api).standings(widget.league.id);

  void _retry() => setState(() => _future = LeaguesApi(widget.api).standings(widget.league.id));

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final me = context.read<AuthController>().user?.id;
    final roles = {for (final m in widget.league.members) m.userId: m.role};
    return FutureBuilder<List<StandingRow>>(
      future: _future,
      builder: (context, snap) {
        final rows = snap.data;
        if (rows == null && snap.connectionState == ConnectionState.waiting) {
          return Column(children: List.generate(4, (_) => const Padding(
                padding: EdgeInsets.only(bottom: 12),
                child: Skeleton(height: 80, radius: WaygerzRadius.xl),
              )));
        }
        if (snap.hasError) return ErrorCard(title: "Couldn't load the standings", error: snap.error, onRetry: _retry);
        if (rows!.isEmpty) {
          return CenterCard(children: [
            Icon(LucideIcons.trophy, size: 24, color: c.mutedForeground),
            Text('No standings yet.', style: TextStyle(fontSize: 14, color: c.mutedForeground)),
          ]);
        }
        return Column(children: [
          for (final r in rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _standingCard(c, r, isMe: r.userId == me, role: roles[r.userId] ?? 'member'),
            ),
        ]);
      },
    );
  }

  Widget _standingCard(WaygerzColors c, StandingRow r, {required bool isMe, required String role}) {
    final money = r.balanceCents != null;
    final net = r.netCents ?? 0;
    return WzCard(
      padding: const EdgeInsets.all(12),
      child: Row(children: [
        Container(
          width: 20,
          height: 20,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: c.muted, shape: BoxShape.circle),
          child: Text('${r.rank ?? ''}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: c.mutedForeground)),
        ),
        const SizedBox(width: 8),
        UserAvatar(userId: r.userId, name: r.displayName, avatarKey: r.avatarKey, size: 56),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text.rich(
              TextSpan(children: [
                TextSpan(text: r.displayName),
                if (isMe) TextSpan(text: ' (you)', style: TextStyle(fontWeight: FontWeight.w400, color: c.mutedForeground)),
              ]),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground),
            ),
            const SizedBox(height: 2),
            Text(memberRoleLabel(role), style: TextStyle(fontSize: 12, color: c.mutedForeground)),
          ]),
        ),
        if (money)
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(formatCredits(r.balanceCents!), style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
            Text('${net >= 0 ? '+' : ''}${formatCredits(net)} net',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: net >= 0 ? c.brand : c.destructive)),
          ])
        else
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(formatRecord(r.wins, r.losses, r.pushes),
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: c.foreground,
                    fontFeatures: const [FontFeature.tabularFigures()])),
            Text('W–L', style: TextStyle(fontSize: 12, color: c.mutedForeground)),
          ]),
      ]),
    );
  }
}
