# PAYGO — POC App Build Specification
**Version:** 0.2 · **Status:** Draft  
**Wrapper app name:** PAYGO  
**Purpose:** Stakeholder/client demo app. Neutral-branded shell, regional brand switching, modular features per customer profile. Runs on real devices. Firestore-backed mock data.

---

## 1. App Architecture Overview

```
Shell App (PAYGO — neutral brand)
│
├── Region Selector                    → picks market context
│   ├── UK → Ember brand
│   ├── Ireland → Solas brand
│   └── USA → Pulse brand
│
├── Customer Selector                  → picks persona
│   └── [filtered by region, reads from Firestore /customers]
│
└── Consumer App                       → themed to brand
    ├── Feature set resolved from Firestore config
    ├── All data via Firestore real-time listeners
    └── Modular screens, toggled per customer/region

Firebase Layer
│
├── Firestore                          → all customer + config data
│   ├── /config                        → region + segment feature maps
│   ├── /customers                     → 6 mock profiles + live account state
│   ├── /usage                         → daily + half-hourly data series
│   ├── /payments                      → transaction history per customer
│   └── /rates                         → tariff data per brand
│
└── Firebase Functions                 → server-side demo operations
    ├── resolveConfig()                → merges region + segment + overrides → feature set
    ├── setBalanceState()              → writes balance mutation (demo panel slider)
    ├── resetCustomer()                → restores any profile to seed state
    └── [future] simulateUsage()       → drains balance in real-time for live demo
```

Two key architectural rules: **nothing is hardcoded to a customer or region** — every screen, feature, and data point is resolved at runtime from the config layer. And **Firestore is the single source of truth** — the app holds no authoritative state locally, which means Config Panel changes (balance sliders, feature toggles) are real Firestore writes that all connected devices reflect instantly.

---

## 2. Firebase / Firestore Architecture

### 2.1 Why Firestore (not static JSON)

| Capability | Static JSON | Firestore |
|---|---|---|
| Update data without code deploy | No | Yes |
| Config Panel writes persist | No | Yes |
| Multi-device demo sync | No | Yes (onSnapshot) |
| Demo reset to seed state | Manual | Firebase Function |
| Future: simulate live balance drain | No | Yes (scheduled Function) |
| Offline fallback | Yes (bundled) | Yes (Firestore offline cache) |

### 2.2 Firestore Collection Structure

```
/config
  /regions
    /uk           → brand, currency, smartMeterAvailable, regulatoryContext
    /ie           → brand, currency, smartMeterAvailable, regulatoryContext
    /us           → brand, currency, smartMeterAvailable, regulatoryContext
  /segments
    /standard           → feature flag overrides for segment
    /vulnerable         → feature flag overrides for segment
    /debt-risk          → feature flag overrides for segment
    /tech-savvy         → feature flag overrides for segment
    /ev-owner           → feature flag overrides for segment
    /solar-exporter     → feature flag overrides for segment

/customers
  /uk-01-sarah    → full profile document (see shape in section 6)
  /uk-02-david
  /ie-01-aoife
  /ie-02-ciaran
  /us-01-jordan
  /us-02-maya

/usage
  /uk-01-sarah
    /daily        → subcollection: 30 docs, one per day (kWh, cost)
    /halfhourly   → subcollection: 48 docs, today's slots (smart only)
  /[customerId]   → same structure per customer

/payments
  /[customerId]
    /history      → subcollection: last 12 transactions

/rates
  /ember-standard
  /solas-standard
  /pulse-tou-california
```

### 2.3 Real-Time Listener Strategy

The consumer app attaches `onSnapshot` listeners to:

- `/customers/{customerId}` — balance, days remaining, topUpConfig, alerts
- `/usage/{customerId}/halfhourly` — real-time bar (smart customers only)

All other data (payment history, rates, usage graph) is **fetched once on screen load** (`getDocs`), not subscribed. This keeps listener count low and avoids unnecessary reads during a demo.

The Config Panel's balance slider calls `setBalanceState()` which writes to `/customers/{customerId}.account.balance`. The dashboard's `onSnapshot` listener picks this up and re-renders immediately — no page refresh, no local state juggling. Two phones showing the same customer stay in sync automatically.

### 2.4 Firebase Functions

```
resolveConfig(region, segment, profileOverrides)
  Reads /config/regions/{region} + /config/segments/{segment}
  Merges with profileOverrides from the customer document
  Returns resolved featureFlags object
  Called once on customer select — result cached in session state
  Re-resolved only when customer or region changes

setBalanceState(customerId, preset)
  preset: 'critical' | 'low' | 'comfortable' | 'high'
  Writes balance + daysRemaining to /customers/{customerId}
  onSnapshot on connected app instances fires automatically

resetCustomer(customerId)
  Overwrites /customers/{customerId} with values from _seed field
  Resets usage + payment subcollections to original state
  Called from Account screen or Config Panel "Reset" button
  Use after a demo session has mutated state

[future] simulateUsage(customerId, ratePerMinute)
  Manually triggered or scheduled
  Decrements balance at configurable rate
  Creates a live "watch the balance drain" demo moment
  High demo impact — scheduled for Phase 5 stretch
```

### 2.5 Authentication

Anonymous Firebase Auth for session context. No login screen, no credentials. On app launch, `signInAnonymously()` provides a UID — used for Firestore security rules and to identify active demo sessions (useful for post-demo resets).

Security rules: read access open to all authenticated (anonymous) sessions. Write access restricted to Firebase Functions only — the client app never writes directly to Firestore. All mutations route through Functions.

### 2.6 Offline Behaviour

Firestore offline persistence is enabled by default. For a demo context:

- App loads a customer, data is cached locally
- If network drops mid-demo, UI keeps working from cache
- Config Panel writes queue and sync when connectivity returns
- No mid-demo loading states if the initial load completed

---

## 3. Central Config Architecture

All feature availability is driven by a single config object resolved from three inputs: `region` + `customerSegment` + `featureOverrides`. Config lives in Firestore `/config` — updatable without a code deploy.

### 3.1 Config Resolution Order

```
Base defaults (all flags off)
  └── + Region layer        (what this market supports — /config/regions/{region})
        └── + Segment layer     (what this type gets — /config/segments/{segment})
              └── + Profile overrides   (individual exceptions — /customers/{id}.featureOverrides)
                    └── = Resolved feature set for this session
```

Resolution happens server-side in `resolveConfig()`. Result cached in app session state — not re-fetched on every screen.

### 3.2 Config Schema (Firestore document shape)

```json
// /config/regions/uk
{
  "brand": "ember",
  "smartMeterAvailable": true,
  "realTimeDataAvailable": true,
  "currency": "GBP",
  "currencySymbol": "£",
  "regulatoryContext": "ofgem",
  "regionCapabilityOverrides": {
    "realTimeUsageBar": true,
    "halfHourlyUsageData": true,
    "friendlyHours": true
  }
}

// /config/segments/vulnerable
{
  "featureFlags": {
    "predictiveWarning": true,
    "emergencyCredit": true,
    "friendlyHours": true,
    "vulnerabilityFlag": true,
    "meterReadSubmission": true,
    "autoTopUp": true,
    "scheduledTopUp": true
  }
}
```

### 3.3 Feature Flag Object (resolved session)

```json
{
  "featureFlags": {

    // Balance and visibility
    "balanceDisplay":           true,
    "daysRemainingEstimate":    true,
    "usageGraph":               false,
    "realTimeUsageBar":         false,

    // Top-up models
    "manualTopUp":              true,
    "scheduledTopUp":           false,
    "autoTopUp":                false,
    "rulesBasedTopUp":          false,
    "continuousBalanceMgmt":    false,

    // Alerts and notifications
    "lowBalanceAlert":          true,
    "predictiveWarning":        false,
    "disconnectionWarning":     false,
    "spendCapAlert":            false,

    // Payment management
    "savedPaymentMethods":      true,
    "paymentHistory":           true,
    "spendSummary":             false,
    "debtRepaymentPlan":        false,

    // Vulnerability/safety
    "emergencyCredit":          false,
    "friendlyHours":            false,
    "warmHomeReminder":         false,
    "vulnerabilityFlag":        false,

    // Smart/real-time
    "touPricing":               false,
    "demandResponseAlerts":     false,
    "halfHourlyUsageData":      false,
    "usageComparison":          false,

    // Ecosystem
    "evChargingScheduler":      false,
    "solarExportSummary":       false,
    "batteryStatusWidget":      false,

    // Account management
    "meterReadSubmission":      false,
    "tariffDisplay":            true,
    "referralScheme":           false,
    "multiPropertyView":        false
  }
}
```

### 3.4 Segment Presets

| Feature | standard | vulnerable | debt-risk | tech-savvy | ev-owner | solar-exporter |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| balanceDisplay | Y | Y | Y | Y | Y | Y |
| daysRemainingEstimate | Y | Y | Y | Y | Y | Y |
| autoTopUp | Y | Y | — | Y | Y | Y |
| scheduledTopUp | Y | Y | Y | Y | Y | Y |
| rulesBasedTopUp | — | — | — | Y | Y | Y |
| continuousBalanceMgmt | — | — | — | Y | — | — |
| predictiveWarning | — | Y | Y | Y | — | — |
| emergencyCredit | — | Y | Y | — | — | — |
| friendlyHours | — | Y | — | — | — | — |
| vulnerabilityFlag | — | Y | — | — | — | — |
| debtRepaymentPlan | — | — | Y | — | — | — |
| touPricing | — | — | — | Y | Y | Y |
| evChargingScheduler | — | — | — | — | Y | — |
| solarExportSummary | — | — | — | — | — | Y |
| realTimeUsageBar | — | — | — | Y | Y | Y |
| usageGraph | — | — | — | Y | Y | Y |
| meterReadSubmission | — | Y | Y | — | — | — |

Segment presets are further filtered by region capability. e.g. `realTimeUsageBar` is ON for `tech-savvy` but overridden OFF for IE because the region document has `smartMeterAvailable: false`.

---

## 4. Screen Inventory

### 4.1 Shell Screens

| ID | Screen | Description |
|---|---|---|
| S-01 | Splash / Loading | PAYGO neutral mark, Firebase init |
| S-02 | Region Selector | 3 cards: UK / IE / USA |
| S-03 | Customer Selector | Profile cards, Firestore query by region |
| S-04 | Config Panel | Feature toggles + balance state presets |

### 4.2 Consumer App Screens (branded, feature-gated)

| ID | Screen | Required flags | Notes |
|---|---|---|---|
| A-01 | Home / Dashboard | balanceDisplay | Core screen. Always shown. |
| A-02 | Top-Up — manual | manualTopUp | Amount entry + pay |
| A-03 | Top-Up — scheduled | scheduledTopUp | Recurring setup flow |
| A-04 | Top-Up — auto | autoTopUp | Threshold + trigger setup |
| A-05 | Top-Up — rules builder | rulesBasedTopUp | If/then logic UI |
| A-06 | Balance management | continuousBalanceMgmt | Passive mode config |
| A-07 | Usage — graph | usageGraph | kWh over time, getDocs |
| A-08 | Usage — real-time | realTimeUsageBar | Live draw, onSnapshot |
| A-09 | Usage — TOU rates | touPricing | Peak/off-peak breakdown |
| A-10 | Payment history | paymentHistory | Transaction log, getDocs |
| A-11 | Spend summary | spendSummary | Weekly/monthly roll-up |
| A-12 | Emergency credit | emergencyCredit | Draw-down + confirmation |
| A-13 | Debt repayment | debtRepaymentPlan | Plan view + progress |
| A-14 | Meter read | meterReadSubmission | Manual number entry |
| A-15 | Notifications | lowBalanceAlert | Notification preferences |
| A-16 | EV scheduler | evChargingScheduler | Off-peak charge config |
| A-17 | Solar export | solarExportSummary | Export credits + earnings |
| A-18 | Battery widget | batteryStatusWidget | Charge level + mode |
| A-19 | Support / help | — | Always shown |
| A-20 | Account settings | — | Always shown. Includes Reset demo. |

### 4.3 Home Dashboard Composition

```
[Brand header + account name]       always
[Balance widget]                    always — onSnapshot (live)
[Days remaining]                    daysRemainingEstimate
[Real-time usage bar]               realTimeUsageBar — onSnapshot

[Predictive warning banner]         predictiveWarning (conditional on balance)
[Emergency credit prompt]           emergencyCredit + low balance state
[Debt repayment nudge]              debtRepaymentPlan (if active plan)

[Quick top-up action]               always
[Auto top-up status pill]           autoTopUp (if configured)
[Scheduled top-up status pill]      scheduledTopUp (if active)

[Usage mini-chart]                  usageGraph — getDocs
[TOU rate indicator]                touPricing
[EV charge status]                  evChargingScheduler
[Solar export today]                solarExportSummary
```

---

## 5. Mock Customer Profiles

Six profiles across three regions. Stored in Firestore `/customers`. Profile selector reads via `getDocs` filtered by `region` field.

### UK — Ember

**UK-01: Sarah M.** · Segment: standard  
Balance: £18.40 · ~9 days · Auto top-up: £20 when < £10 · Visa 4242 · Smart meter  
Story: *steady user, set-and-forget, light engagement*

**UK-02: David T.** · Segment: vulnerable  
Balance: £4.20 · ~2 days · Emergency credit available · Friendly hours active · Smart meter  
Story: *low income, erratic top-up pattern, needs intervention*

### Ireland — Solas

**IE-01: Aoife R.** · Segment: standard  
Balance: €22.00 · ~11 days (estimated) · Scheduled top-up: €30 every 2 weeks · No smart meter  
Story: *comfortable, wants visibility but no smart capability*

**IE-02: Ciarán B.** · Segment: debt-risk  
Balance: €7.50 · ~3 days (estimated) · Repayment plan: €5/week · Meter read due · No smart meter  
Story: *recovering from debt, needs structured support, non-smart constraints*

### USA — Pulse

**US-01: Jordan K.** · Segment: ev-owner  
Balance: $41.00 · ~14 days · TOU active · EV scheduled 1am–5am · AMI smart meter  
Story: *optimising EV charge cost, engaged user, loves data*

**US-02: Maya C.** · Segment: solar-exporter  
Balance: $63.20 · ~22 days · Solar export today: $4.80 · Battery: 78% · TOU active  
Story: *prosumer, energy self-sufficiency goal, most complex profile*

---

## 6. Customer Document Schema

```json
{
  "id": "uk-02-david",
  "name": "David T.",
  "region": "uk",
  "segment": "vulnerable",
  "featureOverrides": {
    "emergencyCredit": true,
    "friendlyHours": true,
    "warmHomeReminder": true,
    "predictiveWarning": true,
    "meterReadSubmission": false
  },
  "account": {
    "balance": 4.20,
    "balanceCurrency": "GBP",
    "daysRemaining": 2,
    "daysRemainingBasis": "smart-actual",
    "emergencyCredit": {
      "available": true,
      "limit": 10.00,
      "drawn": 0.00
    },
    "debtBalance": 0,
    "tariff": "ember-standard",
    "meterType": "smart"
  },
  "paymentMethods": [
    { "type": "visa", "last4": "9871", "isDefault": true }
  ],
  "topUpConfig": {
    "auto": null,
    "scheduled": null
  },
  "alerts": {
    "lowBalanceThreshold": 5.00,
    "notificationsEnabled": true
  },
  "_seed": {
    "account": { "balance": 4.20, "daysRemaining": 2 }
  }
}
```

The `_seed` field stores original values for all mutable account fields. `resetCustomer()` reads from `_seed` and writes back to the live fields — no separate seed collection needed.

### Usage Subcollection Shape

```json
// /usage/uk-01-sarah/daily/2024-03-15
{
  "date": "2024-03-15",
  "kWh": 8.4,
  "cost": 2.94,
  "currency": "GBP"
}

// /usage/us-01-jordan/halfhourly/slot-14
{
  "slotIndex": 14,
  "startTime": "07:00",
  "kW": 2.1,
  "isTouPeak": false
}
```

---

## 7. Brand / Theme System

Stored client-side (not in Firestore) — purely presentational, no runtime update needed.

```json
{
  "ember": {
    "primaryColor": "#BA7517",
    "primaryLight": "#EF9F27",
    "primaryDark": "#412402",
    "surfaceColor": "#FAEEDA",
    "fontDisplay": "Georgia, serif",
    "appName": "Ember"
  },
  "solas": {
    "primaryColor": "#1D9E75",
    "primaryLight": "#5DCAA5",
    "primaryDark": "#04342C",
    "surfaceColor": "#E1F5EE",
    "fontDisplay": "'Helvetica Neue', Helvetica, sans-serif",
    "appName": "Solas"
  },
  "pulse": {
    "primaryColor": "#534AB7",
    "primaryLight": "#7F77DD",
    "primaryDark": "#26215C",
    "surfaceColor": "#EEEDFE",
    "fontDisplay": "'Arial Black', Arial, sans-serif",
    "appName": "PULSE"
  }
}
```

---

## 8. Demo Config Panel

A persistent toggle panel — this is what makes PAYGO a demo tool, not a mockup. All changes write to Firestore via Functions — changes are live on all connected devices.

### Access
- Floating wrench button, bottom-right, any consumer screen
- Slides up as a bottom sheet

### Panel Contents

**Section 1 — Active session** (read-only)  
Current region · Customer · Segment · "Reset to seed" button → `resetCustomer()`

**Section 2 — Feature toggles**  
Grouped by category. Each toggle writes to `featureOverrides` in the customer document. Region-impossible features greyed out with tooltip. Changes re-render via onSnapshot.

**Section 3 — Quick scenarios**  
Preset buttons applying a batch of flag overrides:
- "Standard UK" · "Vulnerable customer" · "Smart power user" · "Non-smart IE" · "EV + solar US"

**Section 4 — Balance state**  
4 presets: Critical / Low / Comfortable / High  
Calls `setBalanceState()` → writes to Firestore → dashboard re-renders live

---

## 9. Navigation Model

```
Shell                    Consumer App
──────                   ─────────────
Region Select   →        Brand theme loads, anonymous auth
Customer Select →        resolveConfig() called, feature set cached
                →        Home Dashboard — onSnapshot attached
                         │
                         ├── Top Up (modal/screen)
                         ├── Usage
                         ├── Payments
                         ├── Account (Switch demo / Reset)
                         └── Support
```

Bottom tab bar, 4–5 tabs, hidden (not disabled) when no active features.

---

## 10. Build Phases

### Phase 0 — Firebase Setup
- [ ] Firebase project + Firestore database provisioned
- [ ] Anonymous Auth enabled
- [ ] Seed data seeded to Firestore (all 6 profiles + subcollections)
- [ ] /config region + segment documents created
- [ ] Security rules: authenticated read / Functions-only write
- [ ] `resetCustomer()` and `setBalanceState()` Functions deployed

### Phase 1 — Shell + Config
- [ ] PAYGO splash + region selector
- [ ] Customer selector (Firestore getDocs by region)
- [ ] `resolveConfig()` call on customer select, session cache
- [ ] Brand theme switching
- [ ] Anonymous sign-in on launch

### Phase 2 — Core Consumer Screens
- [ ] Home dashboard (onSnapshot on customer doc)
- [ ] Manual top-up flow (A-02)
- [ ] Payment history (A-10)
- [ ] Balance + days remaining (smart and estimated variants)
- [ ] Low balance alert state
- [ ] Feature-gated bottom tab nav

### Phase 3 — Payment Model Screens
- [ ] Scheduled top-up (A-03)
- [ ] Auto top-up (A-04)
- [ ] Predictive warning banner
- [ ] Emergency credit flow (A-12)

### Phase 4 — Smart + Ecosystem Features
- [ ] Usage graph (A-07, getDocs daily subcollection)
- [ ] Real-time usage bar (A-08, onSnapshot halfhourly)
- [ ] TOU pricing (A-09)
- [ ] EV scheduler (A-16)
- [ ] Solar export (A-17)

### Phase 5 — Demo Config Panel
- [ ] Floating config button + bottom sheet
- [ ] Feature toggle writes to featureOverrides
- [ ] Balance preset buttons (setBalanceState)
- [ ] Scenario quick-load presets
- [ ] Reset to seed button

### Phase 6 — Non-Smart IE Variants
- [ ] Estimate-based days remaining logic
- [ ] Meter read submission (A-14)
- [ ] Scheduled-only top-up defaults

---

## 11. Key Design Constraints

| Constraint | Implication |
|---|---|
| Must run on real phones | PWA recommended for Phase 1. React Native as upgrade path. Firebase SDK identical in both. |
| Neutral shell, branded interior | Theme token swap on region select. PAYGO shell uses no brand colour. |
| Firestore-backed | All reads via Firestore SDK. Offline cache handles connectivity loss. No bundled JSON fallback needed. |
| IE non-smart | Smart-dependent features hidden at config resolution time, not in UI logic. |
| Demo-safe | No real payment UI. Config Panel writes via Functions only — no direct client writes to Firestore. |
| Multi-device sync | onSnapshot means two phones on the same customer profile stay in sync when Config Panel mutates state. |
| Stakeholder use | Config Panel scenario presets are critical — SLT should never need to manually toggle flags in a live demo. |
| Modular by design | New feature = add flag to /config in Firestore + build screen. No structural code changes required. |

---

## 12. Open Questions

1. **Tech stack:** PWA (recommended — Firebase Hosting, shareable URL, fast iteration) vs React Native. Firebase SDK works identically in both.
2. **Distribution:** Firebase Hosting URL vs TestFlight / internal Android track?
3. **Firebase project:** New dedicated PAYGO project, or use an existing one?
4. **Config Panel access:** Internal-only, or can clients see/use it during a demo?
5. **Rules builder (A-05):** Complex UI — defer to Phase 4 or beyond.
6. **simulateUsage() Function:** High demo impact. Phase 5 stretch goal?
7. **Customer count per region:** Currently 2 each. Add UK tech-savvy for rules engine demo?
