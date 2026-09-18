import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../api/notifications_api.dart';

/// Push: registers this device's FCM token with the notifications service,
/// keeps it current, and routes taps to the notification's `deep_link` (the
/// backend puts the same path the web uses in every push's data).
///
/// Needs Firebase configured for the app (`flutterfire configure`, which adds
/// google-services.json / GoogleService-Info.plist). Without it [start] finds
/// no Firebase app and every call here is a no-op, so the app runs fine.
class PushService {
  PushService(this._notifications);
  final NotificationsApi _notifications;
  String? _token;
  final _subs = <StreamSubscription<dynamic>>[];

  /// Initialize Firebase if the app has native config. Call once from main().
  static Future<void> start() async {
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('push disabled (Firebase not configured): $e');
    }
  }

  static bool get available => Firebase.apps.isNotEmpty;

  /// After sign-in: ask permission, register the token, and wire taps.
  /// [onOpen] gets the deep link of a tapped notification; [onForeground] a
  /// message that arrived while the app was open (the OS shows nothing then).
  Future<void> register({
    required void Function(String link) onOpen,
    required void Function(String title, String body) onForeground,
  }) async {
    if (!available) return;
    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      _token = await messaging.getToken();
      if (_token != null) await _notifications.registerDevice(_platform(), _token!);
      // A rotated token must be re-registered or pushes stop arriving.
      _subs.add(messaging.onTokenRefresh.listen((t) {
        _token = t;
        _notifications.registerDevice(_platform(), t).catchError((_) {});
      }));

      String linkOf(RemoteMessage m) => (m.data['deep_link'] as String?) ?? '/notifications';
      // Tapped while the app was in the background, or launched it from closed.
      _subs.add(FirebaseMessaging.onMessageOpenedApp.listen((m) => onOpen(linkOf(m))));
      final initial = await messaging.getInitialMessage();
      if (initial != null) onOpen(linkOf(initial));
      _subs.add(FirebaseMessaging.onMessage.listen((m) {
        onForeground(m.notification?.title ?? '', m.notification?.body ?? '');
      }));
    } catch (e) {
      debugPrint('push registration skipped: $e'); // permission denied etc. — non-fatal
    }
  }

  /// Before sign-out: stop pushes to this device for this account.
  Future<void> unregister() async {
    for (final s in _subs) {
      await s.cancel();
    }
    _subs.clear();
    final t = _token;
    _token = null;
    if (t != null) await _notifications.unregisterDevice(t).catchError((_) {});
  }

  String _platform() => Platform.isIOS ? 'ios' : 'android';
}
