import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../auth/auth_controller.dart';
import '../screens/account/account_screen.dart';
import '../screens/friends_screen.dart';
import '../screens/widgets.dart';
import '../theme/app_theme.dart';

/// The account menu at the top right of the header (web components/shell/
/// profile-menu.tsx): identity, Account, Friends, dark/light mode, Sign out.
class ProfileMenuButton extends StatelessWidget {
  const ProfileMenuButton({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final user = auth.user;
    if (user == null) return const SizedBox.shrink();
    final c = WaygerzColors.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;

    return PopupMenuButton<String>(
      tooltip: 'Account menu',
      color: c.card,
      position: PopupMenuPosition.under,
      offset: const Offset(0, 8),
      constraints: const BoxConstraints(minWidth: 224),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(WaygerzRadius.lg),
        side: BorderSide(color: c.border),
      ),
      onSelected: (action) async {
        final nav = Navigator.of(context);
        switch (action) {
          case 'account':
            nav.push(MaterialPageRoute<void>(builder: (_) => const AccountScreen()));
          case 'friends':
            nav.push(MaterialPageRoute<void>(builder: (_) => FriendsScreen(api: auth.api)));
          case 'theme':
            final appearance = context.read<AppearanceController>();
            await appearance.update(appearance.value.copyWith(mode: dark ? ThemeMode.light : ThemeMode.dark));
          case 'signout':
            nav.popUntil((r) => r.isFirst);
            await auth.logout();
        }
      },
      itemBuilder: (_) => [
        PopupMenuItem<String>(
          enabled: false,
          child: Row(children: [
            UserAvatar(userId: user.id, name: user.displayName, avatarKey: user.avatarKey, size: 40),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(user.displayName, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: c.foreground)),
                if (user.phone.isNotEmpty) Text(user.phone, style: TextStyle(fontSize: 12, color: c.mutedForeground)),
              ]),
            ),
          ]),
        ),
        const PopupMenuDivider(),
        _item(c, 'account', LucideIcons.userRound, 'Account'),
        _item(c, 'friends', LucideIcons.users, 'Friends'),
        _item(c, 'theme', dark ? LucideIcons.sun : LucideIcons.moon, dark ? 'Light mode' : 'Dark mode'),
        const PopupMenuDivider(),
        _item(c, 'signout', LucideIcons.logOut, 'Sign out'),
      ],
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: UserAvatar(userId: user.id, name: user.displayName, avatarKey: user.avatarKey, size: 32),
      ),
    );
  }

  PopupMenuItem<String> _item(WaygerzColors c, String value, IconData icon, String label) => PopupMenuItem<String>(
        value: value,
        height: 44,
        child: Row(children: [
          Icon(icon, size: 16, color: c.foreground),
          const SizedBox(width: 10),
          Text(label, style: TextStyle(fontSize: 14, color: c.foreground)),
        ]),
      );
}
