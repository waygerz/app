import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// A bordered select (the web's Combobox / Select trigger): shows the current
/// label with a chevron; tapping opens a bottom sheet of the options.
class WzSelect<T> extends StatelessWidget {
  const WzSelect({
    super.key,
    required this.value,
    required this.options,
    required this.onChanged,
    this.title,
    this.width,
  });

  final T value;
  final List<({T value, String label})> options;
  final ValueChanged<T> onChanged;
  final String? title;
  final double? width;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final current = options.where((o) => o.value == value).map((o) => o.label).firstOrNull ?? '';
    return SizedBox(
      width: width,
      child: Material(
        color: c.background,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(WaygerzRadius.md),
          side: BorderSide(color: c.input),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () async {
            final picked = await showModalBottomSheet<T>(
              context: context,
              isScrollControlled: true,
              builder: (ctx) => _Options<T>(title: title, options: options, value: value),
            );
            if (picked != null && picked != value) onChanged(picked);
          },
          child: Container(
            height: 48,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(children: [
              Expanded(
                child: Text(current, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 14, color: c.foreground)),
              ),
              Icon(Icons.unfold_more, size: 16, color: c.mutedForeground),
            ]),
          ),
        ),
      ),
    );
  }
}

class _Options<T> extends StatelessWidget {
  const _Options({required this.title, required this.options, required this.value});
  final String? title;
  final List<({T value, String label})> options;
  final T value;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.7),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text(title!, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.foreground)),
          ),
        Flexible(
          child: ListView(shrinkWrap: true, padding: const EdgeInsets.only(bottom: 16), children: [
            for (final o in options)
              ListTile(
                title: Text(o.label, style: TextStyle(fontSize: 14,
                    fontWeight: o.value == value ? FontWeight.w600 : FontWeight.w400)),
                trailing: o.value == value ? Icon(Icons.check, size: 18, color: c.primary) : null,
                onTap: () => Navigator.of(context).pop(o.value),
              ),
          ]),
        ),
      ]),
    );
  }
}
