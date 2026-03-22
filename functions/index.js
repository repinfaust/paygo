const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

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
