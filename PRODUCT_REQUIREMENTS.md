# Product Requirements — PAYGO

## Problem
Stakeholders need a convincing, interactive way to explore how prepaid energy experiences could vary by market, customer type, and feature model without commissioning fully bespoke builds for each scenario.

Static mockups are too shallow. Hardcoded demos are brittle. Pure slides do not prove architecture, responsiveness, or modularity.

## Product goal
Create a live, real-device demo app that can switch:

- region context
- consumer brand
- customer persona
- enabled feature set
- live account state

without code changes for each scenario.

## Success criteria
The first build succeeds if it can:

1. Run reliably on iPhone.
2. Let a user choose region and customer.
3. Resolve brand + feature configuration correctly.
4. Show a believable, persona-specific dashboard.
5. Demonstrate at least one live state mutation reflected immediately in UI.
6. Support multiple demo narratives without rebuilds.

## Users
### Primary
- internal stakeholders
- senior product / proposition / CPO / PD audiences
- client stakeholders during demos

### Secondary
- delivery teams using PAYGO as a modular prototype foundation

## Core user stories
- As a stakeholder, I want to switch between UK, IE, and US contexts so I can see market-specific experiences.
- As a presenter, I want to select a customer profile so I can demonstrate a relevant persona journey.
- As a stakeholder, I want the app to look branded to the selected market so the demo feels credible.
- As a presenter, I want feature availability to change automatically per profile so the product appears modular rather than mocked.
- As a presenter, I want balance and status changes to appear live so the demo feels real.
- As a stakeholder, I want to compare simple and advanced prepaid models without separate apps.

## Initial feature scope
Must-have:
- splash/loading
- region selector
- customer selector
- branded dashboard
- balance display
- days remaining where enabled
- manual top-up
- payment history
- alerts / warnings where applicable
- account/support shell

Should-have in early iterations:
- scheduled top-up
- auto top-up
- emergency credit
- low-balance warning states

Can-wait:
- rules builder
- simulateUsage
- advanced EV / solar interactions
- deeper scenario scripting

## Delivery principle
The first release is for impact and credibility, not completeness.
