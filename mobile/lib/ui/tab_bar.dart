import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'pill_tabs.dart';

/// Section navigation (web leagues/[id]/layout.tsx tab bar): text tabs with an
/// underline under the active one, a bottom border across the width, and 44px
/// tall targets. Swipes sideways when the tabs overflow and keeps the active
/// tab in view. Filters use chips and toggles use `WzSegmented`, not this.
class WzTabBar<T> extends StatefulWidget {
  const WzTabBar({super.key, required this.tabs, required this.value, required this.onChanged});
  final List<PillTab<T>> tabs;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  State<WzTabBar<T>> createState() => _WzTabBarState<T>();
}

class _WzTabBarState<T> extends State<WzTabBar<T>> {
  final _activeKey = GlobalKey();

  void _reveal() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ctx = _activeKey.currentContext;
      if (ctx != null) Scrollable.ensureVisible(ctx, alignment: 0.5, duration: const Duration(milliseconds: 200));
    });
  }

  @override
  void initState() {
    super.initState();
    _reveal();
  }

  @override
  void didUpdateWidget(WzTabBar<T> old) {
    super.didUpdateWidget(old);
    if (old.value != widget.value) _reveal();
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return Container(
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: c.border))),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Row(children: [
          for (var i = 0; i < widget.tabs.length; i++) ...[
            if (i > 0) const SizedBox(width: 20),
            _tab(c, widget.tabs[i]),
          ],
        ]),
      ),
    );
  }

  Widget _tab(WaygerzColors c, PillTab<T> t) {
    final active = t.value == widget.value;
    return Semantics(
      selected: active,
      button: true,
      child: InkWell(
        key: active ? _activeKey : null,
        onTap: () => widget.onChanged(t.value),
        child: Container(
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: active ? c.primary : Colors.transparent, width: 2)),
          ),
          child: Text(t.label,
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: active ? c.foreground : c.mutedForeground)),
        ),
      ),
    );
  }
}
