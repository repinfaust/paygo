import { baseFlags } from "../data/featureFlags";
import type { CustomerProfile, RegionConfig, SegmentConfig } from "../types/paygo";

export interface ResolvedConfig {
  region: RegionConfig;
  customer: CustomerProfile;
  featureFlags: Record<string, boolean>;
}

export function resolveConfig(
  region: RegionConfig,
  segment: SegmentConfig | null,
  customer: CustomerProfile,
): ResolvedConfig {
  const base = baseFlags();
  const merged = {
    ...base,
    ...(region.capabilityOverrides ?? {}),
    ...(segment?.featureFlags ?? {}),
    ...(customer.featureOverrides ?? {}),
    ...(customer.scenarioOverrides ?? {}),
  };

  // AI Analyst scope is segment/region (or scenario), not customer-level override.
  if (Object.prototype.hasOwnProperty.call(customer.scenarioOverrides ?? {}, "aiAnalystCard")) {
    merged.aiAnalystCard = Boolean(customer.scenarioOverrides?.aiAnalystCard);
  } else if (Object.prototype.hasOwnProperty.call(segment?.featureFlags ?? {}, "aiAnalystCard")) {
    merged.aiAnalystCard = Boolean(segment?.featureFlags?.aiAnalystCard);
  } else if (Object.prototype.hasOwnProperty.call(region.capabilityOverrides ?? {}, "aiAnalystCard")) {
    merged.aiAnalystCard = Boolean(region.capabilityOverrides?.aiAnalystCard);
  } else {
    merged.aiAnalystCard = Boolean(base.aiAnalystCard);
  }

  if (!region.smartMeterAvailability) {
    merged.realTimeUsageBar = false;
    merged.halfHourlyUsageData = false;
    merged.demandResponseAlerts = false;
  }

  return {
    region,
    customer,
    featureFlags: merged,
  };
}
