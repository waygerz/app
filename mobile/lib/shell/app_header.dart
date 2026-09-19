import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../screens/widgets.dart';
import '../theme/app_theme.dart';
import 'profile_menu.dart';

/// The web's mobile top bar (components/shell/header.tsx + header-logo.tsx):
/// dark in both themes, 70px + safe area, a bottom border, and on the left the
/// Waygerz logo + page title — or, on a league page, the league avatar + name.
/// Pushed routes get a back chevron (the web relies on the browser for that).
/// The account menu (avatar) is always at the top right, as on the web.
class WaygerzHeader extends StatelessWidget implements PreferredSizeWidget {
  const WaygerzHeader({super.key, required this.title, this.leagueId, this.leagueLogo, this.leagueType, this.actions = const []});

  /// A plain page header with the logo.
  const WaygerzHeader.page(String title, {Key? key, List<Widget> actions = const []})
      : this(key: key, title: title, actions: actions);

  /// A league page header: the league's avatar, its type icon (swords =
  /// head-to-head, trophy = pick'em) and name.
  const WaygerzHeader.league(
      {Key? key, required String name, required String id, String? logo, String? type, List<Widget> actions = const []})
      : this(key: key, title: name, leagueId: id, leagueLogo: logo, leagueType: type, actions: actions);

  final String title;
  final String? leagueId;
  final String? leagueLogo;

  /// "pickem" or "head_to_head"; null until the league loads.
  final String? leagueType;
  final List<Widget> actions;

  @override
  Size get preferredSize => const Size.fromHeight(kHeaderHeight);

  @override
  Widget build(BuildContext context) {
    final canPop = ModalRoute.of(context)?.canPop ?? false;
    final top = MediaQuery.paddingOf(context).top;
    return Container(
      height: kHeaderHeight + top,
      padding: EdgeInsets.only(top: top, left: canPop ? 4 : 16, right: 8),
      decoration: BoxDecoration(
        color: WaygerzColors.of(context).headerBackground,
        border: Border(bottom: BorderSide(color: WaygerzColors.of(context).headerBorder)),
      ),
      child: Row(
        children: [
          if (canPop)
            IconButton(
              onPressed: () => Navigator.of(context).maybePop(),
              icon: const Icon(LucideIcons.chevronLeft, color: Colors.white),
              tooltip: 'Back',
            ),
          if (leagueId != null)
            LeagueAvatar(name: title, id: leagueId, logo: leagueLogo, size: 32)
          else
            ClipRRect(
              borderRadius: BorderRadius.circular(WaygerzRadius.md),
              child: Image.asset('assets/images/logo-64.png', width: 36, height: 36),
            ),
          const SizedBox(width: 8),
          if (leagueType != null) ...[
            Semantics(
              label: leagueType == 'pickem' ? "Pick'em" : 'Head-to-head',
              child: Icon(leagueType == 'pickem' ? LucideIcons.trophy : LucideIcons.swords,
                  size: 16, color: WaygerzColors.of(context).primary),
            ),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
            ),
          ),
          ...actions,
          const ProfileMenuButton(),
        ],
      ),
    );
  }
}
