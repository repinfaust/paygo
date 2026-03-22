import fs from "node:fs";
import path from "node:path";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const envPath = path.join(projectRoot, ".env.local");
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
const userCred = await signInAnonymously(auth);
const functions = getFunctions(app, "europe-west2");
const fn = httpsCallable(functions, "setBalanceState");

const customerId = process.argv[2] || "CUS001";
const delta = Number(process.argv[3] || "5");
const res = await fn({ customerId, delta, reason: "smoke-test" });

console.log(JSON.stringify({ uid: userCred.user.uid, customerId, delta, functionResult: res.data }, null, 2));
