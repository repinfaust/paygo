# Testing Strategy — PAYGO

## Primary test objective
Prove that the app behaves credibly on iPhone across different regions, customers, and feature combinations.

## Test layers
### 1. Structural tests
- region selection loads correct customers
- customer selection resolves config successfully
- brand theme switches correctly
- hidden features stay hidden when flags are off

### 2. Data tests
- customer doc subscription updates dashboard
- payment history fetches correctly
- smart vs non-smart data paths behave as expected
- seed reset restores mutable fields

### 3. Persona tests
Validate each seed profile for:
- correct currency
- correct feature availability
- believable dashboard composition
- sensible balance/days state

### 4. Demo tests
- switching region/customer is stable
- app recovers from temporary network interruption after initial load
- presenter can navigate common journeys without dead ends
- low-balance and emergency states are visible when expected

### 5. iOS-specific tests
- simulator stability
- physical iPhone test for layout, keyboard, scroll, and bottom tab behaviour
- TestFlight readiness once first build is credible

## Initial smoke test list
1. Launch app.
2. Anonymous auth completes.
3. Select UK.
4. Select Sarah.
5. Confirm Ember theme and standard features.
6. Switch to David.
7. Confirm vulnerable features and low-balance state.
8. Switch to Ireland persona.
9. Confirm non-smart paths and absence of smart widgets.
10. Switch to US EV persona.
11. Confirm TOU/EV widgets if enabled.
