# Decisions — PAYGO

## D-001 — iOS-first delivery
Status: Accepted

The project will be built for iOS first.
Reason:
- explicit user instruction
- primary current need is rapid stakeholder/demo impact on iPhone
- Android parity can follow once the modular architecture is proven

## D-002 — Expo React Native as first implementation path
Status: Accepted

Although the build spec leaves PWA vs React Native open, the current branch will use Expo React Native.
Reason:
- supports iOS-first delivery directly
- keeps future Android path open
- still works well with Firebase-backed architecture

## D-003 — Firestore remains single source of truth
Status: Accepted

No authoritative demo/customer state should be hardcoded locally.
Reason:
- live mutation and multi-device sync are part of the value proposition

## D-004 — Config resolution remains runtime-driven
Status: Accepted

Feature availability must resolve from region + segment + profile overrides.
Reason:
- modular demo credibility depends on runtime switching

## D-005 — Minimal listener strategy
Status: Accepted

Only subscribe where live updates materially improve the demo.
Reason:
- avoids unnecessary reads and complexity during POC stage

## D-006 — Config panel is phase-later, not a blocker to MVP
Status: Accepted

The first usable iOS demo does not require the full config panel.
Reason:
- shell + persona-specific dashboard are the first proof points

## D-007 — No real payment processing in POC
Status: Accepted

Top-up flows are demonstrative only.
Reason:
- focus is proposition and interaction, not payment infrastructure


## D-008 — Expo Development Build required

Use Expo Development Build as the standard local/runtime path for this project.

Reason:
- aligns with usual delivery pattern
- allows native behaviour to be tested properly on iOS
- avoids false confidence from Expo Go limitations

## D-009 — Fix issues, do not bypass them

Implementation issues should be solved at root cause level. Temporary workarounds are allowed only when explicitly documented as temporary, with impact and removal criteria recorded.

Reason:
- keeps the POC credible
- prevents hidden technical debt from becoming foundation
- matches normal project standards for this codebase

## D-010 — UK is the primary market baseline
Status: Accepted

For design and implementation sequencing, UK (Ember) is the primary market baseline.
Reason:
- explicit current user instruction
- UK Ember screens are the first fidelity target before IE (Solas) and US (Pulse) parity passes
- avoids drift from intended stakeholder demo narrative

## D-011 — Figma is the visual source of truth for UI fidelity
Status: Accepted

When there is any discrepancy between implementation and screenshots/mock HTML, the Figma frame/component spec is authoritative for visual fidelity.
Reason:
- reduces ambiguity in spacing, type scale, and component structure
- enables precise, repeatable implementation and review
- prevents "close enough" interpretation during design-critical work
