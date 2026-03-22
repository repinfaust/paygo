# Data Model — PAYGO

## Collections
- /config
- /customers
- /usage
- /payments
- /rates

## Config model
### /config/regions/{region}
Holds:
- brand
- currency
- smart meter availability
- regulatory context
- region capability overrides

### /config/segments/{segment}
Holds:
- featureFlags enabled by segment

## Customer model
### /customers/{customerId}
Key fields:
- id
- name
- region
- segment
- featureOverrides
- account
- paymentMethods
- topUpConfig
- alerts
- _seed

### account
Contains:
- balance
- balanceCurrency
- daysRemaining
- daysRemainingBasis
- emergencyCredit state
- debtBalance
- tariff
- meterType

### _seed
Stores original mutable values for demo reset.

## Usage model
### /usage/{customerId}/daily/{dateDoc}
Contains daily usage and cost.

### /usage/{customerId}/halfhourly/{slotDoc}
Contains near-real-time slots for smart-capable personas.

## Payments model
### /payments/{customerId}/history/{paymentDoc}
Contains transaction history used by payment history screens.

## Rates model
### /rates/{rateId}
Contains tariff/rate information used by tariff or TOU flows.

## Schema discipline
- Do not collapse all subcollection data into bloated customer docs.
- Do not move seed state into a separate collection unless reset requirements become materially more complex.
- Do not create separate schemas per region; use shared schema plus config/capability differences.
