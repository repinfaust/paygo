# AI Constraints — PAYGO

## Non-negotiable rules
1. Do not invent screens, data models, or feature flags that are not grounded in SoRR docs.
2. Do not hardcode customer-specific or region-specific behaviour into UI logic unless explicitly approved in DECISIONS.md.
3. Do not move authoritative state into local app state or bundled JSON.
4. Do not let the client app write directly to Firestore if the approved pattern remains Functions-only writes.
5. Do not break the shell/brand separation.
6. Do not treat demo-only shortcuts as production architecture without marking them explicitly.
7. Do not remove feature-gating. Hide or show features through resolved config.
8. Do not build smart-meter-only flows in a way that breaks non-smart personas.
9. Do not optimise for Android first in this project branch.
10. Do not silently diverge from iOS-first assumptions.
11. Do not bypass, paper over, or route around real implementation issues just to keep momentum. Fix root causes unless an explicit temporary exception is recorded.
12. Do not guess missing technical details. Surface the gap, propose grounded options, and record the chosen path.
13. Use Expo Development Build for this project branch; do not rely on Expo Go where native behaviour needs proving.

## Required working method
- Read README.md, PRODUCT_REQUIREMENTS.md, ARCHITECTURE.md, DATA_MODEL.md, FEATURE_FLAGS.md, and DECISIONS.md before making structural changes.
- Check OPEN_QUESTIONS.md before locking implementation details that were previously undecided.
- Record new architectural choices in DECISIONS.md.
- Record discovered issues or mismatches in FINDINGS.md.
- When a blocker appears, diagnose it and fix it at source before introducing workarounds.
- If a request conflicts with SoRR, stop and surface the conflict explicitly.

## Hard-fail conditions
Stop and ask for correction if:

- region logic is being embedded directly into component code instead of config resolution
- a feature depends on direct Firestore client writes where Functions-only mutation is the rule
- a proposed screen depends on data not represented in the current schema
- an implementation choice undermines iOS-first delivery without explicit approval
- a demo shortcut would make the core architecture misleading or non-modular

## Truth hierarchy
1. Current user instruction
2. SoRR docs in this folder
3. Build spec
4. Existing codebase patterns
5. Agent assumptions

Anything below level 3 must not override levels 1–3.
