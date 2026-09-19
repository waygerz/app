import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import 'button.dart';

/// Dialogs are for short yes/no confirms only (web `AlertDialog`); anything
/// people read or fill in is a sheet — see `showWzSheet` (sheet.dart).

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
