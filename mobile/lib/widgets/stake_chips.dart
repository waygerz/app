import 'package:flutter/material.dart';

import '../format.dart';
import '../theme/app_theme.dart';

/// The web's pick-cell states (_sections/shared.tsx STATE): selected = primary
/// border on a 10% primary fill; idle = input border, muted text.
BoxDecoration pickDecoration(WaygerzColors c, bool selected, {double radius = WaygerzRadius.lg, bool pill = false}) =>
    BoxDecoration(
      color: selected ? c.primary.withValues(alpha: 0.1) : Colors.transparent,
      border: Border.all(color: selected ? c.primary : c.input),
      borderRadius: BorderRadius.circular(pill ? 999 : radius),
    );

/// Stake presets offered next to the treat chip (web STAKE_PRESETS).
const stakePresets = [10, 20];

/// The amount row (web StakeChips): the bragging-rights treat chip ($0, loser
/// buys the round), $10 / $20, and "$" for a custom amount typed inline.
/// [dollars] is the stake as typed; '' while a custom amount is being entered.
class StakeChips extends StatefulWidget {
  const StakeChips({super.key, required this.dollars, required this.onDollars, required this.treat, required this.onTreat});
  final String dollars;
  final ValueChanged<String> onDollars;
  final String treat;
  final ValueChanged<String> onTreat;

  @override
  State<StakeChips> createState() => _StakeChipsState();
}

class _StakeChipsState extends State<StakeChips> {
  bool _customOpen = false;
  late final TextEditingController _amount = TextEditingController(text: widget.dollars);

  @override
  void didUpdateWidget(StakeChips old) {
    super.didUpdateWidget(old);
    // A chip tap changed the stake from outside the field: mirror it.
    if (widget.dollars != _amount.text) _amount.text = widget.dollars;
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final val = double.tryParse(widget.dollars.trim());
    final brag = widget.dollars.trim().isNotEmpty && val == 0;
    final isPreset = val != null && stakePresets.contains(val);
    final custom = _customOpen || (widget.dollars.trim().isNotEmpty && !brag && !isPreset);

    Widget chip(String label, bool on, VoidCallback onTap) => InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onTap,
          child: Container(
            height: 40,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            alignment: Alignment.center,
            decoration: pickDecoration(c, on, pill: true),
            child: Text(label, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600,
                color: on ? c.foreground : c.mutedForeground)),
          ),
        );

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Amount', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.foreground)),
      const SizedBox(height: 8),
      Row(children: [
        TreatPicker(
          value: widget.treat,
          selected: brag,
          onPick: (t) {
            setState(() => _customOpen = false);
            widget.onTreat(t);
            widget.onDollars('0');
          },
        ),
        const SizedBox(width: 8),
        for (final amt in stakePresets) ...[
          chip('\$$amt', !custom && val == amt, () {
            setState(() => _customOpen = false);
            widget.onDollars('$amt');
          }),
          const SizedBox(width: 8),
        ],
        chip('\$', custom, () {
          setState(() => _customOpen = true);
          widget.onDollars('');
        }),
        if (custom) ...[
          const SizedBox(width: 8),
          Expanded(
            child: SizedBox(
              height: 40,
              child: TextField(
                autofocus: widget.dollars.isEmpty,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                controller: _amount,
                onChanged: (v) => widget.onDollars(v.replaceAll(RegExp(r'[^\d.]'), '')),
                style: const TextStyle(fontSize: 14),
                decoration: InputDecoration(
                  hintText: 'Amount',
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: BorderSide(color: c.input)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: BorderSide(color: c.input)),
                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(999), borderSide: BorderSide(color: c.primary)),
                ),
              ),
            ),
          ),
        ],
      ]),
    ]);
  }
}

/// The bragging-rights chip (web TreatPicker): shows the chosen treat, and a
/// tap offers 🍺 beer or 🥃 shot — choosing one also selects the $0 stake.
class TreatPicker extends StatelessWidget {
  const TreatPicker({super.key, required this.value, required this.selected, required this.onPick});
  final String value;
  final bool selected;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    return PopupMenuButton<String>(
      tooltip: 'Bragging rights — loser buys the round',
      onSelected: onPick,
      color: c.card,
      shape: const StadiumBorder(),
      position: PopupMenuPosition.over,
      itemBuilder: (_) => [
        for (final t in const [('beer', 'Beer'), ('shot', 'Shot')])
          PopupMenuItem<String>(
            value: t.$1,
            child: Row(children: [
              Text(treatEmoji(t.$1), style: const TextStyle(fontSize: 22)),
              const SizedBox(width: 8),
              Text(t.$2),
            ]),
          ),
      ],
      child: Container(
        height: 40,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: pickDecoration(c, selected, pill: true),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Text(treatEmoji(value), style: const TextStyle(fontSize: 18)),
          const SizedBox(width: 2),
          Text('▾', style: TextStyle(fontSize: 10, color: c.mutedForeground)),
        ]),
      ),
    );
  }
}
