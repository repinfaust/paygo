import fs from "node:fs";
import path from "node:path";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, getDocs, getFirestore, limit, orderBy, query, doc, getDoc } from "firebase/firestore";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const envPath = path.join(projectRoot, ".env.local");
if (!fs.existsSync(envPath)) throw new Error("Missing .env.local");

const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const [k, ...v] = l.split("=");
      return [k.trim(), v.join("=").trim()];
    }),
);

const app = initializeApp({
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
});

const auth = getAuth(app);
await signInAnonymously(auth);

const db = getFirestore(app);
const functions = getFunctions(app, "europe-west2");
const customerId = process.argv[2] || "CUS001";
const delta = Number(process.argv[3] || "5");

const customerRef = doc(db, "customers", customerId);
const before = await getDoc(customerRef);
if (!before.exists()) throw new Error(`Customer ${customerId} not found`);
const beforeBalance = Number(before.data().account?.balance ?? 0);

const historyQuery = query(
  collection(db, "payments", customerId, "history"),
  orderBy("createdAt", "desc"),
  limit(1),
);
const beforeHistory = await getDocs(historyQuery);
const beforeLatestId = beforeHistory.docs[0]?.id ?? null;

const fn = httpsCallable(functions, "setBalanceState");
await fn({ customerId, delta, reason: "smoke-test" });

const after = await getDoc(customerRef);
const afterBalance = Number(after.data().account?.balance ?? 0);

const afterHistory = await getDocs(historyQuery);
const afterLatestId = afterHistory.docs[0]?.id ?? null;

console.log(JSON.stringify({
  customerId,
  delta,
  beforeBalance,
  afterBalance,
  expectedBalance: Number((beforeBalance + delta).toFixed(2)),
  paymentDocChanged: beforeLatestId !== afterLatestId,
  newPaymentId: afterLatestId,
}, null, 2));
