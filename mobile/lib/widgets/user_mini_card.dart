import 'package:flutter/material.dart';

import '../screens/widgets.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';

/// A person row (web components/user-mini-card.tsx on a phone): avatar,
/// name (+ badge), subtitle, and actions on the right.
class UserMiniCard extends StatelessWidget {
  const UserMiniCard({
    super.key,
    required this.userId,
    required this.name,
    this.avatarKey,
    this.subtitle,
    this.badge,
    this.actions = const [],
  });

  final String userId;
  final String name;
  final String? avatarKey;
  final String? subtitle;
  final Widget? badge;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return WzCard(
      padding: const EdgeInsets.all(12),
      child: Row(children: [
        UserAvatar(userId: userId, name: name, avatarKey: avatarKey, size: 48),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Flexible(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.foreground))),
              if (badge != null) ...[const SizedBox(width: 6), badge!],
            ]),
            if (subtitle != null)
              Text(subtitle!, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: c.mutedForeground)),
          ]),
        ),
        for (var i = 0; i < actions.length; i++) ...[if (i > 0) const SizedBox(width: 8) else const SizedBox(width: 8), actions[i]],
      ]),
    );
  }
}

/// A 40px bordered icon button for card actions (web `Button size="sm" variant="outline"`, icon-only on phones).
class IconAction extends StatelessWidget {
  const IconAction({super.key, required this.icon, required this.tooltip, required this.onPressed, this.color});
  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return Tooltip(
      message: tooltip,
      child: Material(
        color: c.background,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(WaygerzRadius.md), side: BorderSide(color: c.input)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onPressed,
          child: SizedBox(
            width: 40,
            height: 40,
            child: Opacity(opacity: onPressed == null ? 0.6 : 1, child: Icon(icon, size: 16, color: color ?? c.foreground)),
          ),
        ),
      ),
    );
  }
}
