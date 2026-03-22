export const ALL_FEATURE_FLAGS = [
  "balanceDisplay",
  "daysRemainingEstimate",
  "usageGraph",
  "realTimeUsageBar",
  "manualTopUp",
  "scheduledTopUp",
  "autoTopUp",
  "rulesBasedTopUp",
  "continuousBalanceMgmt",
  "lowBalanceAlert",
  "predictiveWarning",
  "disconnectionWarning",
  "spendCapAlert",
  "savedPaymentMethods",
  "paymentHistory",
  "spendSummary",
  "debtRepaymentPlan",
  "emergencyCredit",
  "friendlyHours",
  "warmHomeReminder",
  "vulnerabilityFlag",
  "touPricing",
  "demandResponseAlerts",
  "halfHourlyUsageData",
  "usageComparison",
  "evChargingScheduler",
  "solarExportSummary",
  "batteryStatusWidget",
  "meterReadSubmission",
  "tariffDisplay",
  "referralScheme",
  "multiPropertyView",
  "aiAnalystCard",
] as const;

export function baseFlags(): Record<string, boolean> {
  return ALL_FEATURE_FLAGS.reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});
}
