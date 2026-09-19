import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../theme/app_theme.dart';

class WeekChip<T> {
  const WeekChip(this.value, this.label, this.title, {this.overall = false});
  final T value;

  /// Short label on the chip (HF, P1, W2, …).
  final String label;

  /// The full name, for screen readers ("Preseason Week 1").
  final String title;

  /// The season-wide chip (Standings' "Overall"): trophy + a primary outline,
  /// so it doesn't read as another week.
  final bool overall;
}

/// The week picker (web components/week-chips.tsx): small pill buttons that
/// scroll sideways, the selected week kept in view.
class WeekChips<T> extends StatefulWidget {
  const WeekChips({super.key, required this.weeks, required this.value, required this.onChanged});
  final List<WeekChip<T>> weeks;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  State<WeekChips<T>> createState() => _WeekChipsState<T>();
}

class _WeekChipsState<T> extends State<WeekChips<T>> {
  final _selected = GlobalKey();

  @override
  void initState() {
    super.initState();
    _reveal();
  }

  @override
  void didUpdateWidget(WeekChips<T> old) {
    super.didUpdateWidget(old);
    if (old.value != widget.value) _reveal();
  }

  void _reveal() => WidgetsBinding.instance.addPostFrameCallback((_) {
        final ctx = _selected.currentContext;
        if (ctx != null) Scrollable.ensureVisible(ctx, alignment: 0.5, duration: const Duration(milliseconds: 200));
      });

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final onPrimary = Theme.of(context).colorScheme.onPrimary;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(children: [
        for (var i = 0; i < widget.weeks.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          _chip(c, onPrimary, widget.weeks[i]),
        ],
      ]),
    );
  }

  Widget _chip(WaygerzColors c, Color onPrimary, WeekChip<T> w) {
    final on = w.value == widget.value;
    return Semantics(
      label: w.title,
      selected: on,
      button: true,
      child: Material(
        key: on ? _selected : null,
        color: on ? c.primary : Colors.transparent,
        shape: StadiumBorder(side: BorderSide(
            color: on ? c.primary : w.overall ? c.primary.withValues(alpha: 0.6) : c.input)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => widget.onChanged(w.value),
          child: Container(
            height: 32,
            constraints: const BoxConstraints(minWidth: 40),
            padding: const EdgeInsets.symmetric(horizontal: 10),
            alignment: Alignment.center,
            child: ExcludeSemantics(
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                if (w.overall) ...[
                  Icon(LucideIcons.trophy, size: 14, color: on ? onPrimary : c.primary),
                  const SizedBox(width: 4),
                ],
                Text(w.label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                    color: on ? onPrimary : w.overall ? c.primary : c.mutedForeground)),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
