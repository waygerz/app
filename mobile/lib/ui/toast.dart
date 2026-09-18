import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../theme/app_theme.dart';

enum ToastType { success, error, warning, info }

/// The web's sonner toasts (components/ui/sonner.tsx): a floating bar filled
/// with the status color. Capture the messenger before an `await` when the
/// widget may be gone by then: `final toast = Toaster.of(context);`.
class Toaster {
  Toaster._(this._messenger, this._colors);
  final ScaffoldMessengerState _messenger;
  final WaygerzColors _colors;

  static Toaster of(BuildContext context) =>
      Toaster._(ScaffoldMessenger.of(context), WaygerzColors.of(context));

  void success(String message) => _show(message, ToastType.success);
  void error(String message) => _show(message, ToastType.error);
  void warning(String message) => _show(message, ToastType.warning);
  void info(String message) => _show(message, ToastType.info);

  /// An error's user-facing text: the server's `error` for API failures.
  void failure(Object e) => error(e is ApiException ? e.message : 'Something went wrong — please try again.');

  void _show(String message, ToastType type) {
    final bg = switch (type) {
      ToastType.success => _colors.success,
      ToastType.error => _colors.destructive,
      ToastType.warning => _colors.warning,
      ToastType.info => _colors.info,
    };
    final icon = switch (type) {
      ToastType.success => Icons.check_circle_outline,
      ToastType.error => Icons.error_outline,
      ToastType.warning => Icons.warning_amber_rounded,
      ToastType.info => Icons.info_outline,
    };
    _messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        backgroundColor: bg,
        content: Row(children: [
          Icon(icon, color: Colors.white, size: 18),
          const SizedBox(width: 10),
          Expanded(child: Text(message, style: const TextStyle(color: Colors.white, fontSize: 14))),
        ]),
      ));
  }
}
