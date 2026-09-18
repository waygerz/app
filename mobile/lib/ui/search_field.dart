import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// The web `ListSearch`: a 44px, 12px-rounded search box with a leading
/// search icon and a clear button.
class SearchField extends StatefulWidget {
  const SearchField({super.key, required this.onChanged, this.hint = 'Search'});
  final ValueChanged<String> onChanged;
  final String hint;

  @override
  State<SearchField> createState() => _SearchFieldState();
}

class _SearchFieldState extends State<SearchField> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(WaygerzRadius.xl),
      borderSide: BorderSide(color: c.input),
    );
    return SizedBox(
      height: 44,
      child: TextField(
        controller: _text,
        onChanged: (v) {
          setState(() {});
          widget.onChanged(v);
        },
        textInputAction: TextInputAction.search,
        style: const TextStyle(fontSize: 16),
        decoration: InputDecoration(
          hintText: widget.hint,
          isDense: true,
          contentPadding: EdgeInsets.zero,
          prefixIcon: Icon(Icons.search, size: 16, color: c.mutedForeground),
          suffixIcon: _text.text.isEmpty
              ? null
              : IconButton(
                  icon: Icon(Icons.close, size: 16, color: c.mutedForeground),
                  tooltip: 'Clear search',
                  onPressed: () {
                    _text.clear();
                    setState(() {});
                    widget.onChanged('');
                  },
                ),
          border: border,
          enabledBorder: border,
          focusedBorder: border.copyWith(borderSide: BorderSide(color: c.primary, width: 1.5)),
        ),
      ),
    );
  }
}

/// A 44px bordered icon button opening a radio menu (web BetSortMenu).
class OptionMenuButton<T> extends StatelessWidget {
  const OptionMenuButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.title,
    required this.options,
    required this.value,
    required this.onChanged,
  });

  final IconData icon;
  final String tooltip;
  final String title;
  final Map<T, String> options;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return PopupMenuButton<T>(
      tooltip: tooltip,
      initialValue: value,
      onSelected: onChanged,
      color: c.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(WaygerzRadius.lg),
        side: BorderSide(color: c.border),
      ),
      itemBuilder: (_) => [
        PopupMenuItem<T>(
          enabled: false,
          height: 32,
          child: Text(title, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.mutedForeground)),
        ),
        for (final e in options.entries)
          PopupMenuItem<T>(
            value: e.key,
            height: 40,
            child: Row(children: [
              SizedBox(width: 20, child: e.key == value ? Icon(Icons.check, size: 16, color: c.primary) : null),
              const SizedBox(width: 6),
              Text(e.value, style: const TextStyle(fontSize: 14)),
            ]),
          ),
      ],
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: c.background,
          border: Border.all(color: c.input),
          borderRadius: BorderRadius.circular(WaygerzRadius.xl),
        ),
        child: Icon(icon, size: 16, color: c.mutedForeground),
      ),
    );
  }
}
