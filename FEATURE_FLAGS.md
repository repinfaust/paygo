# Feature Flags — PAYGO

## Purpose
Feature flags determine what the selected customer/session can see and do. They are resolved from:

1. base defaults
2. region capabilities
3. segment preset
4. customer profile overrides

## Resolution rule
Resolved config is the source of truth for UI gating.

## Current feature groups
### Balance and visibility
- balanceDisplay
- daysRemainingEstimate
- usageGraph
- realTimeUsageBar

### Top-up models
- manualTopUp
- scheduledTopUp
- autoTopUp
- rulesBasedTopUp
- continuousBalanceMgmt

### Alerts and notifications
- lowBalanceAlert
- predictiveWarning
- disconnectionWarning
- spendCapAlert

### Payment management
- savedPaymentMethods
- paymentHistory
- spendSummary
- debtRepaymentPlan

### Vulnerability and safety
- emergencyCredit
- friendlyHours
- warmHomeReminder
- vulnerabilityFlag

### Smart and real-time
- touPricing
- demandResponseAlerts
- halfHourlyUsageData
- usageComparison

### Ecosystem
- evChargingScheduler
- solarExportSummary
- batteryStatusWidget

### Account management
- meterReadSubmission
- tariffDisplay
- referralScheme
- multiPropertyView

## UI rules
- Hidden beats disabled unless there is explicit demo value in explaining an unavailable feature.
- Region-impossible features should not appear as active even if a segment would normally enable them.
- Home/dashboard composition must respect resolved flags, not persona name shortcuts.

## Known examples
- IE non-smart personas should not surface real-time smart features.
- vulnerable profiles may surface emergency credit and predictive warning.
- US EV and solar profiles may surface TOU and ecosystem widgets.
