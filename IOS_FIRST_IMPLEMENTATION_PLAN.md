# iOS-First Implementation Plan — PAYGO

## Objective
Get a credible PAYGO demo running on iPhone as quickly as possible without undermining the modular backend model.

## Chosen path
- Expo React Native
- Firebase JS SDK / React Native compatible setup
- iOS simulator first, then physical iPhone build
- Expo Development Build as the main test/runtime path

## Why this path
- aligns with explicit iOS-first instruction
- keeps future Android path open
- allows real-device demo via TestFlight later
- avoids building a PWA-first artefact that does not match the intended device experience

## Immediate build order
### Step 1 — Foundation
- initialise Expo app
- connect Firebase project
- enable anonymous auth
- create theme tokens for Ember / Solas / Pulse
- create app shell and navigation skeleton

### Step 2 — Selection flow
- splash screen
- region selector
- customer selector with Firestore query
- session state store for active region/customer/resolved config

### Step 3 — Dashboard MVP
- customer doc subscription
- balance card
- days remaining card where applicable
- low-balance state handling
- quick top-up CTA
- conditional widgets from resolved config

### Step 4 — Credibility screens
- manual top-up
- payment history
- account screen
- support screen

### Step 5 — Persona differentiation
- scheduled top-up
- auto top-up
- emergency credit
- predictive warning

### Step 6 — Demo power-ups
- config panel
- scenario presets
- reset flow
- later: real-time smart views

## Avoid in first pass
- Android polish
- rules builder
- overly elaborate design system work
- production-grade payment implementation
- unnecessary backend abstraction before flows work
