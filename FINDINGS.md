# Findings — PAYGO

## F-001 — Build spec contains a stack fork
The source spec frames PWA as recommended for Phase 1 while also leaving React Native open. Current project direction is now explicitly iOS-first, so this SoRR pack resolves that ambiguity in favour of Expo React Native.

## F-002 — Demo credibility depends heavily on config quality
The architecture is only as convincing as the seed data, persona realism, and config-driven differentiation. If customer profiles feel too similar, the modular story weakens.

## F-003 — The dashboard is the first moment of truth
If the dashboard does not visibly differentiate customer types and regions, the broader architecture will feel theoretical.

## F-004 — Config panel is valuable but not the first proof point
The first impression comes from believable region/persona switching, not from internal tooling. The config panel increases demo power later.

## F-005 — Current implementation has visual fidelity drift vs target designs
Recent implementation passes improved structure but still diverged from intended UK Ember visual spec (layout density, typography scale, and component proportions).

Implication:
- visual trust is reduced for stakeholder demo quality
- work must proceed frame-by-frame from canonical design source rather than interpretation

## F-006 — UK-first fidelity pass is required before cross-market parity
To prevent compounding inconsistencies, Ember (UK) should be matched first to approved design, then the same rigor applied to Solas and Pulse.

## F-007 — AI insight quality depends on data confidence framing
AI insights are useful across markets, but Ireland/non-smart profiles must explicitly frame observations as estimates or trust drops quickly.

Implication:
- confidence/degradation logic is required in both prompt context and UI caveat rendering
- failure mode should be silent card omission rather than intrusive error UI

## F-008 — Customer-level AI flag writes reduce demo modularity
Persisting `aiAnalystCard` in customer overrides works technically but undermines segment/region-level narrative control.

Implication:
- config panel now targets segment/region scope directly
- resolved config remains authoritative and consistent across selected personas

## F-009 — Static quick-scenario chips reduced demo trust
Config panel quick scenarios were previously visual-only and did not apply full state changes.

Implication:
- scenario chips now trigger server-side scenario application with region/customer switching
- reset path now clears scenario layer and restores seeded customer state

## F-010 — Config regression risk requires a fixed smoke checklist
Recent regressions came from precedence drift between scenario overrides, scope-based feature flags, and config draft state in the panel.

Implication:
- every config-related change must run this smoke checklist before merge:
  - open config, toggle `AI Energy Analyst`, `Auto Top-up`, `Low Balance SMS`, verify they do not auto-reset
  - press `Apply Changes`, reopen config, verify persisted values
  - select a quick scenario, apply, verify region/customer switch and scenario effects
  - make a manual toggle change after scenario apply, verify scenario selection clears and manual changes persist
  - verify AI card render path for ON and OFF states
  - verify quota message path by forcing a limit breach
