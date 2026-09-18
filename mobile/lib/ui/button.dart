import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

enum ButtonVariant { primary, secondary, outline, ghost, destructive }

enum ButtonSize { sm, md, lg }

/// The web `Button` (components/ui/button.tsx). On phones every size is at
/// least 48px tall (`min-h-12`); size changes the label (12 / 13 / 14px) and
/// padding. [dense] drops the 48px floor for buttons packed into a card cell
/// (the web's `h-9` action buttons). [busy] shows a spinner and disables.
class WzButton extends StatelessWidget {
  const WzButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = ButtonVariant.primary,
    this.size = ButtonSize.md,
    this.icon,
    this.busy = false,
    this.expand = false,
    this.dense = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final ButtonVariant variant;
  final ButtonSize size;
  final IconData? icon;
  final bool busy;
  final bool expand;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final onPrimary = Theme.of(context).colorScheme.onPrimary;
    final (Color bg, Color fg, BorderSide side) = switch (variant) {
      ButtonVariant.primary => (c.primary, onPrimary, BorderSide.none),
      ButtonVariant.secondary => (c.secondary, c.foreground, BorderSide.none),
      ButtonVariant.outline => (c.background, c.foreground, BorderSide(color: c.input)),
      ButtonVariant.ghost => (Colors.transparent, c.foreground, BorderSide.none),
      ButtonVariant.destructive => (c.destructive, Colors.white, BorderSide.none),
    };
    final fontSize = switch (size) { ButtonSize.sm => 12.0, ButtonSize.md => 13.0, ButtonSize.lg => 14.0 };
    final hPad = switch (size) { ButtonSize.sm => 10.0, ButtonSize.md => 12.0, ButtonSize.lg => 16.0 };
    final height = dense ? 36.0 : 48.0;
    final iconSize = size == ButtonSize.sm ? 14.0 : 16.0;
    final enabled = onPressed != null && !busy;

    final child = Row(mainAxisSize: MainAxisSize.min, mainAxisAlignment: MainAxisAlignment.center, children: [
      if (busy)
        SizedBox(width: iconSize, height: iconSize, child: CircularProgressIndicator(strokeWidth: 2, color: fg))
      else if (icon != null)
        Icon(icon, size: iconSize, color: fg),
      if (busy || icon != null) const SizedBox(width: 6),
      Flexible(
        child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w500, color: fg)),
      ),
    ]);

    final button = Opacity(
      opacity: enabled ? 1 : 0.6,
      child: Material(
        color: bg,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(WaygerzRadius.md), side: side),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: enabled ? onPressed : null,
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: height, minWidth: height),
            child: Padding(
              padding: EdgeInsets.symmetric(horizontal: hPad),
              child: Center(widthFactor: expand ? null : 1, child: child),
            ),
          ),
        ),
      ),
    );
    return expand ? SizedBox(width: double.infinity, child: button) : button;
  }
}
