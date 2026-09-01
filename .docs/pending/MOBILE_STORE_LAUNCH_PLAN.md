# Mobile Store Launch — Plan & Checklist

> **Goal.** Get the Flutter app (`mobile/`) from its current Dart-only scaffold to
> a **published initial version** on the Apple App Store and Google Play.
>
> **Companion:** [`MOBILE_READINESS_PLAN.md`](./MOBILE_READINESS_PLAN.md) is the
> **API-contract gate** — its T1–T3 (OpenAPI source of truth, contract tests,
> landing known breaking changes) should be done before we submit, because native
> clients can't be hot-fixed. This doc is the **store mechanics** side.

## Locked decisions

| Decision | Value | Notes |
|---|---|---|
| Bundle / application ID | **`com.waygerz.app`** | Permanent on both stores, Firebase, signing. Set explicitly — `flutter create`'s default would be `com.waygerz.waygerz`. |
| iOS build environment | **GitHub Actions `macos` runner** | Reuses existing CI. Android builds on any Linux/Mac — **not** the 2 GB host. |
| Push notifications | **Deferred for v1** | No Firebase config; `PushService.register()` is a safe no-op. Wire post-launch. |
| Accounts | **Apple Developer + Play Console both approved** | Confirmed by owner. |
| v1 feature scope | **OPEN** — see Open Decisions | Lean: ship existing flows, hide unfinished entry points. |

## Current state of `mobile/` (the starting gap)

- **Dart-only scaffold**: `lib/` + `pubspec.yaml` at `0.1.0+1`. **No `android/`
  or `ios/` native folders** — they don't exist until `flutter create` runs.
- **Built flows:** OTP login, Leagues (list/detail/standings/picks), Bets (H2H
  accept/decline/cancel), notifications feed, profile/logout.
- **Not built** (per `mobile/README.md`): pick-submission slate, propose-bet
  flow, bet-in-DM cards, avatar-key → URL resolution.
- **No** app icon, bundle IDs, signing config, or store assets yet.
- **This host cannot build**: ~390 MB free RAM, no Flutter SDK, and iOS needs
  macOS. All builds happen on CI / a Mac, never here.

---

## Phase 0 — Accounts & access

- [ ] App Store Connect access confirmed (Admin or App Manager)
- [ ] Play Console access confirmed (Owner or Admin)
- [ ] Public developer name decided (shown on both store listings)
- [ ] Free-app agreements accepted (Apple free agreement; Play needs the account
      set up — no banking needed for a free app, but the account must be verified)
- [ ] Support email + support URL decided (both stores require a contact)

## Phase 1 — Make the repo build-ready

- [ ] `cd mobile && flutter create --org com.waygerz --project-name waygerz --platforms=ios,android .`
      (does **not** overwrite `lib/`, `pubspec.yaml`, `README.md`)
- [ ] Override the app ID to **`com.waygerz.app`** in both native spots:
      Android `applicationId` (`android/app/build.gradle`) and iOS
      `PRODUCT_BUNDLE_IDENTIFIER` (Xcode / `project.pbxproj`)
- [ ] App display name **"Waygerz"** (`android:label`, `CFBundleDisplayName`)
- [ ] App icon: add `flutter_launcher_icons` dev-dep + 1024×1024 master, generate
- [ ] (optional) `flutter_native_splash` for a branded launch screen
- [ ] Bump `pubspec.yaml` version to **`1.0.0+1`**
- [ ] Confirm `lib/config.dart` API base defaults to `https://waygerz.com` (prod)
- [ ] Android: set `minSdk`/`targetSdk` (targetSdk must meet Play's current
      requirement window; keep `minSdk` ≥ 21 so Firebase can be added later)
- [ ] iOS: set minimum deployment target (≥ 13 to keep Firebase an easy add-on);
      set `ITSAppUsesNonExemptEncryption=false` in `Info.plist` (HTTPS-only →
      export-compliance exempt)
- [ ] `.gitignore` native build artifacts; **commit** the `android/` + `ios/`
      project files (minus any secrets)
- [ ] Smoke-run on a device/emulator against prod (`flutter run`) — logs in,
      lists leagues, opens a bet

## Phase 2 — Signing

**Android**
- [ ] Generate an **upload keystore** (`keytool`); store as base64 in GitHub
      Secrets — **never commit** the keystore or `key.properties`
- [ ] `build.gradle` reads signing config from env/`key.properties`
- [ ] Enroll in **Play App Signing** (Google holds the app-signing key; you hold
      the upload key)

**iOS**
- [ ] Register App ID `com.waygerz.app` in the Apple Developer portal
- [ ] Create an **App Store Connect API key** (`.p8`) for CI upload
- [ ] Distribution certificate + provisioning profile — manage via **fastlane
      match** (private repo) or manual export; store in GitHub Secrets

## Phase 3 — CI (GitHub Actions, manual dispatch to match the backend)

- [ ] Android job: `ubuntu` runner → `flutter build appbundle --release` → signed
      AAB → upload to Play **internal testing** track (fastlane `supply` or
      `r0adkll/upload-google-play`)
- [ ] iOS job: `macos` runner → `flutter build ipa --release` (manual signing) →
      upload to **TestFlight** (fastlane `deliver` / `altool` + API key)
- [ ] Document the secrets matrix (keystore, key.properties, App Store Connect
      API key, match repo/passphrase)
- [ ] Keep it `workflow_dispatch` (no auto-publish on push)

## Phase 4 — Store records & metadata

**Shared assets (INPUTS — see bottom):**
- [ ] Icon: 1024×1024 (Apple) / 512×512 (Play), 1024×500 feature graphic (Play)
- [ ] Screenshots: iPhone 6.7" (+6.5"), Android phone (tablet optional)
- [ ] Copy: app name, subtitle/short description, full description — **no
      real-money / gambling-promo language**
- [ ] Privacy policy URL `https://waygerz.com/privacy`; support email + URL

**Google Play**
- [ ] Create app (default language, category, **Free**)
- [ ] **Data safety** form (collected: phone, name, usage/diagnostics)
- [ ] **Content rating** questionnaire — declare **simulated gambling** → expect
      a mature rating; understating this is an auto-reject
- [ ] Target audience & content (adults, not for children)
- [ ] App access: demo login + instructions for review (OTP — see Phase 5)
- [ ] Store listing + graphics
- [ ] Upload AAB → **Internal testing** → Closed/Open → **Production**

**Apple App Store Connect**
- [ ] Create app record (bundle `com.waygerz.app`, SKU, primary language)
- [ ] **Age rating**: declare **Simulated Gambling** → **17+**
- [ ] **Privacy nutrition labels** (data types + linkage to identity)
- [ ] Sign in with Apple: **verify not required** (OTP-only login, no third-party
      social sign-in → exempt)
- [ ] Demo account + review notes (OTP dev-reveal — Phase 5)
- [ ] Upload build → **TestFlight** → **Submit for review**

## Phase 5 — Review-risk mitigations (do BEFORE submitting)

These are the things that get first submissions rejected. Handle up front.

- [ ] **Gambling policy.** It's play-money, even-money, **no cash in/out** →
      "simulated gambling," which is allowed. Requirements: correct age/content
      rating on both stores; "entertainment only, no real money" framing in the
      listing and ideally in-app; confirm there is genuinely no real-currency
      path anywhere. (Google's Real-Money Gambling policy does **not** apply — no
      real money — but the content questionnaire still asks.)
- [ ] **In-app account deletion.** Both stores require it if users can create
      accounts. Confirm the app (or a clearly linked path) offers deletion; if
      missing, **build it before submitting** — this is a very common auto-reject.
- [ ] **Reviewer login.** Login is phone-OTP delivered by **real SMS** (Twilio,
      toll-free verified as of 2026-09-01). The old on-screen `dev_otp` shortcut
      has been removed, so a reviewer must receive an actual text. Provide a
      **demo account on a number you control** (so you can read the code and relay
      it) or a reviewer test number, plus **step-by-step notes**.
- [ ] **No broken/dead entry points.** Reviewers reject visible buttons that go
      nowhere. The unfinished flows (pick-slate, propose-bet, bet-in-DM cards,
      avatars) must be finished **or hidden/disabled** for v1.
- [ ] **Real-device pass.** Crash-free run through the core flows via TestFlight /
      Play internal track before promoting to production.
- [ ] **API-contract gate.** `MOBILE_READINESS_PLAN.md` T1–T3 done (native can't
      be hot-fixed if the contract drifts).

## Phase 6 — Submit & post-launch

- [ ] Android: promote internal → production (staged rollout %)
- [ ] iOS: submit from TestFlight; respond to any review notes
- [ ] Post-launch backlog: wire push (Firebase/FCM→APNs), finish deferred flows,
      then ship as `1.0.x` / `1.1.0`

---

## Open decisions (need your call)

1. **v1 feature scope** — ship the existing flows (login/leagues/bets/
   notifications/profile) and hide unfinished entry points, **or** finish
   pick-slate + propose-bet + bet-in-DM first? *(Lean: ship existing, hide the
   rest — faster to a live v1, iterate in updates.)*
2. **Region gating** — launch US-only initially given the sports/wagering
   framing, or open?
3. Exact Android `min/targetSdk` and iOS min deployment target.

## Inputs needed from you (blocking assets)

- [ ] **1024×1024 app icon** master (or approval to draft one)
- [ ] **Store screenshots** — or approval to capture them once the app builds
- [ ] **Support email + URL**, and short/long **description copy**
- [ ] **Confirm in-app account deletion exists** (or approve building it)

## Cross-references

- [`MOBILE_READINESS_PLAN.md`](./MOBILE_READINESS_PLAN.md) — API-contract gate
- [`API_ENDPOINTS.md`](../complete/API_ENDPOINTS.md) — the API surface the app calls
- `mobile/README.md` — scaffold layout + `flutter create` generation step
- Legal: `web` `/terms` + `/privacy` (privacy URL for both stores)
