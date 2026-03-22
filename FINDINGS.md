# Findings — PAYGO

## F-001 — Build spec contains a stack fork
The source spec frames PWA as recommended for Phase 1 while also leaving React Native open. Current project direction is now explicitly iOS-first, so this SoRR pack resolves that ambiguity in favour of Expo React Native.

## F-002 — Demo credibility depends heavily on config quality
The architecture is only as convincing as the seed data, persona realism, and config-driven differentiation. If customer profiles feel too similar, the modular story weakens.

## F-003 — The dashboard is the first moment of truth
If the dashboard does not visibly differentiate customer types and regions, the broader architecture will feel theoretical.

## F-004 — Config panel is valuable but not the first proof point
The first impression comes from believable region/persona switching, not from internal tooling. The config panel increases demo power later.
