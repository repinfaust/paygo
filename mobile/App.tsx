import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";

import { db, firebaseAuth, functions } from "./src/config/firebase";
import type { CustomerProfile, PaymentItem, RegionConfig, SegmentConfig } from "./src/types/paygo";
import { resolveConfig } from "./src/utils/resolveConfig";

type Route = "splash" | "region" | "customer" | "dashboard" | "topup" | "payments" | "support" | "account";

export default function App() {
  const [route, setRoute] = useState<Route>("splash");
  const [loading, setLoading] = useState(true);
  const [regions, setRegions] = useState<RegionConfig[]>([]);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<RegionConfig | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [segmentConfig, setSegmentConfig] = useState<SegmentConfig | null>(null);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [topUpAmount, setTopUpAmount] = useState("20");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, async (user) => {
      try {
        if (!user) {
          await signInAnonymously(firebaseAuth);
          return;
        }
        const regionsDoc = await getDoc(doc(db, "config", "regions"));
        const regionMap = (regionsDoc.data()?.entries ?? {}) as Record<string, Omit<RegionConfig, "id">>;
        const loaded = Object.entries(regionMap).map(([id, value]) => ({ id, ...value }));
        setRegions(loaded);
        setRoute("region");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Startup failed");
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!selectedRegion) {
      return;
    }
    const regionId = selectedRegion.id;

    let mounted = true;
    async function loadCustomers() {
      const q = query(collection(db, "customers"), where("region", "==", regionId));
      const snap = await getDocs(q);
      if (!mounted) {
        return;
      }
      setCustomers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CustomerProfile, "id">) })));
      setRoute("customer");
    }

    loadCustomers().catch((err) => setError(err instanceof Error ? err.message : "Customer fetch failed"));
    return () => {
      mounted = false;
    };
  }, [selectedRegion]);

  useEffect(() => {
    if (!selectedCustomer || !selectedRegion) {
      return;
    }

    getDoc(doc(db, "config", "segments"))
      .then((segmentDoc) => {
        const segmentEntries = (segmentDoc.data()?.entries ?? {}) as Record<string, Omit<SegmentConfig, "id">>;
        const entry = segmentEntries[selectedCustomer.segment];
        setSegmentConfig(entry ? { id: selectedCustomer.segment, ...entry } : null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Segment resolution failed"));

    const unsubCustomer = onSnapshot(doc(db, "customers", selectedCustomer.id), (snap) => {
      if (snap.exists()) {
        setSelectedCustomer({ id: snap.id, ...(snap.data() as Omit<CustomerProfile, "id">) });
      }
    });

    const paymentQuery = query(
      collection(db, "payments", selectedCustomer.id, "history"),
      orderBy("date", "desc"),
      limit(20),
    );

    const unsubPayments = onSnapshot(paymentQuery, (snap) => {
      setPayments(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PaymentItem, "id">),
        })),
      );
    });

    setRoute("dashboard");
    return () => {
      unsubCustomer();
      unsubPayments();
    };
  }, [selectedCustomer?.id, selectedRegion?.id]);

  const resolved = useMemo(() => {
    if (!selectedRegion || !selectedCustomer) {
      return null;
    }
    return resolveConfig(selectedRegion, segmentConfig, selectedCustomer);
  }, [selectedRegion, selectedCustomer, segmentConfig]);

  async function onTopUp() {
    if (!selectedCustomer) {
      return;
    }
    const amount = Number(topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Top-up amount must be positive");
      return;
    }

    try {
      const mutate = httpsCallable(functions, "setBalanceState");
      await mutate({ customerId: selectedCustomer.id, delta: amount, reason: "manual-topup" });
      setRoute("dashboard");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Top-up failed");
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.title}>Loading PAYGO...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <Pressable onPress={() => setError(null)} style={styles.button}>
          <Text style={styles.buttonText}>Dismiss</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (route === "region") {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Select Region</Text>
        <FlatList
          data={regions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => setSelectedRegion(item)}>
              <Text style={styles.cardTitle}>{item.id}</Text>
              <Text>{item.brand}</Text>
              <Text>{item.currency}</Text>
            </Pressable>
          )}
        />
      </SafeAreaView>
    );
  }

  if (route === "customer") {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Select Customer ({selectedRegion?.id})</Text>
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => setSelectedCustomer(item)}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text>{item.segment}</Text>
              <Text>{item.account?.meterType ?? "Unknown meter"}</Text>
            </Pressable>
          )}
        />
      </SafeAreaView>
    );
  }

  if (route === "topup") {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Manual Top-Up</Text>
        <TextInput value={topUpAmount} onChangeText={setTopUpAmount} style={styles.input} keyboardType="numeric" />
        <Pressable style={styles.button} onPress={onTopUp}>
          <Text style={styles.buttonText}>Submit via Function</Text>
        </Pressable>
        <Pressable onPress={() => setRoute("dashboard")}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (route === "payments") {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Payment History</Text>
        <FlatList
          data={payments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text>{item.date}</Text>
              <Text>{item.amount}</Text>
            </View>
          )}
        />
        <Pressable onPress={() => setRoute("dashboard")}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (route === "support") {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Support</Text>
        <Text>Demo support content for selected market.</Text>
        <Pressable onPress={() => setRoute("dashboard")}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (route === "account") {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Account</Text>
        <Text>Customer: {selectedCustomer?.name}</Text>
        <Text>Region: {selectedRegion?.id}</Text>
        <Pressable onPress={() => setRoute("dashboard")}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.balanceLabel}>Balance</Text>
      <Text style={styles.balanceValue}>
        {selectedCustomer?.account.balanceCurrency ?? selectedRegion?.currency} {selectedCustomer?.account.balance?.toFixed(2)}
      </Text>

      {resolved?.featureFlags.daysRemainingEstimate && (
        <Text>Days remaining: {selectedCustomer?.account.daysRemaining ?? "n/a"}</Text>
      )}
      {resolved?.featureFlags.lowBalanceAlert && (selectedCustomer?.account.balance ?? 0) < 20 && (
        <Text style={styles.warning}>Low balance warning active</Text>
      )}

      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={() => setRoute("topup")}>
          <Text style={styles.buttonText}>Manual Top-Up</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => setRoute("payments")}>
          <Text style={styles.buttonText}>Payment History</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => setRoute("support")}>
          <Text style={styles.buttonText}>Support</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => setRoute("account")}>
          <Text style={styles.buttonText}>Account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f6f8fb",
    gap: 10,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 10,
    marginBottom: 10,
    borderColor: "#d0d7e2",
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  balanceLabel: {
    fontSize: 12,
    color: "#465063",
  },
  balanceValue: {
    fontSize: 34,
    fontWeight: "800",
  },
  warning: {
    color: "#b10017",
    fontWeight: "600",
  },
  actions: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#d0d7e2",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  button: {
    backgroundColor: "#0a4fb3",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  buttonText: {
    color: "white",
    fontWeight: "700",
    textAlign: "center",
  },
  link: {
    color: "#0a4fb3",
    fontWeight: "700",
    marginTop: 12,
  },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#d0d7e2",
    borderRadius: 8,
    padding: 12,
  },
  error: {
    color: "#b10017",
    maxWidth: 300,
    textAlign: "center",
  },
});
