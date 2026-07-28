# Waygerz mobile (Flutter)

iOS + Android app for Waygerz. Talks to the same `/v1/...` API as the web, but
with **bearer tokens** (stored in Keychain/Keystore) instead of cookies.

## What's in this scaffold

```
lib/
  config.dart                 # API base URL + path prefixes (mirror webui/lib/api-paths.ts)
  models.dart                 # User, FeedNotification
  api/
    api_client.dart           # http wrapper: bearer auth, X-Client-Type: mobile, auto-refresh on 401
    auth_api.dart             # OTP start/verify/complete, me, logout
    notifications_api.dart    # feed, unread, prefs, device registration
  auth/
    token_store.dart          # secure token + device-uuid storage
    auth_controller.dart      # app auth state (ChangeNotifier)
  push/push_service.dart      # FCM token registration (opt-in, see below)
  screens/                    # login, home shell, notifications feed
  main.dart
```

The API layer is the reusable core; screens are a minimal starting point
(login + notifications feed + a profile/logout tab, with Leagues/Bets stubbed).

## Generate the platform folders (one-time)

This scaffold intentionally ships only `lib/` + `pubspec.yaml`. Generate the
native project around it:

```bash
cd mobile
flutter create --org com.waygerz --project-name waygerz --platforms=ios,android .
flutter pub get
```

`flutter create` will not overwrite the existing `lib/`, `pubspec.yaml`, or
`README.md`.

## Run

```bash
# Against production (default API base is https://waygerz.com):
flutter run

# Against a local/staging API:
flutter run --dart-define=API_BASE_URL=https://staging.waygerz.com
```

Login is OTP-based. While `AUTH_REVEAL_OTP=true` on the backend, the code is
returned as `dev_otp` and shown on the verify screen for testing.

## Auth model

- `login/verify/complete/refresh` send `X-Client-Type: mobile`, so `auth`
  returns `access_token` + `refresh_token` in the JSON body (see
  `api/auth/app/services/service_auth.py`). They're stored via
  `flutter_secure_storage`.
- `ApiClient` attaches `Authorization: Bearer <access>` and, on a 401,
  transparently refreshes once (POST `/refresh` with the refresh token + device
  uuid in the body) and retries. A failed refresh throws `SessionExpired`.

## Push notifications (optional, wire when ready)

Push uses FCM (which relays to APNs for iOS), matching the backend `push`
channel. To enable:

1. `flutterfire configure` (generates `lib/firebase_options.dart` + native
   config).
2. In `main.dart`, `await Firebase.initializeApp(...)` before `runApp`.
3. After sign-in, call `PushService(NotificationsApi(auth.api)).register()`.

Until then `PushService.register()` is a safe no-op and the app runs without
Firebase. The backend stores tokens via `POST /v1/platform/notifications/me/devices`
and fans out the `push` channel per the notification preference matrix.
