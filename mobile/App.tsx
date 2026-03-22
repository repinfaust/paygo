import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import { Inter_400Regular, Inter_500Medium, Inter_700Bold, Inter_900Black } from "@expo-google-fonts/inter";
import { Newsreader_400Regular, Newsreader_500Medium } from "@expo-google-fonts/newsreader";
import { PlusJakartaSans_400Regular, PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans";
import { SpaceGrotesk_400Regular, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { httpsCallable } from "firebase/functions";

import { db, firebaseAuth, functions } from "./src/config/firebase";
import type { CustomerProfile, PaymentItem, RegionConfig, SegmentConfig } from "./src/types/paygo";
import { resolveConfig } from "./src/utils/resolveConfig";

type Route = "splash" | "region" | "customer" | "dashboard" | "topup" | "payments" | "support" | "account" | "config";
type Brand = "shell" | "ember" | "solas" | "pulse";

const TOKENS = {
  shell: {
    background: "#F8FAFC",
    text: "#0F172A",
    muted: "#64748B",
    accent: "#334155",
    card: "#FFFFFF",
    border: "#E2E8F0",
    button: "#51657f",
  },
  ember: {
    background: "#FDF9F4",
    surface: "#F7F3EE",
    text: "#1f1711",
    muted: "#6f5a49",
    primary: "#BA7517",
  },
  solas: {
    background: "#FCF9F6",
    surface: "#F2F6EE",
    text: "#141f1a",
    muted: "#5d6f66",
    primary: "#1D9E75",
    secondary: "#D2E6C5",
  },
  pulse: {
    background: "#020617",
    surface: "rgba(83,74,183,0.15)",
    card: "#17243a",
    text: "#E8EEFF",
    muted: "#8BA1C6",
    primary: "#534AB7",
    accent: "#22D3EE",
  },
};

export default function App() {
  const [route, setRoute] = useState<Route>("splash");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [regions, setRegions] = useState<RegionConfig[]>([]);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<RegionConfig | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [segmentConfig, setSegmentConfig] = useState<SegmentConfig | null>(null);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [topUpAmount, setTopUpAmount] = useState("20");
  const [configBalance, setConfigBalance] = useState(15);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    Inter_900Black,
    Newsreader_400Regular,
    Newsreader_500Medium,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_700Bold,
    SpaceGrotesk_400Regular,
    SpaceGrotesk_700Bold,
  });

  const brand: Brand = selectedRegion?.id === "UK" ? "ember" : selectedRegion?.id === "IE" ? "solas" : selectedRegion?.id === "US" ? "pulse" : "shell";

  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, async (user) => {
      try {
        if (!user) {
          await signInAnonymously(firebaseAuth);
          return;
        }
        const regionsDoc = await getDoc(doc(db, "config", "regions"));
        const regionMap = (regionsDoc.data()?.entries ?? {}) as Record<string, Omit<RegionConfig, "id">>;
        setRegions(Object.entries(regionMap).map(([id, value]) => ({ id, ...value })));
        setRoute("region");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Startup failed");
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!selectedRegion) return;
    getDocs(query(collection(db, "customers"), where("region", "==", selectedRegion.id)))
      .then((snap) => {
        setCustomers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CustomerProfile, "id">) })));
        setRoute("customer");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Customer fetch failed"));
  }, [selectedRegion]);

  useEffect(() => {
    if (!selectedCustomer) return;
    getDoc(doc(db, "config", "segments"))
      .then((segmentDoc) => {
        const segments = (segmentDoc.data()?.entries ?? {}) as Record<string, Omit<SegmentConfig, "id">>;
        const entry = segments[selectedCustomer.segment];
        setSegmentConfig(entry ? { id: selectedCustomer.segment, ...entry } : null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Segment resolution failed"));

    const unsubCustomer = onSnapshot(doc(db, "customers", selectedCustomer.id), (snap) => {
      if (snap.exists()) {
        setSelectedCustomer({ id: snap.id, ...(snap.data() as Omit<CustomerProfile, "id">) });
      }
    });

    const unsubPayments = onSnapshot(
      query(collection(db, "payments", selectedCustomer.id, "history"), orderBy("date", "desc"), limit(20)),
      (snap) => setPayments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PaymentItem, "id">) }))),
    );

    setRoute("dashboard");
    return () => {
      unsubCustomer();
      unsubPayments();
    };
  }, [selectedCustomer?.id]);

  const resolved = useMemo(() => {
    if (!selectedRegion || !selectedCustomer) return null;
    return resolveConfig(selectedRegion, segmentConfig, selectedCustomer);
  }, [selectedRegion, selectedCustomer, segmentConfig]);

  function goCustomer() {
    setSelectedCustomer(null);
    setSegmentConfig(null);
    setPayments([]);
    setRoute("customer");
  }

  function goHome() {
    setSelectedCustomer(null);
    setSegmentConfig(null);
    setPayments([]);
    setSelectedRegion(null);
    setRoute("region");
  }

  async function onTopUp() {
    if (!selectedCustomer) return;
    const amount = Number(topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Top-up amount must be positive");
      return;
    }
    try {
      const mutate = httpsCallable(functions, "setBalanceState");
      await mutate({ customerId: selectedCustomer.id, delta: amount, reason: "manual-topup" });
      setRoute("dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Top-up failed");
    }
  }

  async function onApplyConfig() {
    if (!selectedCustomer) return;
    const target = configBalance < 25 ? 8 : configBalance < 50 ? 25 : configBalance < 75 ? 80 : 160;
    const current = selectedCustomer.account.balance ?? 0;
    const delta = Number((target - current).toFixed(2));
    try {
      const mutate = httpsCallable(functions, "setBalanceState");
      await mutate({ customerId: selectedCustomer.id, delta, reason: "config-panel" });
      setRoute("dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Config apply failed");
    }
  }

  if (loading || !fontsLoaded) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[styles.full, { backgroundColor: TOKENS.shell.background }]}>
          <View style={styles.center}><ActivityIndicator color={TOKENS.shell.accent} /></View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (error) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[styles.full, { backgroundColor: TOKENS.shell.background }]}>
          <View style={styles.center}>
            <Text style={{ color: "#ba1a1a", fontFamily: "Inter_500Medium", fontSize: 16 }}>{error}</Text>
            <Pressable style={[styles.dismiss, { backgroundColor: TOKENS.shell.button }]} onPress={() => setError(null)}>
              <Text style={{ color: "white", fontFamily: "Inter_700Bold" }}>Dismiss</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.full, { backgroundColor: brand === "shell" ? TOKENS.shell.background : TOKENS[brand].background }]}> 
        {route === "region" && <RegionScreen regions={regions} onSelect={setSelectedRegion} />}

        {route === "customer" && (
          <CustomerScreen
            brand={brand}
            title={selectedRegion?.brand ?? "PAYGO"}
            customers={customers}
            onSelect={setSelectedCustomer}
            onHome={goHome}
          />
        )}

        {route === "dashboard" && selectedCustomer && selectedRegion && (
          <>
            <InnerHeader brand={brand} title={selectedRegion.brand} subtitle={selectedCustomer.name} onBack={goCustomer} onHome={goHome} />
            {brand === "ember" && (
              <EmberDashboard customer={selectedCustomer} onTopUp={() => setRoute("topup")} onPayments={() => setRoute("payments")} onSupport={() => setRoute("support")} onAccount={() => setRoute("account")} />
            )}
            {brand === "solas" && (
              <SolasDashboard customer={selectedCustomer} onTopUp={() => setRoute("topup")} onPayments={() => setRoute("payments")} onSupport={() => setRoute("support")} onAccount={() => setRoute("account")} />
            )}
            {brand === "pulse" && (
              <PulseDashboard customer={selectedCustomer} onTopUp={() => setRoute("topup")} onPayments={() => setRoute("payments")} onSupport={() => setRoute("support")} onAccount={() => setRoute("account")} />
            )}
            {resolved?.featureFlags.lowBalanceAlert && (selectedCustomer.account.balance ?? 0) < 20 && (
              <View style={styles.lowWarn}><Text style={styles.lowWarnText}>Low balance warning active</Text></View>
            )}
          </>
        )}

        {route === "topup" && (
          <SubScreen brand={brand} title="Manual Top-Up" subtitle={selectedCustomer?.name ?? ""} onBack={goCustomer} onHome={goHome}>
            <Text style={subStyles[brand].label}>Amount</Text>
            <TextInput value={topUpAmount} onChangeText={setTopUpAmount} keyboardType="numeric" style={subStyles[brand].input} />
            <PrimaryButton brand={brand} label="Submit via Function" onPress={onTopUp} />
          </SubScreen>
        )}

        {route === "payments" && (
          <SubScreen brand={brand} title="Payment History" subtitle={selectedCustomer?.name ?? ""} onBack={goCustomer} onHome={goHome}>
            <FlatList
              data={payments}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={subStyles[brand].row}><Text style={subStyles[brand].rowText}>{item.date}</Text><Text style={subStyles[brand].rowText}>{item.amount}</Text></View>
              )}
            />
          </SubScreen>
        )}

        {route === "support" && (
          <SubScreen brand={brand} title="Support" subtitle={selectedRegion?.id ?? ""} onBack={goCustomer} onHome={goHome}>
            <Text style={subStyles[brand].body}>Support details for selected market.</Text>
          </SubScreen>
        )}

        {route === "account" && (
          <SubScreen brand={brand} title="Account" subtitle={selectedCustomer?.name ?? ""} onBack={goCustomer} onHome={goHome}>
            <Text style={subStyles[brand].body}>Region: {selectedRegion?.id}</Text>
            <Text style={subStyles[brand].body}>Customer ID: {selectedCustomer?.id}</Text>
            <PrimaryButton brand={brand} label="Open Demo Config Panel" onPress={() => setRoute("config")} />
          </SubScreen>
        )}

        {route === "config" && (
          <ConfigPanelScreen
            balance={configBalance}
            onBalance={setConfigBalance}
            onApply={onApplyConfig}
            onClose={() => setRoute("dashboard")}
          >
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: TOKENS.ember.muted, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.2 }}>QUICK SCENARIOS</Text>
              <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {["Vulnerable customer", "High usage spike", "Payment failure", "New install flow"].map((item) => (
                  <View key={item} style={{ borderWidth: 1, borderColor: "#d7c3b1", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ color: TOKENS.ember.text, fontFamily: "Inter_500Medium", fontSize: 12 }}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          </ConfigPanelScreen>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function RegionScreen({ regions, onSelect }: { regions: RegionConfig[]; onSelect: (r: RegionConfig) => void }) {
  return (
    <View style={styles.shellRoot}>
      <View style={styles.shellTop}>
        <Text style={styles.shellMenu}>☰</Text>
        <Text style={styles.shellLogo}>PAYGO</Text>
        <View style={styles.shellAvatar} />
      </View>
      <ScrollView contentContainerStyle={styles.shellBody}>
        <Text style={styles.shellDisplay}>Region{"\n"}Selector</Text>
        <Text style={styles.shellLead}>Select your primary market to customize your PAYGO experience, including currency, local regulations, and available features.</Text>
        {regions.map((r, i) => {
          const title = r.id === "UK" ? "United Kingdom" : r.id === "US" ? "United States" : "Ireland";
          const body =
            r.id === "UK"
              ? "Full access to Faster Payments, Open Banking integrations, and GBP accounts."
              : r.id === "US"
                ? "ACH, FedWire, and US Dollar custody services."
                : "SEPA instant transfers and EEA compliant wallets.";
          const currency = r.id === "UK" ? "GBP (£)" : r.id === "US" ? "USD ($)" : "EUR (€)";
          return (
            <Pressable key={r.id} style={[styles.shellCard, i === 0 && styles.shellCardFeatured, i === 2 && { backgroundColor: "#d9e4ea" }]} onPress={() => onSelect(r)}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  {i === 0 && <Text style={styles.shellTag}>PRIMARY REGION</Text>}
                  <Text style={styles.shellCardTitle}>{title}</Text>
                  <Text style={styles.shellCardBody}>{body}</Text>
                </View>
                <View style={[styles.shellIconWrap, i === 0 && styles.shellIconWrapFeatured]}>
                  <Text style={[styles.shellIcon, i === 0 && { color: "#fff" }]}>{r.id === "UK" ? "◎" : r.id === "US" ? "◍" : "€"}</Text>
                </View>
              </View>
              <View style={styles.shellCardRow}>
                <Text style={styles.shellCurrency}>{currency}</Text>
                {i === 0 ? (
                  <View style={styles.shellSelectBtn}><Text style={styles.shellSelectTxt}>Select {r.id}</Text></View>
                ) : (
                  <Text style={styles.shellSelectHint}>Select Market →</Text>
                )}
              </View>
            </Pressable>
          );
        })}
        <View style={styles.shellCapabilityWrap}>
          <View style={styles.shellCapabilityBlock}>
            <Text style={styles.shellCapabilityTitle}>UNIFIED LEDGER</Text>
            <Text style={styles.shellCapabilityBody}>Multi-currency accounting built on top of our proprietary core banking engine. All regions report to a single dashboard.</Text>
          </View>
          <View style={styles.shellCapabilityBlock}>
            <Text style={styles.shellCapabilityTitle}>LOCAL COMPLIANCE</Text>
            <Text style={styles.shellCapabilityBody}>Automatic tax withholding and regulatory reporting specific to each selected jurisdiction's financial authority.</Text>
          </View>
          <View style={styles.shellCapabilityBlock}>
            <Text style={styles.shellCapabilityTitle}>INSTANT SETTLEMENT</Text>
            <Text style={styles.shellCapabilityBody}>Experience zero-latency transfers between PAYGO users regardless of their selected regional market.</Text>
          </View>
        </View>
      </ScrollView>
      <View style={styles.shellNav}><Text style={styles.shellNavMuted}>HOME</Text><Text style={styles.shellNavMuted}>PAYMENTS</Text><Text style={styles.shellNavMuted}>WALLET</Text><Text style={styles.shellNavActive}>SETTINGS</Text></View>
    </View>
  );
}

function CustomerScreen({ brand, title, customers, onSelect, onHome }: { brand: Brand; title: string; customers: CustomerProfile[]; onSelect: (c: CustomerProfile) => void; onHome: () => void }) {
  const b = TOKENS[brand === "shell" ? "ember" : brand] as any;
  const header = brand === "pulse" ? "SpaceGrotesk_700Bold" : brand === "ember" ? "Newsreader_500Medium" : "PlusJakartaSans_700Bold";
  const body = brand === "pulse" ? "SpaceGrotesk_400Regular" : brand === "ember" ? "Inter_400Regular" : "PlusJakartaSans_400Regular";
  return (
    <>
      <InnerHeader brand={brand} title={title} subtitle="SELECT PERSONA" onHome={onHome} />
      <FlatList
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 90 }}
        data={customers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => onSelect(item)} style={{ backgroundColor: b.surface, borderRadius: brand === "solas" ? 28 : 14, padding: 12 }}>
            <View style={{ backgroundColor: brand === "pulse" ? "rgba(255,255,255,0.02)" : b.background, borderRadius: brand === "solas" ? 24 : 12, padding: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <Text numberOfLines={2} style={{ flex: 1, color: b.text, fontFamily: header, fontSize: 24 }}>{item.name}</Text>
                <View style={{ backgroundColor: brand === "pulse" ? "#1f2b46" : brand === "solas" ? "#dbe8d2" : "#eddcc8", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ fontFamily: body, fontSize: 10, letterSpacing: 1, color: b.text }}>{item.segment.replace("_", " ").toUpperCase()}</Text>
                </View>
              </View>
              <Text style={{ marginTop: 8, color: b.muted, fontFamily: body, fontSize: 18 }}>{item.account?.meterType ?? "Unknown meter"}</Text>
              <Text style={{ marginTop: 8, color: b.muted, fontFamily: body, fontSize: 12, letterSpacing: 1.1 }}>ID {item.id}</Text>
            </View>
          </Pressable>
        )}
      />
    </>
  );
}

function InnerHeader({ brand, title, subtitle, onBack, onHome }: { brand: Brand; title: string; subtitle: string; onBack?: () => void; onHome?: () => void }) {
  const isPulse = brand === "pulse";
  const bg = isPulse ? TOKENS.pulse.background : TOKENS[brand === "shell" ? "ember" : brand].background;
  const fg = isPulse ? TOKENS.pulse.text : TOKENS[brand === "shell" ? "ember" : brand].text;
  const bodyFont = isPulse ? "SpaceGrotesk_400Regular" : brand === "ember" ? "Inter_500Medium" : "PlusJakartaSans_400Regular";
  const titleFont = isPulse ? "SpaceGrotesk_700Bold" : brand === "ember" ? "Newsreader_500Medium" : "PlusJakartaSans_700Bold";
  return (
    <BlurView intensity={20} tint={isPulse ? "dark" : "light"} style={{ margin: 16, borderRadius: 12, padding: 12, backgroundColor: isPulse ? "rgba(2,6,23,0.85)" : `${bg}CC` }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Pressable onPress={onBack}>{onBack ? <Text style={{ color: fg, fontFamily: bodyFont, fontSize: 16 }}>Back</Text> : <View />}</Pressable>
        <Pressable onPress={onHome}>{onHome ? <Text style={{ color: fg, fontFamily: bodyFont, fontSize: 16 }}>Home</Text> : <View />}</Pressable>
      </View>
      <Text style={{ marginTop: 6, color: fg, fontFamily: titleFont, fontSize: 42, lineHeight: 42 }}>{title}</Text>
      <Text style={{ marginTop: 2, color: isPulse ? TOKENS.pulse.muted : TOKENS[brand === "shell" ? "ember" : brand].muted, fontFamily: bodyFont, fontSize: 12, letterSpacing: 1.2 }}>{subtitle}</Text>
    </BlurView>
  );
}

function EmberDashboard({ customer, onTopUp, onPayments, onSupport, onAccount }: { customer: CustomerProfile; onTopUp: () => void; onPayments: () => void; onSupport: () => void; onAccount: () => void }) {
  const t = TOKENS.ember;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 90 }}>
      <Text style={{ color: t.muted, fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 1.3 }}>CURRENT STATUS — LONDON, UK</Text>
      <Text style={{ color: t.text, fontFamily: "Newsreader_500Medium", fontSize: 64, lineHeight: 62 }}>Harmony in{"\n"}<Text style={{ fontStyle: "italic" }}>the flow.</Text></Text>
      <Text style={{ color: t.muted, fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 26 }}>Your home's energy pulse is currently synchronized with the grid. Efficiency is peaking at 94%.</Text>
      <View style={{ backgroundColor: t.surface, borderRadius: 12, padding: 14 }}>
        <Text style={{ color: t.muted, fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 1.2 }}>LIVE BALANCE</Text>
        <Text style={{ color: t.primary, fontFamily: "Newsreader_500Medium", fontSize: 58 }}>{customer.account.balance?.toFixed(1)}<Text style={{ fontSize: 24 }}> kWh</Text></Text>
      </View>
      <View style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: 14, gap: 8 }}>
        <Text style={{ color: t.text, fontFamily: "Newsreader_500Medium", fontSize: 34 }}>Energy Flux</Text>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 130 }}>{[34, 46, 64, 112, 86, 58, 30, 74, 52].map((h, i) => <View key={String(i)} style={{ width: 18, height: h, backgroundColor: i === 3 ? t.primary : i === 4 ? "#c09058" : "#dcd8d4", borderRadius: 2 }} />)}</View>
      </View>
      <View style={{ backgroundColor: "#efe7dd", borderRadius: 12, padding: 14 }}>
        <Text style={{ color: t.text, fontFamily: "Newsreader_500Medium", fontSize: 38 }}>Climate</Text>
        <Text style={{ color: t.primary, fontFamily: "Newsreader_500Medium", fontSize: 52 }}>21°C</Text>
      </View>
      <View style={{ backgroundColor: t.surface, borderRadius: 12, padding: 14 }}>
        <Text style={{ color: t.text, fontFamily: "Newsreader_500Medium", fontSize: 32, fontStyle: "italic" }}>Storage</Text>
        <View style={{ marginTop: 8, height: 6, borderRadius: 999, backgroundColor: "#d9d2cb" }}>
          <View style={{ width: "82%", height: 6, borderRadius: 999, backgroundColor: t.primary }} />
        </View>
        <Text style={{ marginTop: 6, color: t.muted, fontFamily: "Inter_400Regular" }}>Capacity: 13.5kWh remaining</Text>
      </View>
      <View style={{ backgroundColor: t.surface, borderRadius: 12, padding: 14 }}>
        <Text style={{ color: t.muted, fontFamily: "Newsreader_400Regular", fontSize: 36, fontStyle: "italic", lineHeight: 42 }}>"The art of living well begins with the consciousness of our impact."</Text>
      </View>
      <ActionBlock brand="ember" onTopUp={onTopUp} onPayments={onPayments} onSupport={onSupport} onAccount={onAccount} />
      <BottomNav brand="ember" />
    </ScrollView>
  );
}

function SolasDashboard({ customer, onTopUp, onPayments, onSupport, onAccount }: { customer: CustomerProfile; onTopUp: () => void; onPayments: () => void; onSupport: () => void; onAccount: () => void }) {
  const t = TOKENS.solas;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 90 }}>
      <Text style={{ color: t.muted, fontFamily: "PlusJakartaSans_400Regular", fontSize: 10, letterSpacing: 1.2 }}>MORNING, {customer.name.split(" ")[0].toUpperCase()}</Text>
      <Text style={{ color: t.text, fontFamily: "PlusJakartaSans_700Bold", fontSize: 56, lineHeight: 58 }}>Your home is{"\n"}<Text style={{ color: t.primary, fontStyle: "italic" }}>breathing</Text> well{"\n"}today.</Text>
      <View style={{ alignSelf: "flex-start", backgroundColor: t.secondary, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ color: "#4b6258", fontFamily: "PlusJakartaSans_400Regular", fontSize: 13 }}>18°C Dublin</Text></View>
      <View style={{ backgroundColor: "#eef3ea", borderRadius: 28, padding: 16 }}>
        <Text style={{ color: t.text, fontFamily: "PlusJakartaSans_400Regular", fontSize: 20 }}>Estimated Balance</Text>
        <Text style={{ color: t.primary, fontFamily: "PlusJakartaSans_700Bold", fontSize: 56 }}>€{customer.account.balance?.toFixed(2)}</Text>
        <Text style={{ color: t.primary, fontFamily: "PlusJakartaSans_400Regular", fontSize: 14 }}>↘ 12% lower than last month</Text>
        <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {["Grid €31.20", "Solar -€8.40", "EV €12.00", "Standing €8.00"].map((item) => (
            <View key={item} style={{ backgroundColor: "#f7f4f1", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8 }}>
              <Text style={{ color: t.text, fontFamily: "PlusJakartaSans_400Regular", fontSize: 12 }}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={{ backgroundColor: "#0b7c5f", borderRadius: 18, padding: 16, gap: 8 }}>
        <Text style={{ color: "#b6ffe3", fontFamily: "PlusJakartaSans_700Bold", fontSize: 10, letterSpacing: 1.1 }}>ACTIVE GROWTH</Text>
        <Text style={{ color: "#ecfff7", fontFamily: "PlusJakartaSans_700Bold", fontSize: 34, lineHeight: 38 }}>Your solar garden produced 14kWh today.</Text>
        <View style={{ alignSelf: "flex-start", marginTop: 4, backgroundColor: "#f9fdfb", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: "#0b7c5f", fontFamily: "PlusJakartaSans_700Bold", fontSize: 12 }}>View Analytics</Text>
        </View>
      </View>
      {[
        { title: "Water Usage", body: "450L consumed this week", progress: 65 },
        { title: "Heating Efficiency", body: "Living Room at optimal 20°C", progress: 82 },
        { title: "Community Share", body: "Top 5% in Rathmines area", progress: 95 },
      ].map((item) => (
        <View key={item.title} style={{ backgroundColor: "#f6f3f0", borderRadius: 20, padding: 14 }}>
          <Text style={{ color: t.text, fontFamily: "PlusJakartaSans_700Bold", fontSize: 24 }}>{item.title}</Text>
          <Text style={{ marginTop: 4, color: t.muted, fontFamily: "PlusJakartaSans_400Regular", fontSize: 14 }}>{item.body}</Text>
          <View style={{ marginTop: 10, height: 6, borderRadius: 999, backgroundColor: "#dfe8db" }}>
            <View style={{ width: `${item.progress}%` as `${number}%`, height: 6, borderRadius: 999, backgroundColor: t.primary }} />
          </View>
        </View>
      ))}
      <View style={{ backgroundColor: "#2f634f", borderRadius: 28, padding: 20 }}>
        <Text style={{ color: "#f1fff7", fontFamily: "PlusJakartaSans_700Bold", fontSize: 11, letterSpacing: 1.2 }}>SEASONAL TIP</Text>
        <Text style={{ marginTop: 8, color: "#f1fff7", fontFamily: "PlusJakartaSans_700Bold", fontSize: 38, lineHeight: 40 }}>When to harvest your kale for maximum crispness.</Text>
      </View>
      <ActionBlock brand="solas" onTopUp={onTopUp} onPayments={onPayments} onSupport={onSupport} onAccount={onAccount} />
      <BottomNav brand="solas" />
    </ScrollView>
  );
}

function PulseDashboard({ customer, onTopUp, onPayments, onSupport, onAccount }: { customer: CustomerProfile; onTopUp: () => void; onPayments: () => void; onSupport: () => void; onAccount: () => void }) {
  const t = TOKENS.pulse;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 90 }}>
      <Text style={{ color: t.accent, fontFamily: "SpaceGrotesk_700Bold", fontSize: 11, letterSpacing: 2 }}>SYSTEM STATUS: ACTIVE</Text>
      <Text style={{ color: t.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 54, lineHeight: 54 }}>Pulse Home{"\n"}Dashboard</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View><Text style={{ color: t.muted, fontFamily: "SpaceGrotesk_400Regular", fontSize: 10, letterSpacing: 1.2 }}>GRID LOAD</Text><Text style={{ color: t.accent, fontFamily: "SpaceGrotesk_700Bold", fontSize: 38 }}>4.2 kW</Text></View>
        <View><Text style={{ color: t.muted, fontFamily: "SpaceGrotesk_400Regular", fontSize: 10, letterSpacing: 1.2 }}>REGION</Text><Text style={{ color: t.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 38 }}>USA-NE</Text></View>
      </View>
      <BlurView intensity={20} tint="dark" style={{ borderRadius: 6, padding: 14, backgroundColor: t.surface }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: t.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 30 }}>ENERGY{"\n"}DISTRIBUTION</Text>
          <View style={{ backgroundColor: "rgba(34,211,238,0.2)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: t.accent, fontSize: 10, letterSpacing: 1.1, fontFamily: "SpaceGrotesk_700Bold" }}>LIVE FEED</Text></View>
        </View>
        <Text style={{ color: t.muted, marginTop: 6, fontFamily: "SpaceGrotesk_400Regular" }}>Real-time telemetry across home nodes</Text>
        <View style={{ marginTop: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: t.accent, fontFamily: "SpaceGrotesk_700Bold", fontSize: 20 }}>SOLAR ARRAY +3.8kW</Text>
          <Text style={{ color: t.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 16 }}>PULSE CORE</Text>
          <Text style={{ color: "#9AB0FF", fontFamily: "SpaceGrotesk_700Bold", fontSize: 20 }}>STORAGE 94%</Text>
        </View>
      </BlurView>
      <View style={{ backgroundColor: t.card, borderRadius: 4, padding: 14, gap: 8 }}>
        <Text style={{ color: t.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 30 }}>EV CHARGING</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: t.muted, fontFamily: "SpaceGrotesk_400Regular" }}>MODEL 3 (GARAGE)</Text><Text style={{ color: t.text, fontFamily: "SpaceGrotesk_700Bold" }}>82%</Text></View>
        <View style={{ height: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.15)" }}><View style={{ width: "82%", height: 6, borderRadius: 999, backgroundColor: t.accent }} /></View>
        <PrimaryButton brand="pulse" label="OPTIMIZE SCHEDULE" onPress={onTopUp} />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {[
          { title: "HVAC SYSTEM", value: "2.4 kW", note: "22% ABOVE BASELINE", tone: t.accent },
          { title: "APPLIANCES", value: "0.8 kW", note: "OPTIMAL EFFICIENCY", tone: t.primary },
          { title: "LIGHTING", value: "0.3 kW", note: "12 NODES ACTIVE", tone: "#9EA5B4" },
        ].map((item) => (
          <View key={item.title} style={{ flex: 1, backgroundColor: "#1a2333", borderRadius: 4, padding: 10 }}>
            <Text style={{ color: t.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 1.1 }}>{item.title}</Text>
            <Text style={{ marginTop: 8, color: t.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 26 }}>{item.value}</Text>
            <View style={{ marginTop: 8, height: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.15)" }}>
              <View style={{ width: "65%", height: 3, borderRadius: 999, backgroundColor: item.tone }} />
            </View>
            <Text style={{ marginTop: 6, color: t.muted, fontFamily: "SpaceGrotesk_400Regular", fontSize: 9, letterSpacing: 1 }}>{item.note}</Text>
          </View>
        ))}
      </View>
      <View style={{ backgroundColor: "rgba(49,53,60,0.6)", borderRadius: 6, padding: 14 }}>
        <Text style={{ color: t.muted, fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 1.2 }}>WEATHER</Text>
        <Text style={{ color: t.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 42 }}>72°F</Text>
        <Text style={{ color: t.accent, fontFamily: "SpaceGrotesk_700Bold", fontSize: 12, letterSpacing: 1.1 }}>IDEAL SOLAR YIELD</Text>
      </View>
      <ActionBlock brand="pulse" onTopUp={onTopUp} onPayments={onPayments} onSupport={onSupport} onAccount={onAccount} />
      <BottomNav brand="pulse" />
    </ScrollView>
  );
}

function SubScreen({ brand, title, subtitle, onBack, onHome, children }: { brand: Brand; title: string; subtitle: string; onBack: () => void; onHome: () => void; children: React.ReactNode }) {
  const b = brand === "shell" ? "ember" : brand;
  return (
    <>
      <InnerHeader brand={brand} title={title} subtitle={subtitle} onBack={onBack} onHome={onHome} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>{children}</ScrollView>
      <BottomNav brand={b} />
    </>
  );
}

function ConfigPanelScreen({
  balance,
  onBalance,
  onApply,
  onClose,
  children,
}: {
  balance: number;
  onBalance: (v: number) => void;
  onApply: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = TOKENS.ember;
  const state = balance < 25 ? "CRITICAL" : balance < 50 ? "LOW" : balance < 75 ? "STABLE" : "HIGH";
  const Toggle = ({ label, on }: { label: string; on: boolean }) => (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 }}>
      <Text style={{ color: t.text, fontFamily: "Inter_500Medium", fontSize: 15 }}>{label}</Text>
      <View style={{ width: 42, height: 24, borderRadius: 999, backgroundColor: on ? "#a76500" : "#eae1d7", justifyContent: "center", paddingHorizontal: 3, alignItems: on ? "flex-end" : "flex-start" }}>
        <View style={{ width: 18, height: 18, borderRadius: 999, backgroundColor: on ? "#fff" : "#b8aca0" }} />
      </View>
    </View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: "rgba(31,27,21,0.18)", justifyContent: "flex-end" }}>
      <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 20, paddingTop: 8 }}>
        <View style={{ alignItems: "center", marginBottom: 8 }}><View style={{ width: 50, height: 6, borderRadius: 999, backgroundColor: "#eae1d7" }} /></View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ color: t.primary, fontFamily: "Inter_700Bold", fontSize: 36 }}>Demo Config Panel</Text>
            <Text style={{ color: t.muted, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 2 }}>SCREEN ID: S-04</Text>
          </View>
          <Pressable onPress={onClose}><Text style={{ color: t.muted, fontSize: 34 }}>×</Text></Pressable>
        </View>
        <View style={{ marginTop: 20 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={{ color: t.text, fontFamily: "Inter_700Bold", fontSize: 20 }}>Balance State</Text>
            <View style={{ backgroundColor: "#ffdad6", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ color: "#ba1a1a", fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 2 }}>{state}</Text>
            </View>
          </View>
          <TextInput value={String(balance)} onChangeText={(v) => onBalance(Math.max(0, Math.min(100, Number(v) || 0)))} keyboardType="numeric" style={{ backgroundColor: "#fcf2e8", borderRadius: 8, padding: 10, fontFamily: "Inter_700Bold", color: t.text }} />
          <View style={{ marginTop: 8, height: 8, borderRadius: 999, backgroundColor: "#ece5dd" }}>
            <View style={{ width: `${balance}%`, height: 8, borderRadius: 999, backgroundColor: "#855000" }} />
          </View>
          <View style={{ marginTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={styles.configScaleLabel}>CRITICAL</Text><Text style={styles.configScaleLabel}>LOW</Text><Text style={styles.configScaleLabel}>STABLE</Text><Text style={styles.configScaleLabel}>HIGH</Text>
          </View>
        </View>
        <View style={{ marginTop: 16, flexDirection: "row", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.configGroupTitle}>PAYMENT MODELS</Text>
            <Toggle label="Prepayment" on />
            <Toggle label="Direct Debit" on={false} />
            <Text style={[styles.configGroupTitle, { marginTop: 8 }]}>SMART</Text>
            <Toggle label="Auto Top-up" on={false} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.configGroupTitle}>ALERTS</Text>
            <Toggle label="Low Balance SMS" on />
            <Toggle label="Push Notifications" on={false} />
            <Text style={[styles.configGroupTitle, { marginTop: 8 }]}>ECOSYSTEM</Text>
            <Toggle label="Solar Integration" on={false} />
          </View>
        </View>
        {children}
        <View style={{ marginTop: 14, flexDirection: "row", gap: 10 }}>
          <PrimaryButton brand="ember" label="Apply Changes" onPress={onApply} />
          <Pressable onPress={() => onBalance(50)} style={{ height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#f6ece2", paddingHorizontal: 18 }}>
            <Text style={{ color: t.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1.2 }}>RESET</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ActionBlock({ brand, onTopUp, onPayments, onSupport, onAccount }: { brand: Brand; onTopUp: () => void; onPayments: () => void; onSupport: () => void; onAccount: () => void }) {
  return (
    <View style={{ gap: 8 }}>
      <PrimaryButton brand={brand} label="Manual Top-Up" onPress={onTopUp} />
      <PrimaryButton brand={brand} label="Payment History" onPress={onPayments} />
      <PrimaryButton brand={brand} label="Support" onPress={onSupport} />
      <PrimaryButton brand={brand} label="Account" onPress={onAccount} />
    </View>
  );
}

function PrimaryButton({ brand, label, onPress }: { brand: Brand; label: string; onPress: () => void }) {
  const b = TOKENS[brand === "shell" ? "ember" : brand] as any;
  const radius = brand === "pulse" ? 4 : brand === "solas" ? 999 : 8;
  const font = brand === "pulse" ? "SpaceGrotesk_700Bold" : brand === "solas" ? "PlusJakartaSans_700Bold" : "Inter_700Bold";
  return (
    <Pressable onPress={onPress}>
      <LinearGradient colors={[b.primary, brand === "pulse" ? "#6e67ff" : brand === "solas" ? "#2db98d" : "#a76500"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 52, borderRadius: radius, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#fff", fontFamily: font, fontSize: 16, letterSpacing: brand === "pulse" ? 1.1 : 0 }}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function BottomNav({ brand }: { brand: Brand }) {
  const isPulse = brand === "pulse";
  const bg = isPulse ? "rgba(2,6,23,0.95)" : brand === "solas" ? "#e9f1e4" : "#efe9e0";
  const active = isPulse ? TOKENS.pulse.accent : brand === "solas" ? TOKENS.solas.primary : TOKENS.ember.primary;
  const muted = isPulse ? TOKENS.pulse.muted : "#98a29c";
  const labels = brand === "solas"
    ? ["HOME", "GARDEN", "COMMUNITY", "PROFILE"]
    : brand === "ember"
      ? ["EDITIONS", "ARCHIVE", "SAVED", "PROFILE"]
      : ["DASHBOARD", "METRICS", "ALERTS", "SYSTEM"];
  return (
    <View style={{ position: "absolute", bottom: 10, left: 16, right: 16, backgroundColor: bg, borderRadius: brand === "pulse" ? 4 : 999, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 11 }}>
      {labels.map((label, i) => (
        <Text key={label} style={{ color: i === 0 ? active : muted, fontSize: 10, letterSpacing: 1.2, fontFamily: i === 0 ? "Inter_700Bold" : "Inter_500Medium" }}>{label}</Text>
      ))}
    </View>
  );
}

const subStyles: Record<Brand, any> = {
  shell: {},
  ember: {
    label: { color: TOKENS.ember.muted, fontFamily: "Inter_500Medium", fontSize: 12, letterSpacing: 1.1 },
    input: { borderBottomWidth: 2, borderBottomColor: TOKENS.ember.primary, fontSize: 34, fontFamily: "Newsreader_500Medium", color: TOKENS.ember.text, paddingVertical: 6 },
    row: { backgroundColor: "#fff", borderRadius: 8, padding: 12, flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
    rowText: { color: TOKENS.ember.text, fontFamily: "Inter_500Medium", fontSize: 15 },
    body: { color: TOKENS.ember.muted, fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 24 },
  },
  solas: {
    label: { color: TOKENS.solas.muted, fontFamily: "PlusJakartaSans_700Bold", fontSize: 12, letterSpacing: 1.1 },
    input: { borderBottomWidth: 2, borderBottomColor: TOKENS.solas.primary, fontSize: 34, fontFamily: "PlusJakartaSans_700Bold", color: TOKENS.solas.text, paddingVertical: 6 },
    row: { backgroundColor: "#fff", borderRadius: 20, padding: 12, flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
    rowText: { color: TOKENS.solas.text, fontFamily: "PlusJakartaSans_400Regular", fontSize: 15 },
    body: { color: TOKENS.solas.muted, fontFamily: "PlusJakartaSans_400Regular", fontSize: 16, lineHeight: 24 },
  },
  pulse: {
    label: { color: TOKENS.pulse.muted, fontFamily: "SpaceGrotesk_700Bold", fontSize: 12, letterSpacing: 1.2 },
    input: { borderBottomWidth: 2, borderBottomColor: TOKENS.pulse.accent, fontSize: 34, fontFamily: "SpaceGrotesk_700Bold", color: TOKENS.pulse.text, paddingVertical: 6 },
    row: { backgroundColor: TOKENS.pulse.card, borderRadius: 4, padding: 12, flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
    rowText: { color: TOKENS.pulse.text, fontFamily: "SpaceGrotesk_400Regular", fontSize: 15 },
    body: { color: TOKENS.pulse.muted, fontFamily: "SpaceGrotesk_400Regular", fontSize: 16, lineHeight: 24 },
  },
};

const styles = StyleSheet.create({
  full: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  dismiss: { marginTop: 14, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
  lowWarn: { marginHorizontal: 16, marginBottom: 86, backgroundColor: "#ffdad6", borderRadius: 10, padding: 12 },
  lowWarnText: { color: "#ba1a1a", fontFamily: "Inter_700Bold", fontSize: 14 },

  shellRoot: { flex: 1, backgroundColor: TOKENS.shell.background },
  shellTop: { margin: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  shellMenu: { fontSize: 20, color: TOKENS.shell.text },
  shellLogo: { flex: 1, fontFamily: "Inter_900Black", color: TOKENS.shell.text, fontSize: 31 },
  shellAvatar: { width: 30, height: 30, borderRadius: 8, backgroundColor: "#e5dccb" },
  shellBody: { paddingHorizontal: 16, paddingBottom: 100, gap: 14 },
  shellDisplay: { color: TOKENS.shell.text, fontFamily: "Inter_900Black", fontSize: 54, letterSpacing: -1.6, lineHeight: 56, textShadowColor: "rgba(35,49,66,0.35)", textShadowRadius: 1, textShadowOffset: { width: 2, height: 2 } },
  shellLead: { color: TOKENS.shell.accent, fontFamily: "Inter_400Regular", fontSize: 17, lineHeight: 30, maxWidth: 360 },
  shellCard: {
    backgroundColor: TOKENS.shell.card,
    borderRadius: 12,
    padding: 18,
    shadowColor: "rgba(0,0,0,0.05)",
    shadowRadius: 12,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
  },
  shellCardFeatured: { minHeight: 246, justifyContent: "space-between" },
  shellTag: { alignSelf: "flex-start", backgroundColor: "#eef2f6", color: TOKENS.shell.muted, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, letterSpacing: 1.1, fontFamily: "Inter_500Medium" },
  shellCardTitle: { marginTop: 10, color: TOKENS.shell.text, fontFamily: "Inter_700Bold", fontSize: 38, lineHeight: 40, letterSpacing: -0.8 },
  shellCardBody: { marginTop: 8, color: TOKENS.shell.accent, fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 26 },
  shellCardRow: { marginTop: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  shellCurrency: { color: TOKENS.shell.text, fontFamily: "Inter_700Bold", fontSize: 30 },
  shellSelectBtn: { backgroundColor: TOKENS.shell.button, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  shellSelectTxt: { color: "white", fontFamily: "Inter_700Bold", fontSize: 14 },
  shellSelectHint: { color: TOKENS.shell.button, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.3 },
  shellIconWrap: { width: 48, height: 48, borderRadius: 10, backgroundColor: "#e8eff3", alignItems: "center", justifyContent: "center" },
  shellIconWrapFeatured: { width: 56, height: 56, backgroundColor: TOKENS.shell.button },
  shellIcon: { color: TOKENS.shell.button, fontSize: 24, fontFamily: "Inter_700Bold" },
  shellCapabilityWrap: { marginTop: 26, gap: 18, paddingTop: 14 },
  shellCapabilityBlock: { paddingVertical: 6 },
  shellCapabilityTitle: { color: TOKENS.shell.muted, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.2 },
  shellCapabilityBody: { marginTop: 8, color: TOKENS.shell.text, fontFamily: "Inter_400Regular", fontSize: 18, lineHeight: 32 },
  shellNav: { position: "absolute", left: 16, right: 16, bottom: 10, borderRadius: 12, backgroundColor: "#e9eef4", paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between" },
  shellNavMuted: { color: "#99a6b8", fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 1 },
  shellNavActive: { color: TOKENS.shell.text, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1 },
  configScaleLabel: { color: TOKENS.ember.muted, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.2 },
  configGroupTitle: { color: TOKENS.ember.muted, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.2 },
});
