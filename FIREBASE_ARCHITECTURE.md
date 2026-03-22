# Firebase Architecture — PAYGO

## Services in scope
- Firebase Auth (anonymous)
- Firestore
- Firebase Functions

## Auth
Anonymous sign-in only.
Reason:
- no login friction
- easy demo sessions
- adequate for controlled internal/client demo use

## Firestore responsibilities
- region and segment config
- customer profiles
- usage data
- payment history
- tariff/rate data
- demo state persistence

## Functions responsibilities
- resolveConfig()
- setBalanceState()
- resetCustomer()
- simulateUsage() later if approved

## Read strategy
Use subscriptions only where live value matters visibly.

Subscribe:
- active customer doc
- halfhourly usage where relevant

Fetch once:
- payment history
- daily usage
- tariffs
- auxiliary data

## Write strategy
Preferred rule:
- canonical state writes happen via Functions
- app should avoid direct writes to live customer state

Possible exception:
- if some UX setup flows later need direct writes for speed, the exception must be recorded in DECISIONS.md and reflected in security rules

## Offline behaviour
- Firestore persistence should remain enabled
- cached data should support demo continuity after initial load
- queued writes should sync when connection returns

## Security posture
For demo stage:
- authenticated anonymous sessions can read
- writes restricted to approved mutation path

Revisit only if external distribution expands beyond controlled demo use.
