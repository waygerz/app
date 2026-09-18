# Waygerz mobile (Flutter)

iOS + Android app for Waygerz. Talks to the same `/v1/...` API as the web, but
with **bearer tokens** (stored in Keychain/Keystore) instead of cookies.

The native projects (`android/`, `ios/`) are committed; app ID / bundle ID is
`com.waygerz.app`.

## Layout

```
lib/
  config.dart                 # API base URL + path prefixes (mirror web/lib/api-paths.ts)
  models.dart                 # User, FeedNotification, League, LeaguePeriod, Pick,
                              #   StandingRow, Wager, WalletBalance
  api/
    api_client.dart           # http wrapper: bearer auth, X-Client-Type: mobile,
                              #   auto-refresh on 401, withQuery() for encoded query strings
    auth_api.dart             # OTP start/verify/complete, me, logout
    notifications_api.dart    # feed, unread, prefs, device registration
    leagues_api.dart          # Pick'em + league container: list, detail, activate, picks, standings
    wagers_api.dart           # H2H wagers: mine, propose, accept/decline/cancel
    wallet_api.dart           # league-scoped play-money balance + transactions
  auth/
    token_store.dart          # secure token + device-uuid storage
    auth_controller.dart      # app auth state (ChangeNotifier); owns the one shared ApiClient
  push/push_service.dart      # FCM token registration (not wired for v1, see below)
  screens/                    # login, home shell (Leagues/Bets/Alerts/Profile),
                              #   leagues list + detail, bets, notifications, shared widgets
  main.dart
```

Screens cover **Leagues** (list → detail with standings, wallet balance,
activate, and Pick'em picks), **Bets** (the caller's H2H wagers with accept /
decline / cancel), login, the notifications feed, and profile/logout. Still to
build: the pick-submission slate, the propose-bet flow, bet-in-DM cards, and
avatar-key → URL resolution.

## Run

```bash
cd mobile
flutter pub get

# Against production (default: Config.apiBaseUrl = https://waygerz.com):
flutter run

# Against another API:
flutter run --dart-define=API_BASE_URL=https://staging.waygerz.com
```

Login is OTP-based; in production the code arrives only by SMS (Twilio). In
non-production (or with `AUTH_REVEAL_OTP` on the backend) `auth` also returns
the code as `dev_otp`, which `AuthApi.startOtp` passes through and the login
screen shows as "Dev code: …" for testing.

## Auth model

- `login/verify/complete/refresh` send `X-Client-Type: mobile`, so `auth`
  returns `access_token` + `refresh_token` in the JSON body. They're stored via
  `flutter_secure_storage`.
- `ApiClient` attaches `Authorization: Bearer <access>` and, on a 401,
  transparently refreshes once (single-flight; POST `/refresh` with the refresh
  token + device uuid in the body) and retries.
- If the refresh fails, `ApiClient.onSessionExpired` fires (wired by
  `AuthController`), which clears the tokens and signs out, so the app returns
  to the login screen from whichever screen made the request. The request then
  throws `SessionExpired`.

## Push notifications (deferred for v1)

Push is **not wired** for v1 (see `.docs/pending/MOBILE_STORE_LAUNCH_PLAN.md`).
`PushService` exists but nothing calls it, and there is no Firebase config.
To enable post-launch:

1. `flutterfire configure` (generates `lib/firebase_options.dart` + native
   config).
2. In `main.dart`, `await Firebase.initializeApp(...)` before `runApp`.
3. After sign-in, call `PushService(NotificationsApi(auth.api)).register()`.

`PushService.register()` is a safe no-op without Firebase. The backend stores
tokens via `POST /v1/platform/notifications/me/devices` and fans out the `push`
channel per the notification preference matrix.
