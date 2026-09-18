import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'button.dart';

/// The web `Dialog`: a centered card (12px radius, 24px padding) with a close
/// button. Returns what the dialog pops with.
Future<T?> showWzDialog<T>(BuildContext context, {required WidgetBuilder builder}) {
  return showDialog<T>(
    context: context,
    builder: (ctx) {
      final c = WaygerzColors.of(ctx);
      return Dialog(
        backgroundColor: c.card,
        surfaceTintColor: Colors.transparent,
        insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(WaygerzRadius.xl),
          side: BorderSide(color: c.border),
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 512),
          child: Stack(children: [
            SingleChildScrollView(padding: const EdgeInsets.all(24), child: builder(ctx)),
            Positioned(
              top: 4,
              right: 4,
              child: IconButton(
                icon: Icon(Icons.close, size: 18, color: c.mutedForeground),
                tooltip: 'Close',
                onPressed: () => Navigator.of(ctx).pop(),
              ),
            ),
          ]),
        ),
      );
    },
  );
}

/// The web `AlertDialog` confirm: title, description, Cancel + action.
/// Resolves true only when the action is chosen.
Future<bool> confirmWz(
  BuildContext context, {
  required String title,
  required String description,
  required String confirmLabel,
  String cancelLabel = 'Cancel',
  bool destructive = false,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) {
      final c = WaygerzColors.of(ctx);
      return AlertDialog(
        backgroundColor: c.card,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(WaygerzRadius.xl),
          side: BorderSide(color: c.border),
        ),
        title: Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
        content: Text(description, style: TextStyle(fontSize: 14, color: c.mutedForeground)),
        actionsPadding: const EdgeInsets.fromLTRB(24, 0, 24, 20),
        actions: [
          WzButton(label: cancelLabel, variant: ButtonVariant.outline, onPressed: () => Navigator.of(ctx).pop(false)),
          WzButton(
            label: confirmLabel,
            variant: destructive ? ButtonVariant.destructive : ButtonVariant.primary,
            onPressed: () => Navigator.of(ctx).pop(true),
          ),
        ],
      );
    },
  );
  return ok ?? false;
}
