import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../theme/app_theme.dart';
import 'button.dart';
import 'card.dart';

/// The text to show for a failed load: the server's `error`, else a generic line.
String errorText(Object? e) =>
    e is ApiException ? e.message : 'Something went wrong. Check your connection and try again.';

/// A failed load, never disguised as "empty" (web: "Couldn't load your …"):
/// red icon tile, title, reason, Try again.
class ErrorCard extends StatelessWidget {
  const ErrorCard({super.key, required this.title, required this.error, required this.onRetry});
  final String title;
  final Object? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return CenterCard(children: [
      IconTile(icon: Icons.error_outline, color: c.destructive),
      const SizedBox(height: 8),
      Text(title, textAlign: TextAlign.center,
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.foreground)),
      Text(errorText(error), textAlign: TextAlign.center, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
      const SizedBox(height: 8),
      WzButton(label: 'Try again', icon: Icons.refresh, variant: ButtonVariant.outline, onPressed: onRetry),
    ]);
  }
}

/// A 64px rounded-2xl tile with an icon, tinted from [color] (or a gradient).
class IconTile extends StatelessWidget {
  const IconTile({super.key, required this.icon, this.color, this.gradient, this.size = 64});
  final IconData icon;
  final Color? color;
  final Gradient? gradient;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: gradient == null ? (color ?? Colors.grey).withValues(alpha: 0.1) : null,
        gradient: gradient,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Icon(icon, size: size / 2, color: gradient == null ? color : Colors.white),
    );
  }
}

/// An inline warning row with a Retry (web: the failed-invites banner).
class NoticeBanner extends StatelessWidget {
  const NoticeBanner({super.key, required this.message, required this.onRetry, this.busy = false});
  final String message;
  final VoidCallback onRetry;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 4, 4, 4),
      decoration: BoxDecoration(
        color: c.destructive.withValues(alpha: 0.05),
        border: Border.all(color: c.destructive.withValues(alpha: 0.3)),
        borderRadius: BorderRadius.circular(WaygerzRadius.lg),
      ),
      child: Row(children: [
        Icon(Icons.error_outline, size: 16, color: c.destructive),
        const SizedBox(width: 8),
        Expanded(child: Text(message, style: TextStyle(fontSize: 14, color: c.mutedForeground))),
        WzButton(label: busy ? 'Retrying…' : 'Retry', size: ButtonSize.sm, variant: ButtonVariant.ghost,
            onPressed: busy ? null : onRetry),
      ]),
    );
  }
}
