# Architecture — PAYGO

## High-level model
PAYGO consists of:

1. neutral shell app
2. region selector
3. customer selector
4. branded consumer experience
5. Firebase backend for config, customer state, usage, and payments
6. Functions layer for controlled mutations

## Architectural principles
- Runtime resolution over hardcoding
- Firestore as single source of truth
- modular screens behind feature flags
- minimal always-on listeners
- real-phone reliability over theoretical elegance
- demo-safe mutation paths

## iOS-first implementation decision
For this project, the implementation path is:

- Expo React Native
- iOS simulator/device first
- architecture kept cross-platform where possible
- no Android-specific work unless needed for shared code or future parity

This overrides the spec's open question about PWA vs React Native for the current branch.

## Runtime flow
1. App launches
2. Anonymous Firebase Auth session established
3. Region selected
4. Customer list fetched for region
5. Customer selected
6. Config resolved from region + segment + profile overrides
7. Theme applied
8. Dashboard mounts and attaches live listeners
9. Feature-gated navigation renders
10. Demo mutations propagate via Firestore and Functions

## Data access pattern
Subscribe:
- customer document
- halfhourly usage only where live usage is active

Fetch once:
- payment history
- rate cards
- daily usage history
- other non-live supporting data

## Mutation pattern
Allowed mutation route:
- app invokes Functions
- Functions validate / write Firestore
- listeners propagate UI updates

Avoid:
- direct client writes to canonical data
- duplicated local business logic for config resolution

## Modularity rule
A new feature should usually require:
1. new flag in config model
2. optional screen/component implementation
3. inclusion in config resolution
4. gated navigation/display

It should not require structural rewrites across the app.
