# Mobile Readiness — API Contract Hardening Plan

> **The gate.** Building the mobile client can start now — the architecture
> (uniform `/v1/{group}/{service}`, proven bearer-token auth) won't shift under
> it. What this plan gates is **shipping to the app stores**: native clients
> can't be hot-fixed, so silent API-contract drift is far more dangerous than on
> web. These four tasks turn "stable architecture" into "stable contract."
>
> Companions: [`API_ENDPOINTS.md`](../complete/API_ENDPOINTS.md) (the surface),
> [`H2H_BUILD_PLAN.md`](../complete/H2H_BUILD_PLAN.md), [`PICKEM_BUILD_PLAN.md`](../complete/PICKEM_BUILD_PLAN.md).

## Task list

- [ ] **T1 — Single source of truth for the API contract** (OpenAPI spec + generated clients)
- [ ] **T2 — Contract / response-shape tests in CI** (a rename fails the build, not the app)
- [ ] **T3 — Land the known breaking changes first** (H2H B1, money B0, Pick'em G2, odds B2)
- [ ] **T4 — Additive-only `/v1` discipline + min-supported-app-version** (you can't force-update native)

**Release gate:** app-store submission is blocked until **T1, T2, T3** are done
and **T4**'s policy + upgrade-wall are in place. Mobile *development* proceeds in
parallel the whole time.

---

## T1 — Single source of truth for the API contract

**Why.** The contract is hand-maintained in **three** places today — backend
`api_prefix()` / route decorators, `web/lib/api-paths.ts`, and
`mobile/lib/config.dart` — with no schema tying them together. We already caught
one silent drift this week (mobile `wallet` was `platform`, backend is
`gameplay` → a latent 404). The mobile models parse *defensively* because exact
JSON keys aren't guaranteed. This is the highest-leverage fix.

**Plan.**
1. **Author `openapi/waygerz.yaml`** (OpenAPI 3.1) as the canonical contract,
   seeded from `API_ENDPOINTS.md`. One spec with `tags` per service, or a spec
   per service merged in CI — start with one file. Capture request bodies +
   response schemas for the **public** endpoints (skip `/internal/*`).
2. **Decide the authoring model:**
   - **(a) Spec-first, hand-authored** (recommended to start): the YAML is the
     source of truth; controllers stay as-is. Fast, no framework migration.
   - (b) Spec-from-code: retrofit a Flask spec lib (flask-smorest / spectree /
     apispec) across 10 services. More rigorous but a real migration — defer.
3. **Generate clients from the spec:**
   - **mobile:** `openapi-generator` (`dart-dio` or `dart`) → replaces the
     hand-written prefixes in `config.dart` and the hand-written model
     `fromJson`s with generated types.
   - **web:** `openapi-typescript` → types for `lib/*.ts` (keep the thin
     `apiFetch` wrapper).
4. **Wire generation into the repo** (a `make api-clients` / npm script) and
   document it so regenerating is one command.

**Done when:** `openapi/waygerz.yaml` exists and is the source of truth; mobile
and web client *paths + types* are generated from it (no more hand-maintained
`config.dart` prefixes / `api-paths.ts`).

**Effort:** M–L (spec authoring is the cost). **Depends on:** nothing (start here).

---

## T2 — Contract / response-shape tests in CI

**Why.** Pytest exists per service but asserts *behavior*, not *response shape*.
A field rename or type change passes CI and breaks the app silently. Native
can't be hot-fixed, so this must be caught pre-merge.

**Plan.**
1. **Validate responses against the spec** in the existing pytest suites: for
   each public endpoint, assert the JSON response validates against its
   OpenAPI response schema (via `openapi-core` / `jsonschema` against
   `waygerz.yaml` components).
2. **Expand the CI matrix to all 10 services.** `.github/workflows/test.yml`
   currently runs `auth, contests, leagues, ingestor` — add `notifications,
   media, friends, comments, messaging, wallet` so every service's contract is
   under test. (notifications also needs a `tests/` dir created.)
3. **Fail CI on drift:** a schema mismatch between a response and the spec is a
   red build.
4. (Optional) **Snapshot tests** of representative response JSON as a
   lower-effort stopgap if T1 slips.

**Done when:** every public endpoint has ≥1 test asserting its response matches
the spec; CI is red if backend output and `waygerz.yaml` disagree; all 10
services run in the matrix.

**Effort:** M. **Depends on:** T1 (schema source) — can begin with jsonschema
snapshots independently.

---

## T3 — Land the known breaking changes first

**Why.** Several changes already scoped in the build plans will alter shapes
mobile consumes. Ship them *before* mobile GA so the app targets the settled
contract, not a transitional one — otherwise it's rework + a forced app update.

**Changes to land (all pre-mobile-GA):**
- **H2H B1** — remove the legacy `confirm` / `completed` wager path
  (`POST /wagers/<id>/confirm` + the `completed` status). Breaking; do it so
  mobile never learns the dead path. *(Mobile `wagers_api.dart` already omits it.)*
- **B0 — money model decision** (play-money vs real-money). Decide + reflect in
  wallet copy/UX. Recommendation stands: **play-money for launch.**
- **Pick'em G2** — consolidate the lock model onto a persisted `CLOSED` period
  state, so mobile reads `period.status` instead of re-implementing the
  T-1h/kickoff math.
- **B2 — odds model** — confirm even-money for launch; if the wager payload
  gains an odds/line context field, lock its shape now.

**Plan.** Sequence each as its own small PR: update `waygerz.yaml` (T1) + add a
contract test (T2) in the same change, so the spec never lags the code.

**Done when:** no planned breaking change remains that would alter a
mobile-consumed shape; each is reflected in the spec + tests.

**Effort:** these are existing build-plan items — this task is **sequencing**
them ahead of mobile GA, not net-new work. **Depends on:** T1/T2 for the
spec+test discipline.

---

## T4 — Additive-only `/v1` discipline + min-supported-app-version

**Why.** Everything is under `/v1`, but there's no versioning/deprecation policy,
and **native clients can't be force-updated** — an old app version can linger for
months. Two protections needed: a policy that prevents accidental breakage, and
a mechanism to retire versions that are genuinely too old.

**Plan.**
1. **Versioning policy (`docs/API_VERSIONING.md`):** within `/v1`, changes are
   **additive-only** — add fields/endpoints; never remove, rename, or repurpose.
   Truly breaking changes go to a new field or `/v2`. Deprecations are marked in
   the spec (`deprecated: true`) and removed only after the min-version cutover.
2. **App-version signalling:** mobile sends `X-App-Version` (already have
   `X-Client-Type: mobile`). A lightweight `/config` (or the auth/refresh
   response) returns `min_supported_version`. If the client is below it, show a
   **hard upgrade wall** ("Update Waygerz to continue").
3. **Enforcement point:** decide gateway vs per-service vs client-only. Simplest:
   client-side check against a `min_supported_version` from `/config`, with a
   server 426 (Upgrade Required) as a backstop on sensitive writes.

**Done when:** the versioning policy is committed; mobile sends `X-App-Version`;
a `min_supported_version` signal exists and the app shows an upgrade wall below it.

**Effort:** S–M (policy is cheap; the min-version wall is a small feature).
**Depends on:** nothing hard; pairs naturally with T1.

---

## Sequencing

| Phase | Work | Gates |
|-------|------|-------|
| **0 — Decisions** | B0 money model; T1 authoring model (spec-first vs from-code) | unblocks T1, T3 |
| **1 — Contract** | T1 spec + generated mobile/web clients | foundation |
| **2 — Tests** | T2 response-schema tests + all-10-services CI matrix | drift caught in CI |
| **3 — Breaking changes** | T3 land B1 / G2 / B0 / B2 against the spec | contract settled |
| **4 — Versioning** | T4 policy + `X-App-Version` + upgrade wall | safe to age releases |
| **GATE** | app-store submission | after 1–3, with 4's policy live |

**Parallel track:** mobile client development (screens, remaining wiring) runs
through all phases — it's what surfaces contract gaps fastest. Only *store
release* is gated.

## First concrete step
Author `openapi/waygerz.yaml` from `API_ENDPOINTS.md` (T1 step 1) and generate
the mobile Dart client from it — that single move ends the three-copies drift
class and makes items T2–T4 straightforward to hang off the spec.
