import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import XLSX from "xlsx";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const repoRoot = path.resolve(projectRoot, "..");
const envPath = path.join(projectRoot, ".env.local");

if (!fs.existsSync(envPath)) {
  console.error("Missing mobile/.env.local. Create it first (see scripts/bootstrap-firebase-env.sh).");
  process.exit(1);
}

const envLines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
const env = {};
for (const line of envLines) {
  if (!line || line.trim().startsWith("#") || !line.includes("=")) {
    continue;
  }
  const [k, ...rest] = line.split("=");
  env[k.trim()] = rest.join("=").trim();
}

const firebaseConfig = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

for (const [k, v] of Object.entries(firebaseConfig)) {
  if (!v) {
    console.error(`Missing env value: ${k}`);
    process.exit(1);
  }
}

const workbookPath = process.argv[2] || path.join(repoRoot, "seed", "payg_seed_data_v4.xlsx");
if (!fs.existsSync(workbookPath)) {
  console.error(`Workbook not found: ${workbookPath}`);
  process.exit(1);
}

const workbook = XLSX.readFile(workbookPath, { cellDates: true });
const profiles = XLSX.utils.sheet_to_json(workbook.Sheets.Customer_Profiles, { defval: null });
const reads = XLSX.utils.sheet_to_json(workbook.Sheets.Meter_Reads, { defval: null });
const payments = XLSX.utils.sheet_to_json(workbook.Sheets.Payment_History, { defval: null });

const SEGMENT_FEATURES = {
  traditional_basic: {
    balanceDisplay: true,
    daysRemainingEstimate: true,
    manualTopUp: true,
    paymentHistory: true,
    lowBalanceAlert: true,
    tariffDisplay: true,
    meterReadSubmission: true,
  },
  smart_standard: {
    balanceDisplay: true,
    daysRemainingEstimate: true,
    manualTopUp: true,
    scheduledTopUp: true,
    autoTopUp: true,
    paymentHistory: true,
    lowBalanceAlert: true,
    usageGraph: true,
    realTimeUsageBar: true,
    halfHourlyUsageData: true,
    usageComparison: true,
    tariffDisplay: true,
  },
  vulnerable_support: {
    balanceDisplay: true,
    daysRemainingEstimate: true,
    manualTopUp: true,
    paymentHistory: true,
    lowBalanceAlert: true,
    predictiveWarning: true,
    emergencyCredit: true,
    friendlyHours: true,
    vulnerabilityFlag: true,
    debtRepaymentPlan: true,
    warmHomeReminder: true,
  },
  eco_advanced: {
    balanceDisplay: true,
    daysRemainingEstimate: true,
    manualTopUp: true,
    scheduledTopUp: true,
    autoTopUp: true,
    paymentHistory: true,
    lowBalanceAlert: true,
    usageGraph: true,
    realTimeUsageBar: true,
    touPricing: true,
    evChargingScheduler: true,
    solarExportSummary: true,
    batteryStatusWidget: true,
    halfHourlyUsageData: true,
    demandResponseAlerts: true,
    usageComparison: true,
  },
};

const REGION_ENTRIES = {
  UK: {
    brand: "Ember",
    currency: "GBP",
    smartMeterAvailability: true,
    regulatoryContext: "UK Ofgem PAYG",
    capabilityOverrides: { friendlyHours: true, disconnectionWarning: true },
  },
  IE: {
    brand: "Solas",
    currency: "EUR",
    smartMeterAvailability: false,
    regulatoryContext: "CRU PAYG",
    capabilityOverrides: { meterReadSubmission: true, realTimeUsageBar: false, halfHourlyUsageData: false },
  },
  US: {
    brand: "Pulse",
    currency: "USD",
    smartMeterAvailability: true,
    regulatoryContext: "Utility prepay",
    capabilityOverrides: { touPricing: true },
  },
};

function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return null;
  return parsed.toISOString().slice(0, 10);
}

function toNumber(value, fallback = 0) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.-]/g, "");
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : fallback;
  }
  return fallback;
}

function yes(value) {
  return ["yes", "true", "y", "1"].includes(String(value ?? "").trim().toLowerCase());
}

function inferSegment(profile) {
  if (yes(profile.Vulnerability_Flag) || yes(profile.PSR_Registered)) {
    return "vulnerable_support";
  }
  if (yes(profile.EV_Owner)) {
    return "eco_advanced";
  }
  const meter = String(profile.Meter_Type ?? "").toLowerCase();
  if (meter.includes("smart") || meter.includes("ami")) {
    return "smart_standard";
  }
  return "traditional_basic";
}

function cleanObject(value) {
  if (Array.isArray(value)) {
    return value.map(cleanObject);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined || Number.isNaN(v)) continue;
      out[k] = cleanObject(v);
    }
    return out;
  }
  return value;
}

function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((v) => toFirestoreValue(v)) } };
  }
  if (typeof value === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function toFirestoreDoc(data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    fields[k] = toFirestoreValue(v);
  }
  return { fields };
}

const customers = profiles.map((profile) => {
  const region = String(profile.Market ?? "").toUpperCase();
  const segment = inferSegment(profile);
  const balance = toNumber(profile.Est_Monthly_Spend, 80) * 0.4;
  return {
    id: String(profile.Customer_ID),
    name: String(profile.Name),
    region,
    segment,
    featureOverrides: {},
    account: {
      balance,
      balanceCurrency: region === "IE" ? "EUR" : region === "US" ? "USD" : "GBP",
      daysRemaining: Math.max(3, Math.round(balance / Math.max(1, toNumber(profile.Est_Monthly_Spend, 100) / 30))),
      daysRemainingBasis: "estimated",
      emergencyCredit: {
        enabled: segment === "vulnerable_support",
        used: false,
        remaining: segment === "vulnerable_support" ? 20 : 0,
      },
      debtBalance: toNumber(profile.Outstanding_Debt, 0),
      tariff: segment.includes("smart") || segment.includes("eco") ? "smart-flex" : "standard",
      meterType: String(profile.Meter_Type ?? "unknown"),
    },
    paymentMethods: [{ id: "card-default", type: "card", label: "Primary card" }],
    topUpConfig: {
      minAmount: 5,
      maxAmount: 250,
      autoTopUpEnabled: segment === "smart_standard" || segment === "eco_advanced",
    },
    alerts: {
      lowBalance: true,
      predictiveWarning: segment === "vulnerable_support",
      disconnectionWarning: true,
    },
    _seed: {
      source: "payg_seed_data_v4.xlsx",
      importedAt: new Date().toISOString(),
      originalAccount: {
        balance,
        balanceCurrency: region === "IE" ? "EUR" : region === "US" ? "USD" : "GBP",
        daysRemaining: Math.max(3, Math.round(balance / Math.max(1, toNumber(profile.Est_Monthly_Spend, 100) / 30))),
        daysRemainingBasis: "estimated",
        emergencyCredit: {
          enabled: segment === "vulnerable_support",
          used: false,
          remaining: segment === "vulnerable_support" ? 20 : 0,
        },
        debtBalance: toNumber(profile.Outstanding_Debt, 0),
        tariff: segment.includes("smart") || segment.includes("eco") ? "smart-flex" : "standard",
        meterType: String(profile.Meter_Type ?? "unknown"),
      },
      raw: profile,
    },
  };
});

const usageDocs = reads.map((row) => {
  const customerId = String(row.Customer_ID);
  const periodEnd = toIsoDate(row.Period_End) ?? "unknown";
  const fuel = String(row.Fuel ?? "energy").toLowerCase().replace(/[^a-z0-9]/g, "-");
  return {
    customerId,
    docId: `${periodEnd}-${fuel}`,
    payload: {
      date: periodEnd,
      fuel: row.Fuel,
      periodStart: toIsoDate(row.Period_Start),
      periodEnd,
      periodDays: toNumber(row.Period_Days, 0),
      periodKWh: toNumber(row.Period_kWh, 0),
      cumulativeKWh: toNumber(row.Cumulative_kWh, 0),
      periodCost: toNumber(row.Period_Cost, 0),
      currency: row.Currency,
    },
  };
});

const paymentDocs = payments.map((row) => ({
  customerId: String(row.Customer_ID),
  docId: String(row.Pay_ID),
  payload: {
    date: toIsoDate(row.Date),
    amount: toNumber(row.Amount, 0),
    paymentType: row.Payment_Type,
    channel: row.Channel,
    debtDeducted: toNumber(row.Debt_Deducted, 0),
    netCredit: toNumber(row.Net_Credit, 0),
    balanceBefore: toNumber(row.Balance_Before, 0),
    balanceAfter: toNumber(row.Balance_After, 0),
    emergencyCredit: toNumber(row.Emergency_Credit, 0),
    notes: row.Notes,
    currency: row.Currency,
  },
}));

const writes = [];

writes.push({ path: "config/regions", data: { entries: REGION_ENTRIES } });
writes.push({
  path: "config/segments",
  data: { entries: Object.fromEntries(Object.entries(SEGMENT_FEATURES).map(([k, v]) => [k, { featureFlags: v }])) },
});

for (const customer of customers) {
  writes.push({ path: `customers/${customer.id}`, data: cleanObject(customer) });
}

for (const item of usageDocs) {
  writes.push({ path: `usage/${item.customerId}/daily/${item.docId}`, data: cleanObject(item.payload) });
}

for (const item of paymentDocs) {
  writes.push({ path: `payments/${item.customerId}/history/${item.docId}`, data: cleanObject(item.payload) });
}

writes.push({
  path: "rates/default",
  data: {
    updatedAt: new Date().toISOString(),
    regionRates: {
      UK: { standingCharge: 0.53, unitRate: 0.27, currency: "GBP" },
      IE: { standingCharge: 0.49, unitRate: 0.35, currency: "EUR" },
      US: { standingCharge: 0.41, unitRate: 0.19, currency: "USD" },
    },
  },
});

const accessToken = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
const commitUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents:commit`;

let idx = 0;
while (idx < writes.length) {
  const chunk = writes.slice(idx, idx + 400);
  const payload = {
    writes: chunk.map((item) => ({
      update: {
        name: `projects/${firebaseConfig.projectId}/databases/(default)/documents/${item.path}`,
        ...toFirestoreDoc(item.data),
      },
    })),
  };

  const res = await fetch(commitUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Commit failed (${res.status}): ${errBody}`);
  }

  idx += 400;
  console.log(`Committed ${Math.min(idx, writes.length)}/${writes.length} writes`);
}

console.log(`Seed import complete for ${customers.length} customers.`);
