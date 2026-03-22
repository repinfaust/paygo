# PAYGO — SoRR Overview

Version: 0.1  
Status: Initial SoRR pack  
Project type: iOS-first demo app / stakeholder POC

## Purpose
PAYGO is a neutral wrapper app used to demo configurable prepaid energy journeys across multiple regions and customer types. The shell remains PAYGO-branded while the consumer experience switches by region/brand and customer profile.

The goal is not to ship a production consumer app. The goal is to create a credible, modular, real-device demo platform that proves:

- region-specific branding and capability switching
- customer-specific feature resolution at runtime
- live account state changes via Firestore
- strong demo impact for senior stakeholders and clients
- reusable architecture for future POCs and proposition testing

## Core truths
1. Nothing is hardcoded to a specific customer or region.
2. Firestore is the single source of truth.
3. Fix issues at source; do not bypass, mock around, or silently work around integration problems unless explicitly marked as temporary in DECISIONS.md and FINDINGS.md.
3. Features are resolved from config, not scattered across UI conditionals.
4. The app must run reliably on real phones.
5. The demo panel is part of the product, not an afterthought.
6. iOS-first delivery takes precedence for the first build.

## Current implementation stance
This SoRR pack assumes:

- iOS-first build path
- Expo React Native preferred for first implementation
- Expo Development Build required for local/native testing; do not use Expo Go as a substitute for app capabilities that need native verification
- Firebase Auth + Firestore + Functions backend
- Firestore-backed seed/demo data
- modular feature-gated screens
- neutral PAYGO shell with branded interior by region
- UK Ember as primary market baseline for first visual fidelity pass

## Initial scope
Phase 1–3 is the practical initial target:

- shell flow: splash, region select, customer select
- config resolution and theme loading
- home dashboard
- manual top-up
- payment history
- low-balance and days remaining states
- scheduled/auto top-up flows where applicable
- emergency credit for relevant personas

## Stretch / later impact items
- real-time usage bar
- TOU and smart usage features
- EV / solar views
- live config panel with scenario presets
- simulated balance drain for demos

## Source basis
This pack is derived from the PAYGO build specification v0.2 and adapted for an explicit iOS-first delivery path.
