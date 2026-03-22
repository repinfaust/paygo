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
