import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Small shared UI bits used across screens.

/// Hash matching web/lib/leagues.ts `leagueColor` / lib/avatar.ts, so an id
/// gets the same color on both clients.
int _hash(String id) {
  var h = 0;
  for (final c in id.codeUnits) {
    h = (h * 31 + c) & 0xFFFFFFFF;
  }
  return h;
}

String initialsOf(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
  final s = parts.take(2).map((w) => w[0].toUpperCase()).join();
  return s.isEmpty ? '?' : s;
}

const _leaguePalette = [
  Color(0xFF6366F1), Color(0xFFEC4899), Color(0xFFF59E0B), Color(0xFF10B981),
  Color(0xFF3B82F6), Color(0xFFEF4444), Color(0xFF8B5CF6), Color(0xFF14B8A6),
];

/// League avatar as on the web: a 12px-rounded square in the league's hashed
/// color with white bold initials (logo/avatar-key resolution comes later).
class LeagueAvatar extends StatelessWidget {
  const LeagueAvatar({super.key, required this.name, this.id, this.size = 40});
  final String name;
  final String? id;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = _leaguePalette[_hash(id ?? name) % _leaguePalette.length];
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(size >= 32 ? WaygerzRadius.xl : WaygerzRadius.md),
      ),
      child: Text(
        initialsOf(name),
        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: size * 0.36),
      ),
    );
  }
}

/// User avatar fallback as on the web (lib/avatar.ts): initials in a hue, on a
/// 10% tint of the same hue, picked by hashing the user id.
class UserAvatar extends StatelessWidget {
  const UserAvatar({super.key, required this.userId, required this.name, this.size = 40});
  final String userId;
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final c = WaygerzColors.of(context);
    final hues = [
      c.destructive,
      c.primary,
      dark ? const Color(0xFFFFB900) : const Color(0xFFE17100), // amber
      dark ? const Color(0xFF05DF72) : const Color(0xFF00A63E), // green
      dark ? const Color(0xFF51A2FF) : const Color(0xFF155DFC), // blue
      dark ? const Color(0xFFA684FF) : const Color(0xFF7F22FE), // violet
      dark ? const Color(0xFFFF637E) : const Color(0xFFEC003F), // rose
      dark ? const Color(0xFF00D5BE) : const Color(0xFF009689), // teal
    ];
    final hue = hues[_hash(userId) % hues.length];
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: hue.withValues(alpha: 0.1), shape: BoxShape.circle),
      child: Text(
        initialsOf(name),
        style: TextStyle(color: hue, fontWeight: FontWeight.w600, fontSize: size * 0.38),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 48, color: Theme.of(context).colorScheme.outline),
        const SizedBox(height: 12),
        Text(label, style: Theme.of(context).textTheme.bodyMedium),
      ]),
    );
  }
}

class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ListView(children: [
      const SizedBox(height: 100),
      Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.error_outline, size: 40, color: Theme.of(context).colorScheme.error),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(message, textAlign: TextAlign.center),
          ),
          const SizedBox(height: 12),
          OutlinedButton(onPressed: onRetry, child: const Text('Retry')),
        ]),
      ),
    ]);
  }
}

/// A small status pill (open / accepted / settled / …).
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.label, this.color});
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? Theme.of(context).colorScheme.secondary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: c.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label, style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}
