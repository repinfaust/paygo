# Current Status — PAYGO

Date: 2026-03-22

## Active focus
- Enforce high-fidelity implementation against approved designs.
- Start with UK Ember as primary market baseline.
- Use Figma as the canonical source for spacing, typography, and component structure.

## Immediate execution order
1. Match UK Ember screens to Figma frame(s) with no visual drift.
2. Validate on iPhone 17 simulator using Expo Development Build.
3. Repeat fidelity process for IE Solas and US Pulse.

## Constraints in force
- Keep shell/brand separation.
- Keep Firestore as source of truth.
- Keep Functions-only mutation pattern.
- Do not use Expo Go for validation requiring native behaviour.
