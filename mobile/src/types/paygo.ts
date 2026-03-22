export type RegionCode = "UK" | "IE" | "US" | string;

export type FeatureFlags = Record<string, boolean>;

export interface RegionConfig {
  id: string;
  brand: string;
  currency: string;
  smartMeterAvailability: boolean;
  regulatoryContext?: string;
  capabilityOverrides?: FeatureFlags;
}

export interface SegmentConfig {
  id: string;
  featureFlags: FeatureFlags;
}

export interface CustomerAccount {
  balance: number;
  balanceCurrency: string;
  daysRemaining?: number;
  daysRemainingBasis?: string;
  emergencyCredit?: {
    enabled?: boolean;
    used?: boolean;
    remaining?: number;
  };
  debtBalance?: number;
  tariff?: string;
  meterType?: string;
}

export interface CustomerProfile {
  id: string;
  name: string;
  region: RegionCode;
  segment: string;
  featureOverrides?: FeatureFlags;
  scenarioOverrides?: FeatureFlags;
  account: CustomerAccount;
  paymentMethods?: Array<{ id: string; type: string; label?: string }>;
  topUpConfig?: {
    minAmount?: number;
    maxAmount?: number;
    autoTopUpEnabled?: boolean;
  };
  alerts?: {
    lowBalance?: boolean;
    predictiveWarning?: boolean;
    disconnectionWarning?: boolean;
  };
  _seed?: Record<string, unknown>;
}

export interface PaymentItem {
  id: string;
  date: string;
  amount: number;
  paymentType?: string;
  channel?: string;
  debtDeducted?: number;
  netCredit?: number;
  balanceBefore?: number;
  balanceAfter?: number;
}
