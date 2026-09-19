import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// A league section's heading: 16px/600 title, then one 12px muted line of
/// context. Every section uses it (web components/section-title.tsx matches).
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.subtitle});
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.foreground)),
      if (subtitle != null) ...[
        const SizedBox(height: 4),
        Text(subtitle!, style: TextStyle(fontSize: 12, color: c.mutedForeground)),
      ],
    ]);
  }
}
