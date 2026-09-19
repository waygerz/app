import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../api/api_client.dart';
import '../api/wagers_api.dart';
import '../models.dart';
import '../screens/widgets.dart';
import '../theme/app_theme.dart';
import '../ui/ui.dart';
import '../wagers.dart';
import 'stake_chips.dart';

/// Open the counter editor for an open bet (web components/counter-dialog.tsx).
/// Resolves true when a counter was sent.
Future<bool> showCounterSheet(BuildContext context, {required ApiClient api, required Wager wager, required String me}) async {
  final sent = await showWzSheet<bool>(
    context,
    title: 'Counter offer',
    builder: (_) => _CounterSheet(api: api, wager: wager, me: me),
  );
  return sent ?? false;
}

/// Your side on top with the original line for reference, the ± line adjuster
/// (your perspective; the server normalizes it), and the amount row.
class _CounterSheet extends StatefulWidget {
  const _CounterSheet({required this.api, required this.wager, required this.me});
  final ApiClient api;
  final Wager wager;
  final String me;

  @override
  State<_CounterSheet> createState() => _CounterSheetState();
}

class _CounterSheetState extends State<_CounterSheet> {
  late final Wager w = widget.wager;
  late final String _mySide = viewerSide(w, widget.me);
  late final bool _hasLine = w.betType == 'spread' || w.betType == 'total';
  late final bool _isTotal = w.betType == 'total';
  late final double? _origLine = lineForSide(w, _mySide);

  late String _dollars = centsToDollars(w.amountCents);
  late double? _line = _origLine;
  late String _treat = w.treat == 'shot' ? 'shot' : 'beer';
  bool _sending = false;

  Future<void> _send(int cents) async {
    final toast = Toaster.of(context);
    final nav = Navigator.of(context);
    setState(() => _sending = true);
    try {
      await WagersApi(widget.api).counter(
        w.id,
        amountCents: cents,
        line: _hasLine ? _line : null,
        treat: cents == 0 ? _treat : null,
      );
      toast.success('Counter sent');
      nav.pop(true);
    } catch (e) {
      toast.failure(e);
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = WaygerzColors.of(context);
    final iAmProposer = w.proposerId == widget.me;
    final otherName = iAmProposer ? w.acceptorName : w.proposerName;
    final otherId = iAmProposer ? w.acceptorId : w.proposerId;
    final otherAvatar = iAmProposer ? w.acceptorAvatarKey : w.proposerAvatarKey;
    final myTeam = _mySide == 'home' ? w.homeTeam : w.awayTeam;
    final myLabel = _isTotal ? (_mySide == 'over' ? 'Over' : 'Under') : myTeam;

    final cents = parseStakeCents(_dollars);
    final unchanged = cents == w.amountCents &&
        (!_hasLine || _line == _origLine) &&
        (cents != 0 || _treat == (w.treat ?? 'beer'));
    final invalid = cents == null || (_hasLine && _line == null);

    Widget stepper(IconData icon, String label, double delta) => Semantics(
          label: label,
          button: true,
          child: InkWell(
            borderRadius: BorderRadius.circular(WaygerzRadius.md),
            onTap: () => setState(() => _line = (_line ?? 0) + delta),
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: c.background,
                border: Border.all(color: c.border),
                borderRadius: BorderRadius.circular(WaygerzRadius.md),
              ),
              child: Icon(icon, size: 16, color: c.foreground),
            ),
          ),
        );

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            UserAvatar(userId: otherId, name: otherName, avatarKey: otherAvatar, size: 44),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(otherName, maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.foreground)),
                Text('COUNTERING THEIR BET',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w500, letterSpacing: 0.5, color: c.mutedForeground)),
              ]),
            ),
          ]),
          const SizedBox(height: 16),
          // Your side, with the original line kept for reference.
          Container(
            height: 48,
            padding: const EdgeInsets.symmetric(horizontal: 10),
            decoration: BoxDecoration(
              color: Tw.blue500.withValues(alpha: 0.15),
              border: Border.all(color: Tw.blue500.withValues(alpha: 0.28)),
              borderRadius: BorderRadius.circular(WaygerzRadius.md),
            ),
            child: Row(children: [
              if (_isTotal)
                Container(
                  width: 24,
                  height: 24,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: c.secondary, shape: BoxShape.circle, border: Border.all(color: c.border)),
                  child: Text('O/U', style: TextStyle(fontSize: 8, fontWeight: FontWeight.w700, color: c.mutedForeground)),
                )
              else
                TeamLogo(name: myTeam, abbreviation: '', size: 24),
              const SizedBox(width: 10),
              Expanded(child: Text(myLabel, maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: c.foreground))),
              if (_hasLine)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.2),
                    border: Border.all(color: c.border),
                    borderRadius: BorderRadius.circular(WaygerzRadius.md),
                  ),
                  child: Text(lineStr(w.betType, _origLine),
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: c.mutedForeground)),
                ),
            ]),
          ),
          if (_hasLine) ...[
            const SizedBox(height: 6),
            Container(
              height: 48,
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(color: c.muted.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(WaygerzRadius.md)),
              child: Row(children: [
                stepper(LucideIcons.minus, _isTotal ? 'Lower the total' : 'Lower the spread', -0.5),
                Expanded(
                  child: Text(lineStr(w.betType, _line), textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700,
                          color: _line != _origLine ? c.brand : c.foreground)),
                ),
                stepper(LucideIcons.plus, _isTotal ? 'Raise the total' : 'Raise the spread', 0.5),
              ]),
            ),
          ],
          const SizedBox(height: 16),
          StakeChips(
            dollars: _dollars,
            onDollars: (v) => setState(() => _dollars = v),
            treat: _treat,
            onTreat: (t) => setState(() => _treat = t),
          ),
          const SizedBox(height: 20),
          WzButton(
            label: _sending ? 'Sending…' : 'Send counter',
            expand: true,
            busy: _sending,
            onPressed: _sending || invalid || unchanged ? null : () => _send(cents),
          ),
          const SizedBox(height: 8),
          WzButton(label: 'Cancel', expand: true, variant: ButtonVariant.outline,
              onPressed: _sending ? null : () => Navigator.of(context).pop(false)),
        ]);
  }
}
