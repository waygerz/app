import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/app_theme.dart';

/// One bottom-nav destination. [avatar] replaces the icon (the Profile tab).
class NavItem {
  const NavItem({required this.label, this.icon, this.avatar, this.badge = 0});
  final String label;
  final IconData? icon;
  final Widget? avatar;
  final int badge;
}

/// The web's mobile bottom bar (components/shell/bottom-nav.tsx): background at
/// 95% with a blur, top border, 24px lucide icons over 11px/500 labels, active =
/// primary icon + foreground label, red "9+"-capped unread badges.
class WaygerzBottomNav extends StatelessWidget {
  const WaygerzBottomNav({super.key, required this.items, required this.index, required this.onTap});
  final List<NavItem> items;
  final int index;
  final ValueChanged<int> onTap;

  static const leagues = LucideIcons.house;
  static const bets = LucideIcons.ticket;
  static const alerts = LucideIcons.bell;
  static const messages = LucideIcons.messageCircle;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final bottom = MediaQuery.paddingOf(context).bottom;
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 4, sigmaY: 4),
        child: Container(
          padding: EdgeInsets.only(bottom: bottom),
          decoration: BoxDecoration(
            color: c.background.withValues(alpha: 0.95),
            border: Border(top: BorderSide(color: c.border)),
          ),
          child: SizedBox(
            height: kBottomNavHeight,
            child: Row(
              children: [
                for (var i = 0; i < items.length; i++)
                  Expanded(child: _Tab(item: items[i], active: i == index, onTap: () => onTap(i))),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  const _Tab({required this.item, required this.active, required this.onTap});
  final NavItem item;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final icon = item.avatar ??
        Icon(item.icon, size: 24, color: active ? c.primary : c.mutedForeground);
    return InkResponse(
      onTap: onTap,
      radius: 32,
      child: Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 4),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                SizedBox(width: 24, height: 24, child: Center(child: icon)),
                if (item.badge > 0)
                  PositionedDirectional(
                    top: -4,
                    end: -6,
                    child: _Badge(count: item.badge),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              item.label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                // The Profile tab's label always stays muted, as on the web.
                color: active && item.avatar == null ? c.foreground : c.mutedForeground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return Container(
      constraints: const BoxConstraints(minWidth: 16),
      height: 16,
      padding: const EdgeInsets.symmetric(horizontal: 4),
      alignment: Alignment.center,
      decoration: BoxDecoration(color: c.destructive, borderRadius: BorderRadius.circular(8)),
      child: Text(
        count > 9 ? '9+' : '$count',
        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w600, height: 1),
      ),
    );
  }
}
