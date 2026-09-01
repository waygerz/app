# Waygerz mobile (Flutter)

iOS + Android app for Waygerz. Talks to the same `/v1/...` API as the web, but
with **bearer tokens** (stored in Keychain/Keystore) instead of cookies.

## What's in this scaffold

```
lib/
  config.dart                 # API base URL + path prefixes (mirror web/lib/api-paths.ts)
  models.dart                 # User, FeedNotification
  api/
    api_client.dart           # http wrapper: bearer auth, X-Client-Type: mobile, auto-refresh on 401
    auth_api.dart             # OTP start/verify/complete, me, logout
    notifications_api.dart    # feed, unread, prefs, device registration
    leagues_api.dart          # Pick'em + league container: list, detail, activate, picks, standings
    wagers_api.dart           # H2H wagers: mine, propose, accept/decline/cancel
    wallet_api.dart           # league-scoped play-money balance + transactions
  auth/
    token_store.dart          # secure token + device-uuid storage
    auth_controller.dart      # app auth state (ChangeNotifier)
  push/push_service.dart      # FCM token registration (opt-in, see below)
  screens/                    # login, home shell (Leagues/Bets/Alerts/Profile),
                              #   leagues list + detail, bets, notifications, shared widgets
  main.dart
```

The API layer is the reusable core. Screens now cover the primary flows:
**Leagues** (list → detail with standings, wallet balance, activate, and Pick'em
picks) and **Bets** (the caller's H2H wagers with accept / decline / cancel),
alongside login, the notifications feed, and profile/logout. Still to build:
the pick-submission slate (needs the ingestor events endpoint), the propose-bet
flow, bet-in-DM cards (messaging service), and avatar-key → URL resolution.

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

Login is OTP-based. The code is delivered by real SMS (Twilio) and entered on
the verify screen; it is never returned in the API response.

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
