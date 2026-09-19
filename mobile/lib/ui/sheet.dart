import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/app_theme.dart';

/// The app's one sheet (web components/ui/app-sheet.tsx — change both
/// together): slides up from the bottom with a drag handle, a header — bold
/// title, optional description, and a close button or [action] — a scrolling
/// body, and an optional pinned [footer] (buttons, a composer). Keyboard-aware.
/// Use it for anything people read or fill in; short yes/no confirms stay
/// `confirmWz`. Returns what the sheet pops with.
///
/// [builder] is the body. With [scroll] (default) it's wrapped in a padded
/// scroll view; pass `scroll: false` when the body is its own list (it then
/// gets the remaining height and handles its own padding).
Future<T?> showWzSheet<T>(
  BuildContext context, {
  required String title,
  String? description,
  required WidgetBuilder builder,
  WidgetBuilder? footer,
  Widget? action,
  bool tall = false,
  bool scroll = true,
  bool hideHeader = false,
}) {
  return showWzSheetWith<T>(
    context,
    builder: (ctx) => WzSheet(
      title: title,
      description: description,
      footer: footer,
      action: action,
      tall: tall,
      scroll: scroll,
      hideHeader: hideHeader,
      child: Builder(builder: builder),
    ),
  );
}

/// Opens a sheet whose header or footer depends on its own state (a
/// multi-step picker, a composer): [builder] returns a stateful widget that
/// builds a [WzSheet]. Same presentation as [showWzSheet].
Future<T?> showWzSheetWith<T>(BuildContext context, {required WidgetBuilder builder}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: builder,
  );
}

/// The sheet's layout (header, body, footer); [showWzSheet] opens it. Public
/// for sheets that keep their own state around it (see [showWzSheetWith]).
class WzSheet extends StatelessWidget {
  const WzSheet({
    super.key,
    required this.title,
    required this.child,
    this.description,
    this.footer,
    this.action,
    this.tall = false,
    this.scroll = true,
    this.hideHeader = false,
  });

  final String title;
  final String? description;
  final Widget child;
  final WidgetBuilder? footer;
  final Widget? action;
  final bool tall;
  final bool scroll;
  final bool hideHeader;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final media = MediaQuery.of(context);
    Widget body = scroll
        ? SingleChildScrollView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), child: child)
        : child;
    // Clear the home indicator when nothing is pinned below the body.
    if (footer == null) body = SafeArea(top: false, child: body);
    final column = Column(mainAxisSize: tall ? MainAxisSize.max : MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (hideHeader)
        // The body has its own heading; keep the title for screen readers and
        // a visible close in the corner (web AppSheet does the same).
        Row(children: [
          Expanded(child: Semantics(header: true, label: title, child: const SizedBox.shrink())),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: IconButton(
              tooltip: 'Close',
              visualDensity: VisualDensity.compact,
              onPressed: () => Navigator.of(context).maybePop(),
              icon: Icon(LucideIcons.x, size: 20, color: c.mutedForeground),
            ),
          ),
        ])
      else
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 8, 12),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Semantics(
                  header: true,
                  child: Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.foreground)),
                ),
                if (description != null) ...[
                  const SizedBox(height: 2),
                  Text(description!, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
                ],
              ]),
            ),
            action ??
                IconButton(
                  tooltip: 'Close',
                  visualDensity: VisualDensity.compact,
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: Icon(LucideIcons.x, size: 20, color: c.mutedForeground),
                ),
          ]),
        ),
      if (tall) Expanded(child: body) else Flexible(child: body),
      if (footer != null)
        Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          decoration: BoxDecoration(border: Border(top: BorderSide(color: c.border))),
          child: SafeArea(top: false, child: footer!(context)),
        ),
    ]);
    // Sits above the keyboard; tall sheets are 85% of the screen, others fit
    // their content up to 90%.
    return Padding(
      padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
      child: tall
          ? SizedBox(height: media.size.height * 0.85, child: column)
          : ConstrainedBox(constraints: BoxConstraints(maxHeight: media.size.height * 0.9), child: column),
    );
  }
}
