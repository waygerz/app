import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class PillTab<T> {
  const PillTab(this.value, this.label, {this.count});
  final T value;
  final String label;

  /// Shown as "(n)" after the label when > 0 (the bets filters).
  final int? count;
}

/// The web's scrollable pill nav (league sections, bet filters): rounded-full
/// chips, 14px/500; the active one filled with primary. Swipes horizontally
/// when the pills overflow.
class PillTabs<T> extends StatelessWidget {
  const PillTabs({super.key, required this.tabs, required this.value, required this.onChanged, this.padding});
  final List<PillTab<T>> tabs;
  final T value;
  final ValueChanged<T> onChanged;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final onPrimary = Theme.of(context).colorScheme.onPrimary;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: padding,
      child: Row(children: [
        for (var i = 0; i < tabs.length; i++) ...[
          if (i > 0) const SizedBox(width: 8),
          _pill(c, onPrimary, tabs[i]),
        ],
      ]),
    );
  }

  Widget _pill(WaygerzColors c, Color onPrimary, PillTab<T> t) {
    final active = t.value == value;
    final fg = active ? onPrimary : c.mutedForeground;
    return Material(
      color: active ? c.primary : Colors.transparent,
      shape: StadiumBorder(side: BorderSide(color: active ? c.primary : c.input)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => onChanged(t.value),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Text.rich(TextSpan(children: [
            TextSpan(text: t.label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: fg)),
            if ((t.count ?? 0) > 0)
              TextSpan(
                text: '  (${t.count})',
                style: TextStyle(fontSize: 12, color: active ? onPrimary.withValues(alpha: 0.8) : c.mutedForeground),
              ),
          ])),
        ),
      ),
    );
  }
}

/// A compact segmented toggle (web: the Today / This week switch) — a pill
/// track with the active option filled in primary.
class WzSegmented<T> extends StatelessWidget {
  const WzSegmented({super.key, required this.options, required this.value, required this.onChanged});
  final List<({T value, String label})> options;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final onPrimary = Theme.of(context).colorScheme.onPrimary;
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(border: Border.all(color: c.input), borderRadius: BorderRadius.circular(999)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        for (final o in options)
          Material(
            color: o.value == value ? c.primary : Colors.transparent,
            shape: const StadiumBorder(),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: () => onChanged(o.value),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Text(o.label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500,
                    color: o.value == value ? onPrimary : c.mutedForeground)),
              ),
            ),
          ),
      ]),
    );
  }
}
