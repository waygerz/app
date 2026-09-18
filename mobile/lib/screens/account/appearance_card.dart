import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:provider/provider.dart';

import '../../theme/app_theme.dart';
import '../widgets.dart';

/// Appearance (web: components/theme/color-picker.tsx + surface-picker.tsx):
/// primary and accent colors and the dark shade, saved on this device — plus
/// the light/dark/system mode the web gets from the browser.
class AppearanceCard extends StatelessWidget {
  const AppearanceCard({super.key});

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final ctrl = context.watch<AppearanceController>();
    final a = ctrl.value;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final label = TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: c.foreground);

    Widget hues(Hue selected, ValueChanged<Hue> onPick) => Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final h in Hue.values)
              Tooltip(
                message: h.label,
                child: InkResponse(
                  onTap: () => onPick(h),
                  radius: 24,
                  child: Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: h.shade(dark),
                      shape: BoxShape.circle,
                      border: Border.all(color: h == selected ? c.foreground : Colors.transparent, width: 2),
                    ),
                    child: h == selected ? Icon(LucideIcons.check, size: 16, color: h.onColor) : null,
                  ),
                ),
              ),
          ],
        );

    return SectionCard(
      title: 'Appearance',
      description: 'Colors and dark shade. Applies across the app on this device.',
      children: [
        Text('Theme', style: label),
        const SizedBox(height: 8),
        SegmentedButton<ThemeMode>(
          showSelectedIcon: false,
          segments: const [
            ButtonSegment(value: ThemeMode.system, label: Text('System'), icon: Icon(LucideIcons.smartphone, size: 16)),
            ButtonSegment(value: ThemeMode.light, label: Text('Light'), icon: Icon(LucideIcons.sun, size: 16)),
            ButtonSegment(value: ThemeMode.dark, label: Text('Dark'), icon: Icon(LucideIcons.moon, size: 16)),
          ],
          selected: {a.mode},
          onSelectionChanged: (s) => ctrl.update(a.copyWith(mode: s.first)),
        ),
        const SizedBox(height: 16),
        Text('Primary color', style: label),
        const SizedBox(height: 8),
        hues(a.primary, (h) => ctrl.update(a.copyWith(primary: h))),
        const SizedBox(height: 16),
        Text('Accent color', style: label),
        const SizedBox(height: 8),
        hues(a.accent, (h) => ctrl.update(a.copyWith(accent: h))),
        const SizedBox(height: 16),
        Divider(color: c.border),
        const SizedBox(height: 16),
        Text('Dark shade', style: label),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final s in Surface.values)
            ChoiceChip(
              label: Text(s.label),
              selected: s == a.surface,
              showCheckmark: false,
              avatar: Container(
                width: 14,
                height: 14,
                decoration: BoxDecoration(
                  color: s.tokens.card,
                  shape: BoxShape.circle,
                  border: Border.all(color: s.tokens.border),
                ),
              ),
              labelStyle: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: s == a.surface ? a.primary.onColor : c.foreground,
              ),
              onSelected: (_) => ctrl.update(a.copyWith(surface: s)),
            ),
        ]),
      ],
    );
  }
}
