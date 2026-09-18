import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

enum BadgeVariant { primary, secondary, success, warning, info, destructive }

enum BadgeAppearance { solid, light }

/// The web `Badge` (components/ui/badge.tsx) at the sizes the app uses:
/// `sm` (20px) and `md` (24px). `light` is the soft tinted look the app uses
/// for status (Draft, Open, Won/Lost); `solid` fills with the color.
class WzBadge extends StatelessWidget {
  const WzBadge(
    this.label, {
    super.key,
    this.variant = BadgeVariant.primary,
    this.appearance = BadgeAppearance.light,
    this.icon,
    this.small = true,
  });

  final String label;
  final BadgeVariant variant;
  final BadgeAppearance appearance;
  final IconData? icon;
  final bool small;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final hue = switch (variant) {
      BadgeVariant.primary => c.primary,
      BadgeVariant.secondary => c.foreground,
      BadgeVariant.success => c.success,
      BadgeVariant.warning => c.warning,
      BadgeVariant.info => c.info,
      BadgeVariant.destructive => c.destructive,
    };
    final Color bg;
    final Color fg;
    if (variant == BadgeVariant.secondary) {
      bg = appearance == BadgeAppearance.light && dark ? c.secondary.withValues(alpha: 0.5) : c.secondary;
      fg = c.foreground;
    } else if (appearance == BadgeAppearance.solid) {
      bg = hue;
      fg = Colors.white;
    } else {
      bg = hue.withValues(alpha: dark ? 0.2 : 0.12);
      fg = hue;
    }
    final height = small ? 20.0 : 24.0;
    final fontSize = small ? 11.0 : 12.0;
    return Container(
      height: height,
      constraints: BoxConstraints(minWidth: height),
      padding: EdgeInsets.symmetric(horizontal: small ? 5.2 : 7.2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(small ? WaygerzRadius.sm : WaygerzRadius.md),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, mainAxisAlignment: MainAxisAlignment.center, children: [
        if (icon != null) ...[
          Icon(icon, size: small ? 12 : 14, color: fg),
          const SizedBox(width: 4),
        ],
        Text(label, style: TextStyle(fontSize: fontSize, height: 1.1, fontWeight: FontWeight.w500, color: fg)),
      ]),
    );
  }
}

/// A round count badge (unread posts / notifications): red, white 11px/800.
class CountBadge extends StatelessWidget {
  const CountBadge(this.count, {super.key});
  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 20,
      constraints: const BoxConstraints(minWidth: 20),
      padding: const EdgeInsets.symmetric(horizontal: 6),
      alignment: Alignment.center,
      decoration: BoxDecoration(color: const Color(0xFFEF4444), borderRadius: BorderRadius.circular(10)),
      child: Text(count > 99 ? '99+' : '$count',
          style: const TextStyle(fontSize: 11, height: 1, fontWeight: FontWeight.w800, color: Colors.white)),
    );
  }
}
