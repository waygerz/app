# Mobile push + app links: remaining setup

The code is in place (mobile `lib/push/push_service.dart`, `lib/app_nav.dart`,
Android manifest, `web/public/.well-known/assetlinks.json`). These steps need
account access, so they are done by hand.

## 1. Push notifications (Firebase Cloud Messaging)

Until this is done the app skips push silently, and prod's notifications
service runs `PUSH_PROVIDER=log` (logs instead of sending).

1. Create or pick a Firebase project and add an Android app with package
   `com.waygerz.app` (and an iOS app with the bundle id when iOS ships).
2. From `mobile/`, run once:
   ```
   dart pub global activate flutterfire_cli
   flutterfire configure --project <firebase-project-id> --platforms android,ios
   ```
   This writes `android/app/google-services.json` (and the iOS plist) and adds
   the Google Services Gradle plugin. Commit those files: they are client
   config, not secrets.
3. Backend: Firebase console → Project settings → Service accounts → generate
   a key. Store the JSON in SSM as a SecureString (for example
   `/waygerz/prod/notifications/FCM_CREDENTIALS_JSON`), then add to the
   `waygerz-notifications` task def:
   - env `PUSH_PROVIDER=fcm`, `FCM_PROJECT_ID=<firebase-project-id>`
   - secret `FCM_CREDENTIALS_JSON` → that SSM parameter
   and roll the service.
4. Check: sign in on a device, allow notifications, then send yourself a bet.
   Tapping the push opens the bet (`/c/<code>`) in the app.

Every push carries `data.deep_link`; the app routes it the same way as a
tapped link (`AppNav.open`).

## 2. Android App Links

`https://waygerz.com/c/<code>` and `/leagues/<id>` open in the app once
Android verifies the domain against `/.well-known/assetlinks.json`.

- The file currently lists the **debug** signing key of the dev workstation,
  so emulator and debug builds verify.
- Before the Play Store: add the **Play App Signing** SHA-256 (Play Console →
  App integrity → App signing key certificate) and the upload key's, to
  `sha256_cert_fingerprints` in `web/public/.well-known/assetlinks.json`, and
  redeploy webui.
- Check on a device: `adb shell pm get-app-links com.waygerz.app` should show
  `waygerz.com: verified`.

## 3. iOS universal links (when iOS ships)

Needs the Apple Team ID: serve `/.well-known/apple-app-site-association`
(`applinks` for `/c/*` and `/leagues/*`, appID `<TEAMID>.<bundle id>`) and add
the `applinks:waygerz.com` Associated Domains entitlement to the Runner target.
