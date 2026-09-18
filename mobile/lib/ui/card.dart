import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// The web `Card` (components/ui/card.tsx): card surface, 1px border, 12px
/// radius, a faint shadow. Tappable when [onTap] is set.
class WzCard extends StatelessWidget {
  const WzCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.color,
    this.borderColor,
    this.radius = WaygerzRadius.xl,
    this.clip = false,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;
  final Color? borderColor;
  final double radius;

  /// Clip children to the rounded shape (for edge bars / full-bleed images).
  final bool clip;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(radius),
      side: BorderSide(color: borderColor ?? c.border),
    );
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        boxShadow: const [BoxShadow(color: Color(0x0D000000), blurRadius: 2, offset: Offset(0, 1))],
      ),
      child: Material(
        color: color ?? c.card,
        shape: shape,
        clipBehavior: clip || onTap != null ? Clip.antiAlias : Clip.none,
        child: onTap == null
            ? Padding(padding: padding, child: child)
            : InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
      ),
    );
  }
}

/// The web `CenterCard`: a centered empty/notice card — icon, message, optional CTA.
class CenterCard extends StatelessWidget {
  const CenterCard({super.key, required this.children, this.padding = const EdgeInsets.all(24)});
  final List<Widget> children;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    return WzCard(
      padding: padding,
      child: SizedBox(
        width: double.infinity,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) const SizedBox(height: 8),
              children[i],
            ],
          ],
        ),
      ),
    );
  }
}
