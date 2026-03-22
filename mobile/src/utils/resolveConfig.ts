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
  const merged = {
    ...baseFlags(),
    ...(region.capabilityOverrides ?? {}),
    ...(segment?.featureFlags ?? {}),
    ...(customer.featureOverrides ?? {}),
    ...(customer.scenarioOverrides ?? {}),
  };

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
