import 'dart:io' show Platform;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../api/notifications_api.dart';

/// Registers this device for push and keeps its token in sync with the backend.
///
/// Prerequisite: run `flutterfire configure` and call `Firebase.initializeApp`
/// in main() first. Until then this is a safe no-op (it swallows the missing
/// Firebase app error), so the rest of the app runs without push configured.
class PushService {
  PushService(this._notifications);
  final NotificationsApi _notifications;

  Future<void> register() async {
    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      final token = await messaging.getToken();
      if (token != null) {
        await _notifications.registerDevice(_platform(), token);
      }
      // A rotated token must be re-registered or pushes stop arriving.
      messaging.onTokenRefresh.listen((t) {
        _notifications.registerDevice(_platform(), t).catchError((_) {});
      });
    } catch (e) {
      // Firebase not configured yet (or permission denied) — non-fatal.
      debugPrint('push registration skipped: $e');
    }
  }

  String _platform() => Platform.isIOS ? 'ios' : 'android';
}
