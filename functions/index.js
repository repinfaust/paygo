const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const AI_DAILY_LIMIT = 50;
const ALL_FEATURE_FLAGS = [
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
];

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
}

function mergeFlags(base, region, segment, customer) {
  return {
    ...(base || {}),
    ...(region || {}),
    ...(segment || {}),
    ...(customer || {}),
  };
}

exports.resolveConfig = onCall({ region: "europe-west2" }, async (request) => {
  requireAuth(request);

  const { customerId } = request.data || {};
  if (!customerId || typeof customerId !== "string") {
    throw new HttpsError("invalid-argument", "customerId is required.");
  }

  const customerSnap = await db.doc(`customers/${customerId}`).get();
  if (!customerSnap.exists) {
    throw new HttpsError("not-found", "Customer not found.");
  }

  const customer = customerSnap.data();
  const [regionsSnap, segmentsSnap] = await Promise.all([
    db.doc("config/regions").get(),
    db.doc("config/segments").get(),
  ]);

  const regionEntries = regionsSnap.data()?.entries || {};
  const segmentEntries = segmentsSnap.data()?.entries || {};

  const region = regionEntries[customer.region] || null;
  const segment = segmentEntries[customer.segment] || null;

  if (!region) {
    throw new HttpsError("failed-precondition", `Missing region config for ${customer.region}`);
  }

  const featureFlags = mergeFlags(
    {},
    region.capabilityOverrides || {},
    segment?.featureFlags || {},
    customer.featureOverrides || {},
    customer.scenarioOverrides || {},
  );

  if (region.smartMeterAvailability === false) {
    featureFlags.realTimeUsageBar = false;
    featureFlags.halfHourlyUsageData = false;
    featureFlags.demandResponseAlerts = false;
  }

  return {
    customerId,
    region: {
      id: customer.region,
      ...region,
    },
    segment: {
      id: customer.segment,
      ...(segment || {}),
    },
    featureFlags,
  };
});

exports.setBalanceState = onCall({ region: "europe-west2" }, async (request) => {
  requireAuth(request);

  const { customerId, delta, reason = "manual-topup" } = request.data || {};
  if (!customerId || typeof customerId !== "string") {
    throw new HttpsError("invalid-argument", "customerId is required.");
  }
  if (typeof delta !== "number" || !Number.isFinite(delta)) {
    throw new HttpsError("invalid-argument", "delta must be a number.");
  }

  const customerRef = db.doc(`customers/${customerId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(customerRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Customer not found.");
    }

    const customer = snap.data();
    const account = customer.account || {};
    const oldBalance = Number(account.balance || 0);
    const newBalance = Number((oldBalance + delta).toFixed(2));

    tx.set(
      customerRef,
      {
        account: {
          ...account,
          balance: newBalance,
        },
        alerts: {
          ...(customer.alerts || {}),
          lowBalance: newBalance < 20,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const paymentRef = db.collection(`payments/${customerId}/history`).doc();
    tx.set(paymentRef, {
      date: new Date().toISOString().slice(0, 10),
      amount: delta,
      paymentType: delta >= 0 ? "Top-Up" : "Adjustment",
      channel: "app-function",
      debtDeducted: 0,
      netCredit: delta,
      balanceBefore: oldBalance,
      balanceAfter: newBalance,
      reason,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return { ok: true };
});

exports.resetCustomer = onCall({ region: "europe-west2" }, async (request) => {
  requireAuth(request);

  const { customerId } = request.data || {};
  if (!customerId || typeof customerId !== "string") {
    throw new HttpsError("invalid-argument", "customerId is required.");
  }

  const customerRef = db.doc(`customers/${customerId}`);
  const snap = await customerRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Customer not found.");
  }

  const customer = snap.data();
  const seed = customer._seed || {};
  const originalAccount = seed.originalAccount;

  if (!originalAccount) {
    throw new HttpsError(
      "failed-precondition",
      "Customer seed does not include originalAccount. Re-import with reset baseline support.",
    );
  }

  await customerRef.set(
    {
      account: originalAccount,
      alerts: {
        ...(customer.alerts || {}),
        lowBalance: Number(originalAccount.balance || 0) < 20,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  logger.info("Customer reset", { customerId, uid: request.auth.uid });
  return { ok: true };
});

exports.setConfigFeatureOverride = onCall({ region: "europe-west2" }, async (request) => {
  requireAuth(request);

  const { scope, regionId, segmentId, flag, value } = request.data || {};
  if (!flag || typeof flag !== "string") {
    throw new HttpsError("invalid-argument", "flag is required.");
  }
  if (typeof value !== "boolean") {
    throw new HttpsError("invalid-argument", "value must be boolean.");
  }
  if (scope !== "region" && scope !== "segment") {
    throw new HttpsError("invalid-argument", "scope must be 'region' or 'segment'.");
  }

  if (scope === "region") {
    if (!regionId || typeof regionId !== "string") {
      throw new HttpsError("invalid-argument", "regionId is required for region scope.");
    }
    const ref = db.doc("config/regions");
    const snap = await ref.get();
    const entries = snap.data()?.entries || {};
    const target = entries[regionId];
    if (!target) {
      throw new HttpsError("not-found", `Region '${regionId}' not found.`);
    }
    await ref.set(
      {
        entries: {
          ...entries,
          [regionId]: {
            ...target,
            capabilityOverrides: {
              ...(target.capabilityOverrides || {}),
              [flag]: value,
            },
          },
        },
      },
      { merge: true },
    );
    return { ok: true };
  }

  if (!segmentId || typeof segmentId !== "string") {
    throw new HttpsError("invalid-argument", "segmentId is required for segment scope.");
  }
  const ref = db.doc("config/segments");
  const snap = await ref.get();
  const entries = snap.data()?.entries || {};
  const target = entries[segmentId];
  if (!target) {
    throw new HttpsError("not-found", `Segment '${segmentId}' not found.`);
  }
  await ref.set(
    {
      entries: {
        ...entries,
        [segmentId]: {
          ...target,
          featureFlags: {
            ...(target.featureFlags || {}),
            [flag]: value,
          },
        },
      },
    },
    { merge: true },
  );

  return { ok: true };
});

function emptyScenarioFlags() {
  return ALL_FEATURE_FLAGS.reduce((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});
}

function defaultScenarios() {
  return {
    "vulnerable-customer": {
      id: "vulnerable-customer",
      label: "Vulnerable customer",
      region: "UK",
      customerName: "David T.",
      balancePreset: "critical",
      balanceOverride: { balance: 3.2, daysRemaining: 1, daysRemainingBasis: "smart-meter" },
      featureOverrides: {
        ...emptyScenarioFlags(),
        emergencyCredit: true,
        friendlyHours: true,
        predictiveWarning: true,
        vulnerabilityFlag: true,
        lowBalanceAlert: true,
        scheduledTopUp: true,
        warmHomeReminder: true,
      },
      accountOverrides: { meterType: "smart", debtBalance: 75 },
    },
    "smart-power-user": {
      id: "smart-power-user",
      label: "Smart power user",
      region: "UK",
      customerName: "Sarah M.",
      balancePreset: "comfortable",
      balanceOverride: { balance: 34, daysRemaining: 17, daysRemainingBasis: "smart-meter" },
      featureOverrides: {
        ...emptyScenarioFlags(),
        balanceDisplay: true,
        daysRemainingEstimate: true,
        manualTopUp: true,
        autoTopUp: true,
        scheduledTopUp: true,
        rulesBasedTopUp: true,
        continuousBalanceMgmt: true,
        usageGraph: true,
        realTimeUsageBar: true,
        halfHourlyUsageData: true,
        touPricing: true,
        predictiveWarning: true,
        spendSummary: true,
        spendCapAlert: true,
        usageComparison: true,
      },
      accountOverrides: { meterType: "smart", debtBalance: 0 },
    },
    "non-smart-ie": {
      id: "non-smart-ie",
      label: "Non-smart IE",
      region: "IE",
      customerName: "Aoife R.",
      balancePreset: "low",
      balanceOverride: { balance: 9.5, daysRemaining: 4, daysRemainingBasis: "estimated" },
      featureOverrides: {
        ...emptyScenarioFlags(),
        balanceDisplay: true,
        daysRemainingEstimate: true,
        manualTopUp: true,
        scheduledTopUp: true,
        meterReadSubmission: true,
        lowBalanceAlert: true,
        paymentHistory: true,
        tariffDisplay: true,
      },
      accountOverrides: { meterType: "non-smart", debtBalance: 0 },
    },
    "ev-solar-us": {
      id: "ev-solar-us",
      label: "EV + solar US",
      region: "US",
      customerName: "Maya C.",
      balancePreset: "high",
      balanceOverride: { balance: 67, daysRemaining: 24, daysRemainingBasis: "smart-meter" },
      featureOverrides: {
        ...emptyScenarioFlags(),
        balanceDisplay: true,
        daysRemainingEstimate: true,
        manualTopUp: true,
        autoTopUp: true,
        touPricing: true,
        evChargingScheduler: true,
        solarExportSummary: true,
        batteryStatusWidget: true,
        realTimeUsageBar: true,
        usageGraph: true,
        halfHourlyUsageData: true,
        demandResponseAlerts: true,
        spendSummary: true,
        rulesBasedTopUp: true,
      },
      accountOverrides: { meterType: "smart", debtBalance: 0 },
    },
    "debt-recovery": {
      id: "debt-recovery",
      label: "Debt recovery",
      region: "IE",
      customerName: "Ciarán B.",
      balancePreset: "low",
      balanceOverride: { balance: 6, daysRemaining: 3, daysRemainingBasis: "estimated" },
      featureOverrides: {
        ...emptyScenarioFlags(),
        balanceDisplay: true,
        daysRemainingEstimate: true,
        manualTopUp: true,
        debtRepaymentPlan: true,
        scheduledTopUp: true,
        predictiveWarning: true,
        meterReadSubmission: true,
        lowBalanceAlert: true,
        paymentHistory: true,
        spendSummary: true,
        disconnectionWarning: true,
      },
      accountOverrides: { meterType: "non-smart", debtBalance: 120 },
    },
    "high-usage-spike": {
      id: "high-usage-spike",
      label: "High usage spike",
      region: "UK",
      customerName: "Sarah M.",
      balancePreset: "low",
      balanceOverride: { balance: 7.8, daysRemaining: 3, daysRemainingBasis: "smart-meter" },
      featureOverrides: {
        ...emptyScenarioFlags(),
        balanceDisplay: true,
        daysRemainingEstimate: true,
        manualTopUp: true,
        predictiveWarning: true,
        autoTopUp: true,
        usageGraph: true,
        realTimeUsageBar: true,
        lowBalanceAlert: true,
        spendCapAlert: true,
        aiAnalystCard: true,
      },
      accountOverrides: { meterType: "smart", debtBalance: 0 },
    },
    "payment-failure": {
      id: "payment-failure",
      label: "Payment failure",
      region: "UK",
      customerName: "David T.",
      balancePreset: "critical",
      balanceOverride: { balance: 1.5, daysRemaining: 1, daysRemainingBasis: "smart-meter" },
      featureOverrides: {
        ...emptyScenarioFlags(),
        balanceDisplay: true,
        daysRemainingEstimate: true,
        manualTopUp: true,
        emergencyCredit: true,
        disconnectionWarning: true,
        lowBalanceAlert: true,
        predictiveWarning: true,
        savedPaymentMethods: true,
        paymentHistory: true,
        vulnerabilityFlag: true,
        friendlyHours: true,
        warmHomeReminder: true,
      },
      paymentMethodStatus: "failed",
      accountOverrides: { meterType: "smart", debtBalance: 95 },
    },
    "new-install-flow": {
      id: "new-install-flow",
      label: "New install flow",
      region: "UK",
      customerName: "Sarah M.",
      balancePreset: "critical",
      balanceOverride: { balance: 0, daysRemaining: 0, daysRemainingBasis: "awaiting-first-topup" },
      featureOverrides: {
        ...emptyScenarioFlags(),
        balanceDisplay: true,
        daysRemainingEstimate: true,
        manualTopUp: true,
        lowBalanceAlert: true,
        savedPaymentMethods: true,
        tariffDisplay: true,
      },
      accountOverrides: { meterType: "smart", debtBalance: 0 },
    },
  };
}

async function loadScenarioById(scenarioId) {
  const defaultEntries = defaultScenarios();
  const configSnap = await db.doc("config/scenarios").get();
  const entries = configSnap.data()?.entries || {};
  return entries[scenarioId] || defaultEntries[scenarioId] || null;
}

async function resolveScenarioCustomer(scenario) {
  const normalize = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();

  const hasWord = (source, word) => normalize(source).includes(normalize(word));

  if (scenario.customerId) {
    const byIdRef = db.doc(`customers/${scenario.customerId}`);
    const byIdSnap = await byIdRef.get();
    if (byIdSnap.exists) {
      const data = byIdSnap.data();
      if (!scenario.region || data.region === scenario.region) {
        return { ref: byIdRef, data };
      }
    }
  }

  if (!scenario.region) {
    return null;
  }

  const regionSnap = await db.collection("customers").where("region", "==", scenario.region).get();
  if (regionSnap.empty) {
    return null;
  }

  if (scenario.customerName) {
    const expectedName = normalize(scenario.customerName);
    const exact = regionSnap.docs.find((docSnap) => normalize(docSnap.data().name) === expectedName);
    if (exact) {
      return { ref: exact.ref, data: exact.data() };
    }
  }

  const scenarioId = normalize(scenario.id);
  const ranked = regionSnap.docs
    .map((docSnap) => {
      const data = docSnap.data();
      let score = 0;
      const segment = normalize(data.segment);
      const meterType = normalize(data.account?.meterType);
      const debtBalance = Number(data.account?.debtBalance || 0);
      const hasDebtRisk = hasWord(segment, "debt") || debtBalance > 0;
      const vulnerable = hasWord(segment, "vulnerable") || Boolean(data.alerts?.lowBalance);
      const nonSmart = meterType.includes("non-smart") || meterType.includes("nonsmart");
      const balance = Number(data.account?.balance || 0);
      const daysRemaining = Number(data.account?.daysRemaining || 0);

      if (scenarioId.includes("vulnerable")) {
        if (vulnerable) score += 10;
        if (balance <= 10) score += 5;
        if (daysRemaining > 0 && daysRemaining <= 3) score += 4;
      }
      if (scenarioId.includes("payment-failure")) {
        if (vulnerable || hasDebtRisk) score += 9;
        if (balance <= 5) score += 5;
      }
      if (scenarioId.includes("debt-recovery")) {
        if (hasDebtRisk) score += 10;
        if (debtBalance > 0) score += 5;
      }
      if (scenarioId.includes("non-smart")) {
        if (nonSmart) score += 10;
      }
      if (scenarioId.includes("smart-power") || scenarioId.includes("high-usage") || scenarioId.includes("new-install")) {
        if (!vulnerable && !hasDebtRisk) score += 7;
        if (!nonSmart) score += 4;
      }
      if (scenarioId.includes("ev-solar")) {
        const overrides = data.featureOverrides || {};
        if (overrides.evChargingScheduler || overrides.solarExportSummary) score += 10;
      }

      if (scenarioId.includes("new-install")) {
        if (balance <= 1) score += 6;
      } else if (scenarioId.includes("smart-power")) {
        if (balance >= 25) score += 4;
      } else if (scenarioId.includes("ev-solar")) {
        if (balance >= 40) score += 4;
      } else if (scenarioId.includes("critical") || scenarioId.includes("vulnerable") || scenarioId.includes("payment-failure")) {
        score += Math.max(0, 5 - Math.min(5, Math.floor(balance / 5)));
      }

      return { docSnap, data, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (best) {
    return { ref: best.docSnap.ref, data: best.data };
  }

  return null;
}

exports.applyScenario = onCall({ region: "europe-west2" }, async (request) => {
  requireAuth(request);

  const { scenarioId } = request.data || {};
  if (!scenarioId || typeof scenarioId !== "string") {
    throw new HttpsError("invalid-argument", "scenarioId is required.");
  }

  const scenario = await loadScenarioById(scenarioId);
  if (!scenario) {
    throw new HttpsError("not-found", `Scenario '${scenarioId}' not found.`);
  }

  const customer = await resolveScenarioCustomer(scenario);
  if (!customer) {
    throw new HttpsError("not-found", `Customer for scenario '${scenarioId}' not found.`);
  }

  const account = customer.data.account || {};
  const featureOverrides = scenario.featureOverrides || {};
  const balance = Number(scenario.balanceOverride?.balance ?? account.balance ?? 0);
  const daysRemaining = Number(scenario.balanceOverride?.daysRemaining ?? account.daysRemaining ?? 0);
  const daysRemainingBasis = scenario.balanceOverride?.daysRemainingBasis || account.daysRemainingBasis;
  const accountOverrides = scenario.accountOverrides || {};

  const alerts = {
    ...(customer.data.alerts || {}),
    lowBalance: balance < 20,
    predictiveWarning: Boolean(featureOverrides.predictiveWarning),
    disconnectionWarning: Boolean(featureOverrides.disconnectionWarning),
  };

  const update = {
    account: {
      ...account,
      ...accountOverrides,
      balance,
      daysRemaining,
      daysRemainingBasis,
    },
    alerts,
    scenarioOverrides: featureOverrides,
    scenarioMeta: {
      id: scenario.id || scenarioId,
      label: scenario.label || scenarioId,
      region: scenario.region || customer.data.region,
      appliedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (scenario.paymentMethodStatus) {
    const methods = Array.isArray(customer.data.paymentMethods) ? [...customer.data.paymentMethods] : [];
    if (methods.length === 0) {
      methods.push({ id: "pm-1", type: "card", label: "Primary" });
    }
    methods[0] = { ...methods[0], status: scenario.paymentMethodStatus };
    update.paymentMethods = methods;
  }

  await customer.ref.set(update, { merge: true });

  logger.info("Scenario applied", {
    scenarioId,
    region: scenario.region,
    customerId: customer.ref.id,
    uid: request.auth.uid,
  });

  return {
    ok: true,
    scenarioId,
    regionId: scenario.region || customer.data.region,
    customerId: customer.ref.id,
    label: scenario.label || scenarioId,
  };
});

exports.resetScenarioState = onCall({ region: "europe-west2" }, async (request) => {
  requireAuth(request);

  const { customerId } = request.data || {};
  if (!customerId || typeof customerId !== "string") {
    throw new HttpsError("invalid-argument", "customerId is required.");
  }

  const customerRef = db.doc(`customers/${customerId}`);
  const snap = await customerRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Customer not found.");
  }

  const customer = snap.data();
  const seed = customer._seed || {};
  const originalAccount = seed.originalAccount || customer.account || {};
  const originalAlerts = seed.originalAlerts || customer.alerts || {};
  const originalPaymentMethods = seed.originalPaymentMethods || customer.paymentMethods || [];

  await customerRef.set(
    {
      account: originalAccount,
      alerts: {
        ...originalAlerts,
        lowBalance: Number(originalAccount.balance || 0) < 20,
      },
      paymentMethods: originalPaymentMethods,
      scenarioOverrides: {},
      scenarioMeta: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  logger.info("Scenario reset", { customerId, uid: request.auth.uid });
  return { ok: true };
});

function dayKeyUTC(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

async function reserveAiCallQuota(uid, mode) {
  const dayKey = dayKeyUTC();
  const quotaRef = db.doc(`aiQuota/${dayKey}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(quotaRef);
    const count = Number(snap.data()?.count || 0);
    if (count >= AI_DAILY_LIMIT) {
      throw new HttpsError(
        "resource-exhausted",
        `Daily AI limit reached (${AI_DAILY_LIMIT} calls).`,
      );
    }

    tx.set(
      quotaRef,
      {
        dayKey,
        count: count + 1,
        limit: AI_DAILY_LIMIT,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const eventRef = db.collection(`aiQuota/${dayKey}/events`).doc();
    tx.set(eventRef, {
      uid,
      mode,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

function seasonFromDateISO(dateISO) {
  const date = dateISO ? new Date(dateISO) : new Date();
  const month = date.getUTCMonth() + 1;
  if ([12, 1, 2].includes(month)) return "winter";
  if ([3, 4, 5].includes(month)) return "spring";
  if ([6, 7, 8].includes(month)) return "summer";
  return "autumn";
}

function buildSystemPrompt(context) {
  const region = String(context?.region || "").toUpperCase();
  const regionRule = region === "IE"
    ? "Data quality: ESTIMATED. Meter reads occur infrequently. You MUST frame usage and days-remaining as estimates."
    : region === "US"
      ? "Data quality: HIGH. AMI meter data is available. You may reference time-of-use patterns only if touPricing is true."
      : "Data quality: HIGH. Smart meter reads are near-real-time. You may state usage figures with confidence.";

  const season = seasonFromDateISO(context?.nowISO);
  const customerName = context?.customer?.name || "Customer";
  const daysRemaining = context?.customer?.account?.daysRemaining;
  const daysRemainingBasis = context?.customer?.account?.daysRemainingBasis || "unknown";
  const meterType = context?.customer?.account?.meterType || "unknown";
  const tariff = context?.customer?.account?.tariff || "unknown";
  const balance = context?.customer?.account?.balance;
  const currency = context?.currency || "";
  const burnRate = context?.derivedBurnRate;
  const usageVariance = context?.usageVariance;
  const topUpFrequency = context?.topUpFrequency;
  const lastTopUp = context?.lastTopUp;

  return `You are an energy analyst assistant embedded in a prepayment energy app.
Your job is to interpret the customer's own energy and payment data and explain it in plain, friendly language.
You only interpret the data you are given.

Customer context:
Name: ${customerName}
Region: ${region}
Current balance: ${currency}${balance ?? "unknown"}
Days remaining (estimated): ${daysRemaining ?? "unknown"}
Days remaining basis: ${daysRemainingBasis}
Average daily spend (last 30 days): ${currency}${burnRate ?? "unknown"}
Last top-up: ${lastTopUp ? `${currency}${lastTopUp.amount} on ${lastTopUp.date}` : "unknown"}
Top-up frequency (last 90 days): ${topUpFrequency ?? "unknown"}
Tariff type: ${tariff}
Meter type: ${meterType}
Usage this week vs 4-week average: ${usageVariance ?? "unknown"}%
Season: ${season}

Market/data quality rule:
${regionRule}

RULES:
- Never recommend switching supplier or tariff
- Never discuss competitors
- Never fabricate missing data
- If data is insufficient, say so plainly
- Keep proactive insight to 3 sentences max
- Keep tone warm and plain
- For IE/non-smart, explicitly mark estimate language`;
}

function buildInsightRequest() {
  return `Return valid JSON only with this exact shape:
{
  "insight": "2-3 sentence insight",
  "confidenceLevel": "high" | "medium" | "low",
  "suggestedQuestions": ["Question 1?", "Question 2?", "Question 3?"]
}
Generate one useful observation about balance, usage pattern, or likely top-up need.`;
}

async function callOpenAI({ apiKey, messages, maxTokens = 300, jsonOutput = false }) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.4,
      max_tokens: maxTokens,
      ...(jsonOutput ? { response_format: { type: "json_object" } } : {}),
      messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    logger.error("OpenAI call failed", { status: response.status, body: body.slice(0, 400) });
    throw new HttpsError("internal", "AI request failed.");
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new HttpsError("internal", "AI response empty.");
  }
  return content;
}

function normalizeInsightPayload(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new HttpsError("internal", "Invalid AI JSON.");
  }
  const insight = String(parsed?.insight || "").trim();
  const confidence = ["high", "medium", "low"].includes(parsed?.confidenceLevel)
    ? parsed.confidenceLevel
    : "medium";
  const suggestedQuestions = Array.isArray(parsed?.suggestedQuestions)
    ? parsed.suggestedQuestions.map((q) => String(q).trim()).filter(Boolean).slice(0, 3)
    : [];
  if (!insight) {
    throw new HttpsError("internal", "AI insight missing.");
  }
  return {
    insight,
    confidenceLevel: confidence,
    suggestedQuestions: suggestedQuestions.length ? suggestedQuestions : ["How much should I top up next?", "Why is my balance changing?", "What should I watch this week?"],
  };
}

exports.aiAnalyst = onCall({ region: "europe-west2", secrets: [OPENAI_API_KEY] }, async (request) => {
  requireAuth(request);
  const apiKey = OPENAI_API_KEY.value();
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "OPENAI_API_KEY is not configured.");
  }

  const { mode, context, history, question } = request.data || {};
  if (mode !== "insight" && mode !== "followup") {
    throw new HttpsError("invalid-argument", "mode must be 'insight' or 'followup'.");
  }
  if (!context || typeof context !== "object") {
    throw new HttpsError("invalid-argument", "context is required.");
  }

  await reserveAiCallQuota(request.auth.uid, mode);
  const systemPrompt = buildSystemPrompt(context);

  if (mode === "insight") {
    const content = await callOpenAI({
      apiKey,
      jsonOutput: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: buildInsightRequest() },
      ],
      maxTokens: 300,
    });

    const payload = normalizeInsightPayload(content);
    const regionCode = String(context?.region || "").toUpperCase();
    const meterType = String(context?.customer?.account?.meterType || "").toLowerCase();
    const daysRemainingBasis = String(context?.customer?.account?.daysRemainingBasis || "").toLowerCase();
    const shouldShowEstimateCaveat =
      regionCode === "IE" && (meterType === "non-smart" || daysRemainingBasis.includes("estimate"));

    return {
      ok: true,
      ...payload,
      caveat: shouldShowEstimateCaveat ? "Based on estimated usage data." : null,
    };
  }

  const cleanedHistory = Array.isArray(history)
    ? history
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-12)
    : [];
  const cleanedQuestion = String(question || "").trim();
  if (!cleanedQuestion) {
    throw new HttpsError("invalid-argument", "question is required for followup.");
  }

  const followupText = await callOpenAI({
    apiKey,
    jsonOutput: false,
    messages: [
      { role: "system", content: systemPrompt },
      ...cleanedHistory,
      { role: "user", content: cleanedQuestion },
    ],
    maxTokens: 220,
  });

  return { ok: true, answer: followupText.trim() };
});
