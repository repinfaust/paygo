import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useFonts } from "expo-font";
import { Inter_400Regular, Inter_500Medium, Inter_700Bold, Inter_900Black } from "@expo-google-fonts/inter";
import { BeVietnamPro_400Regular, BeVietnamPro_500Medium, BeVietnamPro_600SemiBold } from "@expo-google-fonts/be-vietnam-pro";
import { Manrope_400Regular, Manrope_500Medium, Manrope_700Bold } from "@expo-google-fonts/manrope";
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
type ConfigScope = "segment" | "region";
type QuickScenario = { id: string; label: string; region: "UK" | "IE" | "US"; brand: "Ember" | "Solas" | "Pulse" };
const CONFIG_BUILD_MARKER = "scenario-stage-v2";

const QUICK_SCENARIOS: QuickScenario[] = [
  { id: "vulnerable-customer", label: "Vulnerable customer", region: "UK", brand: "Ember" },
  { id: "smart-power-user", label: "Smart power user", region: "UK", brand: "Ember" },
  { id: "non-smart-ie", label: "Non-smart IE", region: "IE", brand: "Solas" },
  { id: "ev-solar-us", label: "EV + solar US", region: "US", brand: "Pulse" },
  { id: "debt-recovery", label: "Debt recovery", region: "IE", brand: "Solas" },
  { id: "high-usage-spike", label: "High usage spike", region: "UK", brand: "Ember" },
  { id: "payment-failure", label: "Payment failure", region: "UK", brand: "Ember" },
  { id: "new-install-flow", label: "New install flow", region: "UK", brand: "Ember" },
];

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
  const [showLaunchDisclaimer, setShowLaunchDisclaimer] = useState(true);

  const [regions, setRegions] = useState<RegionConfig[]>([]);
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<RegionConfig | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [segmentConfig, setSegmentConfig] = useState<SegmentConfig | null>(null);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [topUpAmount, setTopUpAmount] = useState("20");
  const [configBalance, setConfigBalance] = useState(15);
  const [configAiAnalystCard, setConfigAiAnalystCard] = useState(false);
  const [configAutoTopUp, setConfigAutoTopUp] = useState(false);
  const [configLowBalanceSms, setConfigLowBalanceSms] = useState(false);
  const [configAiScope, setConfigAiScope] = useState<ConfigScope>("segment");
  const [configReturnRoute, setConfigReturnRoute] = useState<Route>("region");
  const [selectedQuickScenarioId, setSelectedQuickScenarioId] = useState<string | null>(null);
  const [pendingScenarioCustomerId, setPendingScenarioCustomerId] = useState<string | null>(null);
  const [suppressRegionAutoRoute, setSuppressRegionAutoRoute] = useState(false);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    Inter_900Black,
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_700Bold,
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
        const nextCustomers = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CustomerProfile, "id">) }));
        setCustomers(nextCustomers);
        if (pendingScenarioCustomerId) {
          const target = nextCustomers.find((c) => c.id === pendingScenarioCustomerId);
          if (target) {
            setSelectedCustomer(target);
          }
          setPendingScenarioCustomerId(null);
        } else if (!suppressRegionAutoRoute) {
          setRoute("customer");
        }
        if (suppressRegionAutoRoute) {
          setSuppressRegionAutoRoute(false);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Customer fetch failed"));
  }, [selectedRegion, pendingScenarioCustomerId, suppressRegionAutoRoute]);

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

  useEffect(() => {
    if (route !== "config") return;
    setConfigAiAnalystCard(Boolean(resolved?.featureFlags.aiAnalystCard));
    setConfigAutoTopUp(Boolean(resolved?.featureFlags.autoTopUp));
    setConfigLowBalanceSms(Boolean(resolved?.featureFlags.lowBalanceAlert));
    setConfigAiScope("segment");
    setSelectedQuickScenarioId(null);
  }, [route]);

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

  async function setFeatureAtScope(flag: string, nextValue: boolean) {
    if (!selectedRegion || !selectedCustomer) {
      throw new Error("Select a region and customer before changing config scope.");
    }
    const setFlag = httpsCallable(functions, "setConfigFeatureOverride");
    await setFlag({
      scope: configAiScope,
      regionId: selectedRegion.id,
      segmentId: selectedCustomer.segment,
      flag,
      value: nextValue,
    });

    // Keep local resolved config in sync immediately after successful write.
    if (configAiScope === "segment") {
      setSegmentConfig((prev) => {
        if (!prev || prev.id !== selectedCustomer.segment) return prev;
        return {
          ...prev,
          featureFlags: {
            ...(prev.featureFlags || {}),
            [flag]: nextValue,
          },
        };
      });
    } else {
      setSelectedRegion((prev) => {
        if (!prev || prev.id !== selectedRegion.id) return prev;
        return {
          ...prev,
          capabilityOverrides: {
            ...(prev.capabilityOverrides || {}),
            [flag]: nextValue,
          },
        };
      });
    }
  }

  async function onApplyConfig() {
    if (!selectedCustomer || !selectedRegion) {
      setError("Select a region and customer before applying config changes.");
      return;
    }
    if (selectedQuickScenarioId) {
      const scenario = QUICK_SCENARIOS.find((item) => item.id === selectedQuickScenarioId);
      if (!scenario) {
        setError("Selected scenario is invalid.");
        return;
      }
      await onApplyScenario(scenario);
      return;
    }
    if ((selectedCustomer as any)?.scenarioMeta?.id) {
      const resetScenarioState = httpsCallable(functions, "resetScenarioState");
      await resetScenarioState({ customerId: selectedCustomer.id });
    }
    const target = configBalance < 25 ? 8 : configBalance < 50 ? 25 : configBalance < 75 ? 80 : 160;
    const current = selectedCustomer.account.balance ?? 0;
    const delta = Number((target - current).toFixed(2));
    try {
      const mutate = httpsCallable(functions, "setBalanceState");
      await mutate({ customerId: selectedCustomer.id, delta, reason: "config-panel" });
      if (Boolean(resolved?.featureFlags.aiAnalystCard) !== configAiAnalystCard) {
        await setFeatureAtScope("aiAnalystCard", configAiAnalystCard);
      }
      if (Boolean(resolved?.featureFlags.autoTopUp) !== configAutoTopUp) {
        await setFeatureAtScope("autoTopUp", configAutoTopUp);
      }
      if (Boolean(resolved?.featureFlags.lowBalanceAlert) !== configLowBalanceSms) {
        await setFeatureAtScope("lowBalanceAlert", configLowBalanceSms);
      }
      setRoute("dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Config apply failed");
    }
  }

  function onToggleAiAnalystCard(nextValue: boolean) {
    setSelectedQuickScenarioId(null);
    setConfigAiAnalystCard(nextValue);
  }

  function onToggleAutoTopUp(nextValue: boolean) {
    setSelectedQuickScenarioId(null);
    setConfigAutoTopUp(nextValue);
  }

  function onToggleLowBalanceSms(nextValue: boolean) {
    setSelectedQuickScenarioId(null);
    setConfigLowBalanceSms(nextValue);
  }

  async function onApplyScenario(scenario: QuickScenario) {
    try {
      const applyScenario = httpsCallable(functions, "applyScenario");
      const result = await applyScenario({ scenarioId: scenario.id });
      const data = (result.data ?? {}) as { regionId?: string; customerId?: string };
      const regionId = data.regionId || scenario.region;
      const customerId = data.customerId;
      if (!customerId) {
        throw new Error("Scenario applied but no customer was returned.");
      }

      const targetRegion = regions.find((r) => r.id === regionId);
      if (!targetRegion) {
        throw new Error(`Scenario target region '${regionId}' not found.`);
      }

      if (selectedRegion?.id !== targetRegion.id) {
        setSuppressRegionAutoRoute(true);
        setPendingScenarioCustomerId(customerId);
        setSelectedCustomer(null);
        setSelectedRegion(targetRegion);
        setRoute("customer");
        return;
      }

      const inMemoryCustomer = customers.find((c) => c.id === customerId);
      if (inMemoryCustomer) {
        setSelectedCustomer(inMemoryCustomer);
        setRoute("dashboard");
        return;
      }

      const customerSnap = await getDocs(query(collection(db, "customers"), where("region", "==", targetRegion.id)));
      const nextCustomers = customerSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CustomerProfile, "id">) }));
      setCustomers(nextCustomers);
      const targetCustomer = nextCustomers.find((c) => c.id === customerId);
      if (!targetCustomer) {
        throw new Error("Scenario customer not available in current region.");
      }
      setSelectedCustomer(targetCustomer);
      setRoute("dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scenario apply failed");
    }
  }

  async function onResetScenario() {
    setSelectedQuickScenarioId(null);
    if (!selectedCustomer) return;
    try {
      const resetScenarioState = httpsCallable(functions, "resetScenarioState");
      await resetScenarioState({ customerId: selectedCustomer.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scenario reset failed");
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
        {route === "region" && (
          <RegionScreen
            regions={regions}
            onSelect={setSelectedRegion}
            onOpenConfig={() => {
              setConfigReturnRoute("region");
              setRoute("config");
            }}
          />
        )}

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
            {brand === "ember" && (
              <EmberDashboard
                customer={selectedCustomer}
                region={selectedRegion}
                featureFlags={resolved?.featureFlags ?? {}}
                payments={payments}
                onTopUp={() => setRoute("topup")}
                onPayments={() => setRoute("payments")}
                onSupport={() => setRoute("support")}
                onAccount={() => setRoute("account")}
                onHome={goHome}
                onConfig={() => {
                  setConfigReturnRoute("dashboard");
                  setRoute("config");
                }}
              />
            )}
            {brand === "solas" && (
              <SolasDashboard
                customer={selectedCustomer}
                region={selectedRegion}
                featureFlags={resolved?.featureFlags ?? {}}
                payments={payments}
                onTopUp={() => setRoute("topup")}
                onPayments={() => setRoute("payments")}
                onSupport={() => setRoute("support")}
                onAccount={() => setRoute("account")}
                onHome={goHome}
                onConfig={() => {
                  setConfigReturnRoute("dashboard");
                  setRoute("config");
                }}
              />
            )}
            {brand === "pulse" && (
              <PulseDashboard
                customer={selectedCustomer}
                region={selectedRegion}
                featureFlags={resolved?.featureFlags ?? {}}
                payments={payments}
                onTopUp={() => setRoute("topup")}
                onPayments={() => setRoute("payments")}
                onSupport={() => setRoute("support")}
                onAccount={() => setRoute("account")}
                onHome={goHome}
                onConfig={() => {
                  setConfigReturnRoute("dashboard");
                  setRoute("config");
                }}
              />
            )}
            {resolved?.featureFlags.lowBalanceAlert && (selectedCustomer.account.balance ?? 0) < 20 && (
              <View style={styles.lowWarn}><Text style={styles.lowWarnText}>Low balance warning active</Text></View>
            )}
          </>
        )}

        {route === "topup" && (
          <SubScreen
            brand={brand}
            title="Manual Top-Up"
            subtitle={selectedCustomer?.name ?? ""}
            onBack={goCustomer}
            onHome={goHome}
            onConfig={() => {
              setConfigReturnRoute("topup");
              setRoute("config");
            }}
            onDashboard={() => setRoute("dashboard")}
            onPayments={() => setRoute("payments")}
            onSupport={() => setRoute("support")}
            onAccount={() => setRoute("account")}
          >
            <Text style={subStyles[brand].label}>Amount</Text>
            <TextInput value={topUpAmount} onChangeText={setTopUpAmount} keyboardType="numeric" style={subStyles[brand].input} />
            <PrimaryButton brand={brand} label="Submit via Function" onPress={onTopUp} />
          </SubScreen>
        )}

        {route === "payments" && (
          <SubScreen
            brand={brand}
            title="Payment History"
            subtitle={selectedCustomer?.name ?? ""}
            onBack={goCustomer}
            onHome={goHome}
            onConfig={() => {
              setConfigReturnRoute("payments");
              setRoute("config");
            }}
            onDashboard={() => setRoute("dashboard")}
            onPayments={() => setRoute("payments")}
            onSupport={() => setRoute("support")}
            onAccount={() => setRoute("account")}
          >
            <View style={{ gap: 8 }}>
              {payments.map((item) => (
                <View key={item.id} style={subStyles[brand].row}>
                  <Text style={subStyles[brand].rowText}>{item.date}</Text>
                  <Text style={subStyles[brand].rowText}>{item.amount}</Text>
                </View>
              ))}
            </View>
          </SubScreen>
        )}

        {route === "support" && (
          <SubScreen
            brand={brand}
            title="Support"
            subtitle={selectedRegion?.id ?? ""}
            onBack={goCustomer}
            onHome={goHome}
            onConfig={() => {
              setConfigReturnRoute("support");
              setRoute("config");
            }}
            onDashboard={() => setRoute("dashboard")}
            onPayments={() => setRoute("payments")}
            onSupport={() => setRoute("support")}
            onAccount={() => setRoute("account")}
          >
            <Text style={subStyles[brand].body}>Support details for selected market.</Text>
          </SubScreen>
        )}

        {route === "account" && (
          <SubScreen
            brand={brand}
            title="Account"
            subtitle={selectedCustomer?.name ?? ""}
            onBack={goCustomer}
            onHome={goHome}
            onConfig={() => {
              setConfigReturnRoute("account");
              setRoute("config");
            }}
            onDashboard={() => setRoute("dashboard")}
            onPayments={() => setRoute("payments")}
            onSupport={() => setRoute("support")}
            onAccount={() => setRoute("account")}
          >
            <Text style={subStyles[brand].body}>Region: {selectedRegion?.id}</Text>
            <Text style={subStyles[brand].body}>Customer ID: {selectedCustomer?.id}</Text>
            <PrimaryButton
              brand={brand}
              label="Open Demo Config Panel"
              onPress={() => {
                setConfigReturnRoute("dashboard");
                setRoute("config");
              }}
            />
          </SubScreen>
        )}

        {route === "config" && (
          <ConfigPanelScreen
            balance={configBalance}
            onBalance={(v) => {
              setSelectedQuickScenarioId(null);
              setConfigBalance(v);
            }}
            aiAnalystCard={configAiAnalystCard}
            autoTopUp={configAutoTopUp}
            lowBalanceSms={configLowBalanceSms}
            aiScope={configAiScope}
            onScopeChange={(scope) => {
              setSelectedQuickScenarioId(null);
              setConfigAiScope(scope);
            }}
            scopeRegionId={selectedRegion?.id ?? null}
            scopeSegmentId={selectedCustomer?.segment ?? null}
            onToggleAiAnalystCard={onToggleAiAnalystCard}
            onToggleAutoTopUp={onToggleAutoTopUp}
            onToggleLowBalanceSms={onToggleLowBalanceSms}
            contextReady={Boolean(selectedRegion && selectedCustomer)}
            onApply={onApplyConfig}
            onReset={onResetScenario}
            onClose={() => setRoute(configReturnRoute)}
          >
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: TOKENS.ember.muted, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.2 }}>QUICK SCENARIOS</Text>
              <Text style={{ marginTop: 4, color: "#a18b78", fontFamily: "Inter_500Medium", fontSize: 10 }}>
                Build: {CONFIG_BUILD_MARKER}
              </Text>
              <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {QUICK_SCENARIOS.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setSelectedQuickScenarioId(item.id)}
                    style={{
                      borderWidth: 1,
                      borderColor: selectedQuickScenarioId === item.id ? "#a76500" : "#d7c3b1",
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      backgroundColor: selectedQuickScenarioId === item.id ? "#fff4e8" : item.region === selectedRegion?.id ? "#fff" : "#fdf7f1",
                    }}
                  >
                    <Text style={{ color: TOKENS.ember.text, fontFamily: "Inter_500Medium", fontSize: 12 }}>
                      {item.label}
                    </Text>
                    {item.region !== selectedRegion?.id ? (
                      <Text style={{ marginTop: 2, color: "#857464", fontFamily: "Inter_500Medium", fontSize: 10 }}>
                        Switches to {item.region} / {item.brand}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
              {selectedQuickScenarioId ? (
                <Text style={{ marginTop: 8, color: "#6f5a49", fontFamily: "Inter_700Bold", fontSize: 11 }}>
                  Scenario selected. Tap Apply Changes to run it.
                </Text>
              ) : null}
              <Text style={{ marginTop: 8, color: "#857464", fontFamily: "Inter_500Medium", fontSize: 11 }}>
                Selecting a scenario may switch region/customer automatically.
              </Text>
            </View>
          </ConfigPanelScreen>
        )}

        <Modal
          visible={showLaunchDisclaimer}
          transparent
          animationType="fade"
          onRequestClose={() => setShowLaunchDisclaimer(false)}
        >
          <View style={styles.disclaimerBackdrop}>
            <View style={styles.disclaimerCard}>
              <Text style={styles.disclaimerTitle}>PAYGO — Demo App</Text>
              <Text style={styles.disclaimerBody}>
                This app is a product demonstration tool built to explore prepayment energy management concepts across UK, Irish, and US markets.
              </Text>
              <Text style={styles.disclaimerBody}>
                All customer profiles, account data, and energy usage shown are entirely fictional. No real customer information, payment details, or live energy accounts are used at any point.
              </Text>
              <Text style={styles.disclaimerBody}>
                This is not a consumer product. No personal data is collected or stored.
              </Text>
              <View style={styles.disclaimerDivider} />
              <Text style={styles.disclaimerAttribution}>Built by David Loake · david.loake@ensek.co.uk</Text>
              <Pressable style={styles.disclaimerButton} onPress={() => setShowLaunchDisclaimer(false)}>
                <Text style={styles.disclaimerButtonText}>Got it</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function RegionScreen({ regions, onSelect, onOpenConfig }: { regions: RegionConfig[]; onSelect: (r: RegionConfig) => void; onOpenConfig: () => void }) {
  const normalizeRegion = (r: RegionConfig): "UK" | "US" | "IE" | "OTHER" => {
    const id = String(r.id ?? "").toUpperCase();
    const brand = String(r.brand ?? "").toUpperCase();
    const currency = String((r as any).currency ?? "").toUpperCase();
    if (id === "UK" || brand.includes("EMBER") || currency.includes("GBP")) return "UK";
    if (id === "US" || brand.includes("PULSE") || currency.includes("USD")) return "US";
    if (id === "IE" || brand.includes("SOLAS") || currency.includes("EUR")) return "IE";
    return "OTHER";
  };

  const ordered = [...regions].sort((a, b) => {
    const rank: Record<string, number> = { UK: 0, IE: 1, US: 2, OTHER: 99 };
    return rank[normalizeRegion(a)] - rank[normalizeRegion(b)];
  });
  return (
    <View style={styles.shellRoot}>
      <View style={styles.shellTop}>
        <Text style={styles.shellMenu}>☰</Text>
        <Text style={styles.shellLogo}>PAYGO</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable onPress={onOpenConfig} style={{ backgroundColor: "#d7c3b1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: "#1f1b15", fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1 }}>CONFIG</Text>
          </Pressable>
          <View style={styles.shellAvatar} />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.shellBody}>
        <Text style={styles.shellDisplay}>Region{"\n"}Selector</Text>
        <Text style={styles.shellLead}>Select your primary market to customize your PAYGO experience, including currency, local regulations, and available features.</Text>
        {ordered.map((r) => {
          const key = normalizeRegion(r);
          const isUK = key === "UK";
          const isUS = key === "US";
          const isIE = key === "IE";
          const title = isUK ? "United Kingdom" : isUS ? "United States" : "Ireland";
          const body =
            isUK
              ? "Ember · Smart meter enabled · Ofgem regulated"
              : isUS
                ? "Pulse · AMI smart meters · EV, solar & TOU pricing"
                : "Solas · Non-smart meter market · CRU regulated";
          const currency = isUK ? "GBP (£)" : isUS ? "USD ($)" : "EUR (€)";
          const selectLabel = isUK ? "Select UK" : isUS ? "Select US" : "Select Ireland";
          const icon = isUK ? "🔥" : isUS ? "〰" : "☀";
          return (
            <Pressable key={r.id} style={styles.shellCard} onPress={() => onSelect(r)}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  {isUK && <Text style={styles.shellTag}>PRIMARY REGION</Text>}
                  <Text style={styles.shellCardTitle}>{title}</Text>
                  <Text style={styles.shellCardBody}>{body}</Text>
                </View>
                <View style={styles.shellIconWrap}>
                  <Text style={styles.shellIcon}>{icon}</Text>
                </View>
              </View>
              <View style={styles.shellCardRow}>
                <Text style={styles.shellCurrency}>{currency}</Text>
                <View style={styles.shellSelectBtn}><Text style={styles.shellSelectTxt}>{selectLabel} →</Text></View>
              </View>
            </Pressable>
          );
        })}
        <View style={styles.shellCapabilityWrap}>
          <View style={styles.shellCapabilityBlock}>
            <Text style={styles.shellCapabilityTitle}>PAYGO — DEMO APP</Text>
            <Text style={styles.shellCapabilityBody}>
              This app is a product demonstration tool built to explore prepayment energy management concepts across UK, Irish, and US markets.
            </Text>
          </View>
          <View style={styles.shellCapabilityBlock}>
            <Text style={styles.shellCapabilityBody}>
              All customer profiles, account data, and energy usage shown are entirely fictional. No real customer information, payment details, or live energy accounts are used at any point.
            </Text>
          </View>
          <View style={styles.shellCapabilityBlock}>
            <Text style={styles.shellCapabilityBody}>
              This is not a consumer product. No personal data is collected or stored.
            </Text>
            <Text style={[styles.shellCapabilityBody, { marginTop: 10, fontSize: 15 }]}>
              Built by David Loake · david.loake@ensek.co.uk
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function CustomerScreen({ brand, title, customers, onSelect, onHome }: { brand: Brand; title: string; customers: CustomerProfile[]; onSelect: (c: CustomerProfile) => void; onHome: () => void }) {
  if (brand === "ember") {
    const sorted = [...customers].sort((a, b) => {
      const av = a.segment.toLowerCase().includes("vulnerable") ? 1 : 0;
      const bv = b.segment.toLowerCase().includes("vulnerable") ? 1 : 0;
      return av - bv;
    });

    const cards = sorted.slice(0, 2);
    return (
      <View style={{ flex: 1, backgroundColor: "#fff8f3" }}>
        <View style={{ marginHorizontal: 16, marginTop: 14, marginBottom: 4, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: "#855000", fontSize: 16 }}>⚡</Text>
            <Text style={{ color: "#855000", fontFamily: "Inter_800ExtraBold", fontSize: 22, letterSpacing: -0.5 }}>PAYGO</Text>
          </View>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#f0e7dd", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 14 }}>👤</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 112, gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ borderRadius: 999, backgroundColor: "rgba(252,170,51,0.2)", paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ color: "#6b4200", fontSize: 11 }}>📍</Text>
              <Text style={{ color: "#6b4200", fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.8 }}>UK REGION SELECTED</Text>
            </View>
            <Pressable onPress={onHome}>
              <Text style={{ color: "#855000", fontFamily: "Inter_700Bold", fontSize: 12 }}>Change Region</Text>
            </Pressable>
          </View>
          <Text style={{ color: "#855000", fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 2 }}>SCREEN ID: S-03</Text>
          <Text style={{ color: "#1f1b15", fontFamily: "Inter_800ExtraBold", fontSize: 48, lineHeight: 52 }}>Select an Ember Profile</Text>

          {cards.map((item, i) => {
            const vulnerable = item.segment.toLowerCase().includes("vulnerable");
            const bal = item.account?.balance ?? (vulnerable ? 4.2 : 18.4);
            const days = item.account?.daysRemaining ?? (vulnerable ? 2 : 9);
            return (
              <Pressable
                key={item.id}
                onPress={() => onSelect(item)}
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: 12,
                  padding: 16,
                  shadowColor: vulnerable ? "rgba(186,26,26,0.15)" : "rgba(31,27,21,0.06)",
                  shadowOpacity: 1,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 8 },
                  borderWidth: 1,
                  borderColor: "rgba(215,195,177,0.6)",
                  gap: 12,
                }}
              >
                <View style={{ alignSelf: "flex-end", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: vulnerable ? "#ffdad6" : "rgba(252,170,51,0.2)" }}>
                  <Text style={{ color: vulnerable ? "#93000a" : "#6b4200", fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.8 }}>
                    {vulnerable ? "UK - VULNERABLE" : "UK - STANDARD"}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#f0e7dd", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "#855000", fontSize: 24 }}>👤</Text>
                  </View>
                  <View>
                    <Text style={{ color: "#1f1b15", fontFamily: "Inter_800ExtraBold", fontSize: 31 }}>{item.name}</Text>
                    <Text style={{ color: "#524436", fontFamily: "Inter_500Medium", fontSize: 14 }}>{vulnerable ? "Support Variable" : "Ember Home Plus"}</Text>
                  </View>
                </View>
                <View style={{ borderRadius: 10, padding: 12, backgroundColor: vulnerable ? "rgba(255,218,214,0.25)" : "#fcf2e8" }}>
                  <Text style={{ color: vulnerable ? "#ba1a1a" : "#524436", fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1 }}>
                    {vulnerable ? "LOW BALANCE ALERT" : "CURRENT BALANCE"}
                  </Text>
                  <View style={{ marginTop: 2, flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
                    <Text style={{ color: vulnerable ? "#ba1a1a" : "#855000", fontFamily: "Inter_800ExtraBold", fontSize: 40 }}>£{bal.toFixed(2)}</Text>
                    <Text style={{ color: vulnerable ? "#ba1a1a" : "#524436", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>~{days} days left</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={{ color: vulnerable ? "#ba1a1a" : "#006387", fontSize: 13 }}>{vulnerable ? "🏠" : "↻"}</Text>
                    <Text style={{ color: vulnerable ? "#ba1a1a" : "#524436", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                      {vulnerable ? "Emergency Credit Ready" : "Auto top-up active"}
                    </Text>
                  </View>
                  <Text style={{ color: vulnerable ? "#ba1a1a" : "#006387", fontSize: 18 }}>›</Text>
                </View>
              </Pressable>
            );
          })}

          <Pressable
            style={{
              borderRadius: 12,
              borderWidth: 2,
              borderStyle: "dashed",
              borderColor: "#d7c3b1",
              padding: 20,
              alignItems: "center",
              backgroundColor: "transparent",
            }}
          >
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "#f0e7dd", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#857464", fontSize: 24 }}>＋</Text>
            </View>
            <Text style={{ marginTop: 10, color: "#524436", fontFamily: "Inter_700Bold", fontSize: 22 }}>Add New Profile</Text>
            <Text style={{ marginTop: 4, color: "#857464", fontFamily: "Inter_500Medium", fontSize: 13 }}>
              Initialize a new market segment profile
            </Text>
          </Pressable>
        </ScrollView>

        <View style={{ position: "absolute", left: 16, right: 16, bottom: 8, borderRadius: 12, backgroundColor: "#fff8f3", paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", shadowColor: "rgba(133,80,0,0.08)", shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: -2 } }}>
          {["DASHBOARD", "USAGE", "TOP-UP", "PROFILE"].map((label, i) => (
            <View key={label} style={{ alignItems: "center", gap: 2, backgroundColor: i === 0 ? "#f0e7dd" : "transparent", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: i === 0 ? "#855000" : "#78716c", fontSize: 14 }}>{i === 0 ? "▦" : i === 1 ? "◫" : i === 2 ? "⚡" : "•"}</Text>
              <Text style={{ color: i === 0 ? "#855000" : "#78716c", fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1 }}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (brand === "solas") {
    const sorted = [...customers].sort((a, b) => (a.account?.balance ?? 0) < (b.account?.balance ?? 0) ? 1 : -1);
    const aoife = sorted[0] ?? customers[0];
    const ciaran = sorted[1] ?? customers[1] ?? customers[0];
    return (
      <View style={{ flex: 1, backgroundColor: "#fcf9f6" }}>
        <View style={{ position: "absolute", top: 10, left: 0, right: 0, zIndex: 30, paddingHorizontal: 20, height: 58, backgroundColor: "rgba(252,249,246,0.7)", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ color: "#56674e", fontSize: 17 }}>☰</Text>
            <Text style={{ color: "#1D9E75", fontFamily: "PlusJakartaSans_700Bold", fontSize: 29, fontStyle: "italic" }}>Solas</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: "#3d4943", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase" }}>PAYGO Portal</Text>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#eae8e5", borderWidth: 1, borderColor: "rgba(188,202,193,0.4)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 13 }}>👤</Text>
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 84, paddingBottom: 110, gap: 14 }}>
          <View style={{ marginTop: 6, marginBottom: 8 }}>
            <View style={{ alignSelf: "flex-start", borderRadius: 999, backgroundColor: "rgba(210,230,197,0.5)", paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ color: "#00694c", fontSize: 12 }}>📍</Text>
              <Text style={{ color: "#56674e", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 9, letterSpacing: 1.1, textTransform: "uppercase" }}>Ireland Region Selected</Text>
            </View>
            <Text style={{ marginTop: 12, color: "#1c1c1a", fontFamily: "PlusJakartaSans_700Bold", fontSize: 43, lineHeight: 45 }}>Select a Solas Profile</Text>
            <Text style={{ marginTop: 4, color: "#3d4943", fontFamily: "BeVietnamPro_400Regular", fontSize: 14, lineHeight: 22 }}>
              Manage your prepayment meters, top-ups, and account support from a single dashboard.
            </Text>
            <Pressable onPress={onHome} style={{ marginTop: 8 }}>
              <Text style={{ color: "#00694c", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 12 }}>Change Region</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => aoife && onSelect(aoife)} style={{ backgroundColor: "#ffffff", borderRadius: 30, padding: 16, borderWidth: 1, borderColor: "rgba(188,202,193,0.25)", shadowColor: "rgba(29,158,117,0.08)", shadowOpacity: 1, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 58, height: 58, borderRadius: 16, backgroundColor: "rgba(0,105,76,0.05)", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 22 }}>👩</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: "#1c1c1a", fontFamily: "PlusJakartaSans_700Bold", fontSize: 22 }}>{aoife?.name ?? "Aoife R."}</Text>
                  <Text style={{ marginTop: 2, color: "#3d4943", fontFamily: "BeVietnamPro_500Medium", fontSize: 12, backgroundColor: "#f0edea", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" }}>
                    Standard Segment
                  </Text>
                </View>
              </View>
              <View style={{ marginLeft: 10, width: 120, alignItems: "flex-end" }}>
                <Text style={{ color: "#3d4943", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase" }}>Current Balance</Text>
                <Text numberOfLines={1} style={{ color: "#00694c", fontFamily: "PlusJakartaSans_700Bold", fontSize: 30 }}>€{(aoife?.account?.balance ?? 22).toFixed(2)}</Text>
              </View>
            </View>
            <View style={{ backgroundColor: "#f6f3f0", borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,105,76,0.1)", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#00694c", fontSize: 15 }}>⟳</Text>
              </View>
              <View>
                <Text style={{ color: "#1c1c1a", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 13 }}>Scheduled top-up active</Text>
                <Text style={{ color: "#3d4943", fontFamily: "BeVietnamPro_400Regular", fontSize: 11 }}>Next: €20.00 on Friday</Text>
              </View>
            </View>
            <View style={{ marginTop: 12, borderRadius: 999, backgroundColor: "#00694c", height: 46, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#ffffff", fontFamily: "PlusJakartaSans_700Bold", fontSize: 13, letterSpacing: 0.4 }}>Access Dashboard</Text>
            </View>
          </Pressable>

          <Pressable onPress={() => ciaran && onSelect(ciaran)} style={{ backgroundColor: "#ffffff", borderRadius: 30, padding: 16, borderWidth: 1, borderColor: "rgba(188,202,193,0.25)", shadowColor: "rgba(29,158,117,0.08)", shadowOpacity: 1, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 58, height: 58, borderRadius: 16, backgroundColor: "rgba(123,84,43,0.05)", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 22 }}>👨</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: "#1c1c1a", fontFamily: "PlusJakartaSans_700Bold", fontSize: 22 }}>{ciaran?.name ?? "Ciarán B."}</Text>
                  <Text style={{ marginTop: 2, color: "#93000a", fontFamily: "BeVietnamPro_500Medium", fontSize: 12, backgroundColor: "rgba(255,218,214,0.35)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" }}>
                    Debt-risk Segment
                  </Text>
                </View>
              </View>
              <View style={{ marginLeft: 10, width: 120, alignItems: "flex-end" }}>
                <Text style={{ color: "#3d4943", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase" }}>Current Balance</Text>
                <Text numberOfLines={1} style={{ color: "#1c1c1a", fontFamily: "PlusJakartaSans_700Bold", fontSize: 30 }}>€{(ciaran?.account?.balance ?? 7.5).toFixed(2)}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1, borderRadius: 12, backgroundColor: "rgba(255,220,189,0.3)", padding: 10 }}>
                <Text style={{ color: "#7b542b", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 10, textTransform: "uppercase" }}>Plan</Text>
                <Text style={{ marginTop: 4, color: "#1c1c1a", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 12 }}>€5/week</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 12, backgroundColor: "rgba(255,218,214,0.3)", padding: 10 }}>
                <Text style={{ color: "#93000a", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 10, textTransform: "uppercase" }}>Action</Text>
                <Text style={{ marginTop: 4, color: "#1c1c1a", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 12 }}>Meter read due</Text>
              </View>
            </View>
            <View style={{ marginTop: 12, borderRadius: 999, backgroundColor: "#d2e6c5", height: 46, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#56674e", fontFamily: "PlusJakartaSans_700Bold", fontSize: 13, letterSpacing: 0.4 }}>Review Repayment</Text>
            </View>
          </Pressable>

          <Pressable style={{ borderRadius: 30, borderWidth: 2, borderStyle: "dashed", borderColor: "rgba(188,202,193,0.5)", paddingVertical: 26, alignItems: "center", justifyContent: "center", gap: 8 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#f0edea", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#52634a", fontSize: 24 }}>＋</Text>
            </View>
            <Text style={{ color: "#3d4943", fontFamily: "PlusJakartaSans_700Bold", fontSize: 20 }}>Add New Profile</Text>
          </Pressable>
        </ScrollView>

        <View style={{ position: "absolute", left: 12, right: 12, bottom: 8, borderRadius: 32, backgroundColor: "rgba(252,249,246,0.9)", borderTopWidth: 1, borderTopColor: "rgba(188,202,193,0.2)", shadowColor: "rgba(29,158,117,0.05)", shadowOpacity: 1, shadowRadius: 40, shadowOffset: { width: 0, height: -4 }, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 8, paddingVertical: 10 }}>
          {["Home", "Payments", "Account", "Support"].map((label, i) => (
            <Pressable
              key={label}
              onPress={undefined}
              style={{ flex: 1, alignItems: "center", gap: 2, paddingHorizontal: 4, paddingVertical: 5, borderRadius: 999, backgroundColor: i === 0 ? "#d2e6c5" : "transparent" }}
            >
              <Text style={{ color: i === 0 ? "#1D9E75" : "#56674e", fontSize: 13 }}>{i === 0 ? "⌂" : i === 1 ? "₠" : i === 2 ? "◉" : "?"}</Text>
              <Text numberOfLines={1} style={{ color: i === 0 ? "#1D9E75" : "#56674e", fontFamily: "BeVietnamPro_500Medium", fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  if (brand === "pulse") {
    const sorted = [...customers].sort((a, b) => (b.account?.balance ?? 0) - (a.account?.balance ?? 0));
    const jordan = sorted[1] ?? sorted[0] ?? customers[0];
    const maya = sorted[0] ?? sorted[1] ?? customers[0];
    return (
      <View style={{ flex: 1, backgroundColor: "#10141a" }}>
        <View style={{ position: "absolute", top: 10, left: 0, right: 0, zIndex: 30, paddingHorizontal: 20, height: 58, backgroundColor: "rgba(2,6,23,0.6)", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ color: "#818cf8", fontSize: 18 }}>☰</Text>
            <Text style={{ color: "#818cf8", fontFamily: "SpaceGrotesk_700Bold", fontSize: 29, letterSpacing: -1, textTransform: "uppercase" }}>PULSE</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ color: "#94a3b8", fontFamily: "SpaceGrotesk_700Bold", fontSize: 9, letterSpacing: 1.4, textTransform: "uppercase" }}>NETWORK STATUS: OPTIMAL</Text>
            <Text style={{ color: "#818cf8", fontSize: 16 }}>⌁</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 86, paddingBottom: 110 }}>
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <View style={{ width: 26, height: 2, backgroundColor: "#00dddd" }} />
              <Text style={{ color: "#00dddd", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 2.4, textTransform: "uppercase" }}>System Selector</Text>
            </View>
            <Text style={{ color: "#dfe2eb", fontFamily: "SpaceGrotesk_700Bold", fontSize: 55, lineHeight: 56 }}>Select a Pulse Profile</Text>
            <Text style={{ marginTop: 4, color: "#00dddd", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 1.8, textTransform: "uppercase" }}>USA Region Selected</Text>
          </View>

          <Pressable onPress={() => jordan && onSelect(jordan)} style={{ borderLeftWidth: 4, borderLeftColor: "#534ab7", backgroundColor: "#1c2026", borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <Text style={{ position: "absolute", top: 8, right: 8, color: "rgba(223,226,235,0.2)", fontSize: 34 }}>⚡</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
              <View>
                <Text style={{ color: "#dfe2eb", fontFamily: "SpaceGrotesk_700Bold", fontSize: 30 }}>{jordan?.name ?? "Jordan K."}</Text>
                <Text style={{ color: "#928f9e", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase" }}>EV-owner segment</Text>
              </View>
              <View style={{ borderRadius: 4, backgroundColor: "rgba(83,74,183,0.2)", paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ color: "#c5c0ff", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10 }}>ID: 882-JK</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              <Text style={{ color: "#00dddd", fontFamily: "SpaceGrotesk_700Bold", fontSize: 45 }}>${(jordan?.account?.balance ?? 41).toFixed(2)}</Text>
              <Text style={{ color: "#928f9e", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 1.1, marginBottom: 8, textTransform: "uppercase" }}>Current Balance</Text>
            </View>
            <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: "rgba(71,69,83,0.25)", paddingTop: 8, flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: "#c8c4d5", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, textTransform: "uppercase" }}>⏱ TOU Rates Active</Text>
              <Text style={{ color: "#c8c4d5", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, textTransform: "uppercase" }}>⌁ Smart Meter On</Text>
            </View>
          </Pressable>

          <Pressable onPress={() => maya && onSelect(maya)} style={{ borderLeftWidth: 4, borderLeftColor: "#00dddd", backgroundColor: "#1c2026", borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <Text style={{ position: "absolute", top: 8, right: 8, color: "rgba(223,226,235,0.2)", fontSize: 34 }}>☀</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
              <View>
                <Text style={{ color: "#dfe2eb", fontFamily: "SpaceGrotesk_700Bold", fontSize: 30 }}>{maya?.name ?? "Maya C."}</Text>
                <Text style={{ color: "#928f9e", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase" }}>Solar-exporter segment</Text>
              </View>
              <View style={{ borderRadius: 4, backgroundColor: "rgba(0,221,221,0.1)", paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ color: "#00dddd", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10 }}>ID: 412-MC</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              <Text style={{ color: "#00dddd", fontFamily: "SpaceGrotesk_700Bold", fontSize: 45 }}>${(maya?.account?.balance ?? 63.2).toFixed(2)}</Text>
              <Text style={{ color: "#928f9e", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 1.1, marginBottom: 8, textTransform: "uppercase" }}>Current Balance</Text>
            </View>
            <View style={{ marginTop: 10, gap: 8, borderTopWidth: 1, borderTopColor: "rgba(71,69,83,0.25)", paddingTop: 8 }}>
              <View style={{ backgroundColor: "#0a0e14", borderRadius: 4, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: "#c8c4d5", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, textTransform: "uppercase" }}>☘ Solar Export</Text>
                <Text style={{ color: "#00dddd", fontFamily: "SpaceGrotesk_700Bold", fontSize: 11 }}>+$4.80 TODAY</Text>
              </View>
              <View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: "#928f9e", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, textTransform: "uppercase" }}>Battery Storage</Text>
                  <Text style={{ color: "#dfe2eb", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10 }}>78%</Text>
                </View>
                <View style={{ marginTop: 4, height: 4, borderRadius: 999, backgroundColor: "#31353c" }}>
                  <View style={{ width: "78%", height: 4, borderRadius: 999, backgroundColor: "#00dddd" }} />
                </View>
              </View>
            </View>
          </Pressable>

          <Pressable style={{ borderWidth: 2, borderStyle: "dashed", borderColor: "rgba(71,69,83,0.5)", borderRadius: 8, paddingVertical: 24, alignItems: "center", gap: 8 }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: "#31353c", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#928f9e", fontSize: 20 }}>＋</Text>
            </View>
            <Text style={{ color: "#928f9e", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>Add New Profile</Text>
          </Pressable>
        </ScrollView>

        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(2,6,23,0.8)", paddingHorizontal: 12, paddingTop: 8, paddingBottom: 18, flexDirection: "row", justifyContent: "space-between" }}>
          {["DASHBOARD", "METRICS", "ALERTS", "SYSTEM"].map((label, i) => (
            <View key={label} style={{ alignItems: "center", gap: 2, borderRadius: 4, paddingHorizontal: i === 0 ? 10 : 8, paddingVertical: i === 0 ? 6 : 4, backgroundColor: i === 0 ? "rgba(67,56,202,0.3)" : "transparent" }}>
              <Text style={{ color: i === 0 ? "#22d3ee" : "#64748b", fontSize: 12 }}>{i === 0 ? "◫" : i === 1 ? "⌁" : i === 2 ? "◉" : "⚙"}</Text>
              <Text style={{ color: i === 0 ? "#22d3ee" : "#64748b", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 1.5 }}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  const b = TOKENS.ember;
  const header = "PlusJakartaSans_700Bold";
  const body = "PlusJakartaSans_400Regular";
  return (
    <>
      <InnerHeader brand={brand} title={title} subtitle="SELECT PERSONA" onHome={onHome} />
      <FlatList
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 90 }}
        data={customers}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => onSelect(item)} style={{ backgroundColor: b.surface, borderRadius: 14, padding: 12 }}>
            <View style={{ backgroundColor: b.background, borderRadius: 12, padding: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                <Text numberOfLines={2} style={{ flex: 1, color: b.text, fontFamily: header, fontSize: 24 }}>{item.name}</Text>
                <View style={{ backgroundColor: "#eddcc8", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
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

function InnerHeader({ brand, title, subtitle, onBack, onHome, onConfig }: { brand: Brand; title: string; subtitle: string; onBack?: () => void; onHome?: () => void; onConfig?: () => void }) {
  const isPulse = brand === "pulse";
  const bg = isPulse ? TOKENS.pulse.background : TOKENS[brand === "shell" ? "ember" : brand].background;
  const fg = isPulse ? TOKENS.pulse.text : TOKENS[brand === "shell" ? "ember" : brand].text;
  const bodyFont = isPulse ? "SpaceGrotesk_400Regular" : brand === "ember" ? "Inter_500Medium" : "PlusJakartaSans_400Regular";
  const titleFont = isPulse ? "SpaceGrotesk_700Bold" : brand === "ember" ? "Newsreader_500Medium" : "PlusJakartaSans_700Bold";
  return (
    <BlurView intensity={20} tint={isPulse ? "dark" : "light"} style={{ margin: 16, borderRadius: 12, padding: 12, backgroundColor: isPulse ? "rgba(2,6,23,0.85)" : `${bg}CC` }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Pressable onPress={onHome}>{onHome ? <Text style={{ color: fg, fontFamily: bodyFont, fontSize: 16 }}>Home</Text> : <View />}</Pressable>
        <Pressable onPress={onConfig}>{onConfig ? <Text style={{ color: fg, fontFamily: bodyFont, fontSize: 16 }}>Config</Text> : <View />}</Pressable>
      </View>
      <Text style={{ marginTop: 6, color: fg, fontFamily: titleFont, fontSize: 42, lineHeight: 42 }}>{title}</Text>
      <Text style={{ marginTop: 2, color: isPulse ? TOKENS.pulse.muted : TOKENS[brand === "shell" ? "ember" : brand].muted, fontFamily: bodyFont, fontSize: 12, letterSpacing: 1.2 }}>{subtitle}</Text>
    </BlurView>
  );
}

function EmberDashboard({
  customer,
  region,
  featureFlags,
  payments,
  onTopUp,
  onPayments,
  onSupport,
  onAccount,
  onHome,
  onConfig,
}: {
  customer: CustomerProfile;
  region: RegionConfig;
  featureFlags: Record<string, boolean>;
  payments: PaymentItem[];
  onTopUp: () => void;
  onPayments: () => void;
  onSupport: () => void;
  onAccount: () => void;
  onHome: () => void;
  onConfig: () => void;
}) {
  const balance = Number(customer.account?.balance ?? 0);
  const daysRemaining = Number(customer.account?.daysRemaining ?? Math.max(1, Math.floor(balance / 1.2)));
  const debtBalance = Number(customer.account?.debtBalance ?? 0);
  const isDebtRisk = debtBalance > 0 || Boolean(customer.alerts?.lowBalance);
  const showScheduledTopUp = Boolean(featureFlags.autoTopUp || featureFlags.scheduledTopUp) && !isDebtRisk;
  const showDebtRepayment = debtBalance > 0 && (Boolean(featureFlags.debtRepaymentPlan) || isDebtRisk);
  const showMeterReadPrompt = Boolean(featureFlags.meterReadSubmission) || customer.account?.meterType === "non-smart" || isDebtRisk;
  const repaymentTarget = 120;
  const repaid = Math.max(0, repaymentTarget - Math.min(repaymentTarget, debtBalance));
  const repaymentPct = Math.max(0, Math.min(100, Math.round((repaid / repaymentTarget) * 100)));

  return (
    <View style={{ flex: 1, backgroundColor: "#fdf9f4" }}>
      <View style={{ position: "absolute", top: 12, left: 0, right: 0, zIndex: 40, paddingHorizontal: 24, height: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={onHome}><Text style={{ color: "#1f1b15", fontFamily: "Manrope_700Bold", fontSize: 16 }}>Home</Text></Pressable>
        <Pressable onPress={onConfig}><Text style={{ color: "#1f1b15", fontFamily: "Manrope_700Bold", fontSize: 16 }}>Config</Text></Pressable>
      </View>
      <View style={{ position: "absolute", top: 40, left: 0, right: 0, zIndex: 30, paddingHorizontal: 24, height: 58, backgroundColor: "rgba(253,249,244,0.86)", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ color: "#524436", fontFamily: "Manrope_500Medium", fontSize: 18 }}>≡</Text>
          <Text style={{ color: "#855000", fontFamily: "Newsreader_500Medium", fontSize: 30, fontStyle: "italic" }}>Ember</Text>
        </View>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#e6e2dd", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#524436", fontSize: 12 }}>👤</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 126, paddingBottom: 154, gap: 12 }}>
        <View>
          <Text style={{ color: "#524436", fontFamily: "Manrope_500Medium", fontSize: 11, letterSpacing: 2.2, textTransform: "uppercase" }}>Current Status — London, UK</Text>
          <Text style={{ marginTop: 10, color: "#1c1c19", fontFamily: "Newsreader_500Medium", fontSize: 52, lineHeight: 50 }}>Payment overview</Text>
          <Text style={{ marginTop: 8, color: "#524436", fontFamily: "Manrope_400Regular", fontSize: 17, lineHeight: 28 }}>
            A clear view of your prepayment balance, runway, and next actions.
          </Text>
        </View>

        <View style={{ backgroundColor: "#f7f3ee", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16 }}>
          <Text style={{ color: "#524436", fontFamily: "Manrope_500Medium", fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>Current Balance</Text>
          <Text style={{ marginTop: 4, color: "#855000", fontFamily: "Newsreader_500Medium", fontSize: 68, lineHeight: 70 }}>
            £{balance.toFixed(2)}
          </Text>
          <Text style={{ marginTop: 4, color: "#69635d", fontFamily: "Manrope_400Regular", fontSize: 12 }}>
            PAYG available balance
          </Text>
        </View>

        <View style={{ backgroundColor: "#efe7dd", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16 }}>
          <Text style={{ color: "#524436", fontFamily: "Manrope_500Medium", fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>Days Remaining</Text>
          <Text style={{ marginTop: 4, color: "#1c1c19", fontFamily: "Newsreader_500Medium", fontSize: 48, lineHeight: 52 }}>
            {daysRemaining} days
          </Text>
          <Text style={{ marginTop: 2, color: "#69635d", fontFamily: "Manrope_400Regular", fontSize: 12 }}>
            Based on your recent usage.
          </Text>
        </View>

        <AiAnalystCard
          brand="ember"
          enabled={Boolean(featureFlags.aiAnalystCard)}
          customer={customer}
          region={region}
          payments={payments}
          featureFlags={featureFlags}
        />

        {showScheduledTopUp ? (
          <View style={{ borderRadius: 12, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "rgba(215,195,177,0.45)", paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ color: "#6f5a49", fontFamily: "Manrope_700Bold", fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase" }}>Scheduled Top-up Active</Text>
            <Text style={{ marginTop: 6, color: "#1c1c19", fontFamily: "Newsreader_500Medium", fontSize: 36, lineHeight: 40 }}>Next top-up £20 on Friday</Text>
          </View>
        ) : null}

        {showDebtRepayment ? (
          <View style={{ borderRadius: 12, backgroundColor: "#fff7f7", borderWidth: 1, borderColor: "rgba(186,26,26,0.2)", paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ color: "#93000a", fontFamily: "Manrope_700Bold", fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase" }}>Debt Repayment Plan</Text>
            <Text style={{ marginTop: 6, color: "#1c1c19", fontFamily: "Newsreader_500Medium", fontSize: 34, lineHeight: 38 }}>£5/week active</Text>
            <Text style={{ marginTop: 4, color: "#6f5a49", fontFamily: "Manrope_400Regular", fontSize: 12 }}>
              £{repaid.toFixed(0)} paid of £{repaymentTarget}
            </Text>
            <View style={{ marginTop: 8, height: 8, borderRadius: 999, backgroundColor: "#f0e7dd" }}>
              <View style={{ width: `${repaymentPct}%` as `${number}%`, height: 8, borderRadius: 999, backgroundColor: "#855000" }} />
            </View>
          </View>
        ) : null}

        {showMeterReadPrompt ? (
          <Pressable onPress={onSupport} style={{ borderRadius: 12, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "rgba(215,195,177,0.45)", paddingHorizontal: 14, paddingVertical: 12 }}>
            <Text style={{ color: "#93000a", fontFamily: "Manrope_700Bold", fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase" }}>Action Required</Text>
            <Text style={{ marginTop: 6, color: "#1c1c19", fontFamily: "Newsreader_500Medium", fontSize: 34, lineHeight: 38 }}>Meter read due</Text>
            <Text style={{ marginTop: 4, color: "#6f5a49", fontFamily: "Manrope_400Regular", fontSize: 12 }}>
              Submit a reading for a more accurate estimate.
            </Text>
          </Pressable>
        ) : null}

        <Pressable onPress={onTopUp} style={{ borderRadius: 10, backgroundColor: "#855000", height: 54, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#ffffff", fontFamily: "Manrope_700Bold", fontSize: 16 }}>Quick Top-up</Text>
        </Pressable>
      </ScrollView>

      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 86, borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: "#fdf9f4", shadowColor: "rgba(82,68,54,0.15)", shadowOffset: { width: 0, height: -12 }, shadowOpacity: 1, shadowRadius: 32, flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingHorizontal: 8, paddingTop: 8, paddingBottom: 16 }}>
        {[
          { label: "HOME", icon: "⌂", isActive: true },
          { label: "PAYMENTS", icon: "⌘", isActive: false },
          { label: "ACCOUNT", icon: "▮", isActive: false },
          { label: "SUPPORT", icon: "●", isActive: false },
        ].map((item) => (
          <Pressable key={item.label} onPress={item.label === "PAYMENTS" ? onPayments : item.label === "ACCOUNT" ? onAccount : item.label === "SUPPORT" ? onSupport : undefined} style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ color: item.isActive ? "#855000" : "#524436", fontSize: 15 }}>{item.icon}</Text>
            <Text style={{ marginTop: 2, color: item.isActive ? "#855000" : "#524436", fontFamily: "Manrope_700Bold", fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SolasDashboard({
  customer,
  region,
  featureFlags,
  payments,
  onTopUp,
  onPayments,
  onSupport,
  onAccount,
  onHome,
  onConfig,
}: {
  customer: CustomerProfile;
  region: RegionConfig;
  featureFlags: Record<string, boolean>;
  payments: PaymentItem[];
  onTopUp: () => void;
  onPayments: () => void;
  onSupport: () => void;
  onAccount: () => void;
  onHome: () => void;
  onConfig: () => void;
}) {
  const displayName = customer.name?.split(" ")[0] ?? "Cillian";
  const balance = customer.account?.balance ?? 22;
  const daysRemaining = customer.account?.daysRemaining ?? Math.max(1, Math.floor(balance / 1.2));
  const debtSegment = customer.segment.toLowerCase().includes("debt");
  const rawDebtBalance = Number(customer.account?.debtBalance ?? 0);
  const debtBalance = rawDebtBalance > 0 ? rawDebtBalance : debtSegment ? 73 : 0;
  const isDebtRisk = debtBalance > 0 || Boolean(customer.alerts?.lowBalance) || debtSegment;
  const showDebtRepayment = debtBalance > 0;
  const showMeterReadPrompt = isDebtRisk || Boolean(featureFlags.meterReadSubmission) || customer.account?.meterType === "non-smart";
  const scheduledTopUp = customer.topUpConfig?.autoTopUpEnabled !== false;
  const repaymentTarget = 120;
  const repaymentRemaining = Math.max(0, Math.min(repaymentTarget, debtBalance));
  const repaymentPaid = repaymentTarget - repaymentRemaining;
  const repaymentPct = Math.max(0, Math.min(100, Math.round((repaymentPaid / repaymentTarget) * 100)));
  return (
    <View style={{ flex: 1, backgroundColor: "#fcf9f6" }}>
      <View style={{ position: "absolute", top: 8, left: 0, right: 0, zIndex: 40, paddingHorizontal: 20, height: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={onHome}><Text style={{ color: "#1c1c1a", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 16 }}>Home</Text></Pressable>
        <Pressable onPress={onConfig}><Text style={{ color: "#1c1c1a", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 16 }}>Config</Text></Pressable>
      </View>
      <View style={{ position: "absolute", top: 34, left: 0, right: 0, zIndex: 30, paddingHorizontal: 20, height: 58, backgroundColor: "rgba(252,249,246,0.7)", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ color: "#56674e", fontSize: 17 }}>☰</Text>
          <Text style={{ color: "#1D9E75", fontFamily: "PlusJakartaSans_700Bold", fontSize: 29, fontStyle: "italic" }}>Solas</Text>
        </View>
        <View style={{ width: 34, height: 34, borderRadius: 17, overflow: "hidden", borderWidth: 1, borderColor: "rgba(0,105,76,0.08)" }}>
          <Image
            source={{ uri: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80" }}
            style={{ width: "100%", height: "100%" }}
          />
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 108, paddingBottom: 112 }}>
        <Text style={{ color: "#00694c", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" }}>Morning, {displayName}</Text>
        <Text style={{ marginTop: 6, color: "#1c1c1a", fontFamily: "PlusJakartaSans_700Bold", fontSize: 46, lineHeight: 48 }}>
          You're in control{"\n"}today.
        </Text>
        <Text style={{ marginTop: 8, color: "#3d4943", fontFamily: "BeVietnamPro_400Regular", fontSize: 15, lineHeight: 23 }}>
          Your PAYG account overview is below. Amounts and days are estimates based on your recent usage.
        </Text>

        <View style={{ marginTop: 16, backgroundColor: "#f0edea", borderRadius: 22, padding: 14 }}>
          <Text style={{ color: "#1c1c1a", fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 22 }}>Balance</Text>
          <View style={{ marginTop: 6, flexDirection: "row", alignItems: "flex-end" }}>
            <Text style={{ color: "#00694c", fontFamily: "PlusJakartaSans_700Bold", fontSize: 52 }}>€{balance.toFixed(2)}</Text>
          </View>
          <Text style={{ marginTop: 10, color: "#3d4943", fontFamily: "BeVietnamPro_400Regular", fontSize: 12 }}>Current PAYG available balance</Text>
        </View>

        <View style={{ marginTop: 12, borderRadius: 18, backgroundColor: "#f6f3f0", padding: 14 }}>
          <Text style={{ color: "#52634a", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase" }}>Days Remaining</Text>
          <Text style={{ marginTop: 4, color: "#1c1c1a", fontFamily: "PlusJakartaSans_700Bold", fontSize: 36 }}>{daysRemaining} days</Text>
          <Text style={{ marginTop: 6, color: "#3d4943", fontFamily: "BeVietnamPro_400Regular", fontSize: 12, lineHeight: 18 }}>
            Based on your recent usage. This estimate can change if your usage changes.
          </Text>
        </View>

        {scheduledTopUp && !isDebtRisk && (
          <View style={{ marginTop: 12, borderRadius: 18, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "rgba(188,202,193,0.35)", padding: 14 }}>
            <View style={{ alignSelf: "flex-start", borderRadius: 999, backgroundColor: "#d2e6c5", paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ color: "#56674e", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }}>Scheduled Top-up Active</Text>
            </View>
            <Text style={{ marginTop: 10, color: "#1c1c1a", fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 21 }}>Next top-up: €20.00 on Friday</Text>
          </View>
        )}

        {showDebtRepayment && (
          <>
            <View style={{ marginTop: 12, borderRadius: 18, backgroundColor: "#fff8f7", borderWidth: 1, borderColor: "rgba(186,26,26,0.2)", padding: 14 }}>
              <Text style={{ color: "#93000a", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase" }}>Debt Repayment Plan</Text>
              <Text style={{ marginTop: 6, color: "#1c1c1a", fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 24 }}>€5/week active</Text>
              <Text style={{ marginTop: 4, color: "#3d4943", fontFamily: "BeVietnamPro_400Regular", fontSize: 12 }}>
                €{repaymentPaid.toFixed(0)} paid of €{repaymentTarget}.
              </Text>
              <View style={{ marginTop: 8, height: 8, borderRadius: 999, backgroundColor: "#f0edea" }}>
                <View style={{ width: `${repaymentPct}%` as `${number}%`, height: 8, borderRadius: 999, backgroundColor: "#00694c" }} />
              </View>
            </View>
          </>
        )}

        {showMeterReadPrompt && (
          <Pressable onPress={onSupport} style={{ marginTop: 12, borderRadius: 18, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "rgba(188,202,193,0.35)", padding: 14 }}>
            <Text style={{ color: "#93000a", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase" }}>Action Required</Text>
            <Text style={{ marginTop: 6, color: "#1c1c1a", fontFamily: "PlusJakartaSans_600SemiBold", fontSize: 22 }}>Meter read due</Text>
            <Text style={{ marginTop: 4, color: "#3d4943", fontFamily: "BeVietnamPro_400Regular", fontSize: 12 }}>Submit your latest reading to keep estimates accurate.</Text>
          </Pressable>
        )}

        <AiAnalystCard
          brand="solas"
          enabled={Boolean(featureFlags.aiAnalystCard)}
          customer={customer}
          region={region}
          payments={payments}
          featureFlags={featureFlags}
        />

        <Pressable onPress={onTopUp} style={{ marginTop: 14, borderRadius: 999, backgroundColor: "#00694c", height: 52, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#ffffff", fontFamily: "PlusJakartaSans_700Bold", fontSize: 15 }}>Quick Top-up</Text>
        </Pressable>

        <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
          <Pressable onPress={onPayments} style={{ flex: 1, borderRadius: 14, backgroundColor: "#f6f3f0", borderWidth: 1, borderColor: "rgba(188,202,193,0.35)", paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ color: "#1c1c1a", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 12, letterSpacing: 0.4 }}>View Payments</Text>
          </Pressable>
          <Pressable onPress={onAccount} style={{ flex: 1, borderRadius: 14, backgroundColor: "#f6f3f0", borderWidth: 1, borderColor: "rgba(188,202,193,0.35)", paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ color: "#1c1c1a", fontFamily: "BeVietnamPro_600SemiBold", fontSize: 12, letterSpacing: 0.4 }}>Account</Text>
          </Pressable>
        </View>
      </ScrollView>

        <View style={{ position: "absolute", left: 12, right: 12, bottom: 8, borderRadius: 32, backgroundColor: "rgba(252,249,246,0.9)", borderTopWidth: 1, borderTopColor: "rgba(188,202,193,0.2)", shadowColor: "rgba(29,158,117,0.05)", shadowOpacity: 1, shadowRadius: 40, shadowOffset: { width: 0, height: -4 }, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 8, paddingVertical: 10 }}>
          {["Home", "Payments", "Account", "Support"].map((label, i) => (
            <Pressable
              key={label}
              onPress={i === 0 ? undefined : i === 1 ? onPayments : i === 2 ? onAccount : onSupport}
              style={{ flex: 1, alignItems: "center", gap: 2, paddingHorizontal: 4, paddingVertical: 5, borderRadius: 999, backgroundColor: i === 0 ? "#d2e6c5" : "transparent" }}
            >
              <Text style={{ color: i === 0 ? "#1D9E75" : "#56674e", fontSize: 13 }}>{i === 0 ? "⌂" : i === 1 ? "₠" : i === 2 ? "◉" : "?"}</Text>
              <Text numberOfLines={1} style={{ color: i === 0 ? "#1D9E75" : "#56674e", fontFamily: "BeVietnamPro_500Medium", fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</Text>
            </Pressable>
          ))}
        </View>
    </View>
  );
}

function PulseDashboard({
  customer,
  region,
  featureFlags,
  payments,
  onTopUp,
  onPayments,
  onSupport,
  onAccount,
  onHome,
  onConfig,
}: {
  customer: CustomerProfile;
  region: RegionConfig;
  featureFlags: Record<string, boolean>;
  payments: PaymentItem[];
  onTopUp: () => void;
  onPayments: () => void;
  onSupport: () => void;
  onAccount: () => void;
  onHome: () => void;
  onConfig: () => void;
}) {
  const t = TOKENS.pulse;
  return (
    <View style={{ flex: 1, backgroundColor: "#10141a" }}>
      <View style={{ position: "absolute", top: 8, left: 0, right: 0, zIndex: 40, paddingHorizontal: 20, height: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Pressable onPress={onHome}><Text style={{ color: "#dfe2eb", fontFamily: "SpaceGrotesk_700Bold", fontSize: 16 }}>Home</Text></Pressable>
        <Pressable onPress={onConfig}><Text style={{ color: "#dfe2eb", fontFamily: "SpaceGrotesk_700Bold", fontSize: 16 }}>Config</Text></Pressable>
      </View>
      <View style={{ position: "absolute", top: 34, left: 0, right: 0, zIndex: 30, paddingHorizontal: 20, height: 58, backgroundColor: "rgba(2,6,23,0.6)", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ color: "#818cf8", fontSize: 18 }}>☰</Text>
          <Text style={{ color: "#818cf8", fontFamily: "SpaceGrotesk_700Bold", fontSize: 29, letterSpacing: -1, textTransform: "uppercase" }}>PULSE</Text>
        </View>
        <Text style={{ color: "#818cf8", fontSize: 16 }}>⌁</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 110, paddingBottom: 112 }}>
        <Text style={{ color: "#00dddd", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 2.4, textTransform: "uppercase" }}>System Status: Active</Text>
        <Text style={{ marginTop: 6, color: "#dfe2eb", fontFamily: "SpaceGrotesk_700Bold", fontSize: 55, lineHeight: 56 }}>Pulse Home{"\n"}Dashboard</Text>
        <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <Text style={{ color: "#94a3b8", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" }}>Grid Load</Text>
            <Text style={{ color: "#00dddd", fontFamily: "SpaceGrotesk_700Bold", fontSize: 34 }}>4.2 kW</Text>
          </View>
          <View style={{ width: 1, backgroundColor: "rgba(71,69,83,0.4)" }} />
          <View>
            <Text style={{ color: "#94a3b8", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" }}>Region</Text>
            <Text style={{ color: "#c5c0ff", fontFamily: "SpaceGrotesk_700Bold", fontSize: 34 }}>USA-NE</Text>
          </View>
        </View>

        <View style={{ marginTop: 14, borderRadius: 8, backgroundColor: "#1c2026", padding: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View>
              <Text style={{ color: "#dfe2eb", fontFamily: "SpaceGrotesk_700Bold", fontSize: 30, textTransform: "uppercase" }}>Energy Distribution</Text>
              <Text style={{ color: "#94a3b8", fontFamily: "Inter_400Regular", fontSize: 12 }}>Real-time telemetry across home nodes</Text>
            </View>
            <View style={{ borderRadius: 999, backgroundColor: "rgba(0,101,101,0.3)", paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: "#00dddd", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase" }}>LIVE FEED</Text>
            </View>
          </View>
          <View style={{ marginTop: 12, alignItems: "center", gap: 12 }}>
            <Text style={{ color: "#00dddd", fontFamily: "SpaceGrotesk_700Bold", fontSize: 18 }}>Solar Array +3.8 kW</Text>
            <View style={{ width: 86, height: 86, borderRadius: 10, backgroundColor: "#534ab7", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#d1ccff", fontSize: 32 }}>✸</Text>
            </View>
            <Text style={{ color: "#9ca3af", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>PULSE CORE</Text>
            <Text style={{ color: "#818cf8", fontFamily: "SpaceGrotesk_700Bold", fontSize: 18 }}>Storage 94%</Text>
          </View>
        </View>

        <AiAnalystCard
          brand="pulse"
          enabled={Boolean(featureFlags.aiAnalystCard)}
          customer={customer}
          region={region}
          payments={payments}
          featureFlags={featureFlags}
        />

        <View style={{ marginTop: 14, borderRadius: 8, backgroundColor: "#262a31", padding: 14 }}>
          <Text style={{ color: "#dfe2eb", fontFamily: "SpaceGrotesk_700Bold", fontSize: 30, textTransform: "uppercase" }}>EV Charging</Text>
          <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: "#94a3b8", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, textTransform: "uppercase" }}>Model 3 (Garage)</Text>
            <Text style={{ color: "#c5c0ff", fontFamily: "SpaceGrotesk_700Bold", fontSize: 22 }}>82%</Text>
          </View>
          <View style={{ marginTop: 6, height: 8, borderRadius: 999, backgroundColor: "#31353c" }}>
            <View style={{ width: "82%", height: 8, borderRadius: 999, backgroundColor: "#c5c0ff" }} />
          </View>
          <View style={{ marginTop: 10, gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: "#64748b", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, textTransform: "uppercase" }}>Status</Text><Text style={{ color: "#00dddd", fontFamily: "Inter_500Medium", fontSize: 13 }}>Supercharging</Text></View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: "#64748b", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, textTransform: "uppercase" }}>Time Left</Text><Text style={{ color: "#dfe2eb", fontFamily: "Inter_500Medium", fontSize: 13 }}>18 min</Text></View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: "#64748b", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, textTransform: "uppercase" }}>Power Rate</Text><Text style={{ color: "#dfe2eb", fontFamily: "Inter_500Medium", fontSize: 13 }}>11.5 kW</Text></View>
          </View>
          <Pressable onPress={onTopUp} style={{ marginTop: 12, borderRadius: 4, backgroundColor: "#534ab7", height: 46, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#d1ccff", fontFamily: "SpaceGrotesk_700Bold", fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase" }}>Optimize Schedule</Text>
          </Pressable>
        </View>

        <View style={{ marginTop: 14, gap: 10 }}>
          {[
            { title: "HVAC SYSTEM", value: "2.4", unit: "kW", note: "22% above baseline", tone: "#00dddd", width: "60%" },
            { title: "APPLIANCES", value: "0.8", unit: "kW", note: "Optimal efficiency", tone: "#c5c0ff", width: "25%" },
            { title: "LIGHTING", value: "0.3", unit: "kW", note: "12 nodes active", tone: "#c3c6cf", width: "12%" },
          ].map((item) => (
            <View key={item.title} style={{ borderRadius: 8, backgroundColor: "#181c22", padding: 12 }}>
              <Text style={{ color: "#dfe2eb", fontFamily: "SpaceGrotesk_700Bold", fontSize: 14, textTransform: "uppercase" }}>{item.title}</Text>
              <Text style={{ marginTop: 6, color: "#dfe2eb", fontFamily: "SpaceGrotesk_700Bold", fontSize: 42 }}>
                {item.value} <Text style={{ color: "#64748b", fontSize: 14, fontFamily: "Inter_400Regular" }}>{item.unit}</Text>
              </Text>
              <View style={{ marginTop: 6, height: 4, borderRadius: 999, backgroundColor: "#31353c" }}>
                <View style={{ width: item.width as `${number}%`, height: 4, borderRadius: 999, backgroundColor: item.tone }} />
              </View>
              <Text style={{ marginTop: 6, color: "#94a3b8", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase" }}>{item.note}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 14, borderRadius: 8, backgroundColor: "rgba(49,53,60,0.6)", padding: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: "#10141a", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#00dddd", fontSize: 24 }}>☁</Text>
            </View>
            <View>
              <Text style={{ color: "#94a3b8", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase" }}>Weather</Text>
              <Text style={{ color: "#dfe2eb", fontFamily: "SpaceGrotesk_700Bold", fontSize: 36 }}>72°F</Text>
              <Text style={{ color: "#00dddd", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase" }}>Ideal Solar Yield</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <Pressable onPress={onSupport} style={{ position: "absolute", right: 20, bottom: 92, width: 54, height: 54, borderRadius: 6, backgroundColor: "#534ab7", alignItems: "center", justifyContent: "center", shadowColor: "rgba(83,74,183,0.4)", shadowOpacity: 1, shadowRadius: 20, shadowOffset: { width: 0, height: 0 } }}>
        <Text style={{ color: "#d1ccff", fontSize: 28 }}>＋</Text>
      </Pressable>

      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(2,6,23,0.8)", paddingHorizontal: 12, paddingTop: 8, paddingBottom: 18, flexDirection: "row", justifyContent: "space-between" }}>
        {["DASHBOARD", "METRICS", "ALERTS", "SYSTEM"].map((label, i) => (
          <Pressable key={label} onPress={i === 1 ? onPayments : i === 2 ? onSupport : i === 3 ? onAccount : undefined} style={{ alignItems: "center", gap: 2, borderRadius: 4, paddingHorizontal: i === 0 ? 10 : 8, paddingVertical: i === 0 ? 6 : 4, backgroundColor: i === 0 ? "rgba(67,56,202,0.3)" : "transparent" }}>
            <Text style={{ color: i === 0 ? "#22d3ee" : "#64748b", fontSize: 12 }}>{i === 0 ? "◫" : i === 1 ? "⌁" : i === 2 ? "◉" : "⚙"}</Text>
            <Text style={{ color: i === 0 ? "#22d3ee" : "#64748b", fontFamily: "SpaceGrotesk_700Bold", fontSize: 10, letterSpacing: 1.5 }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function getCurrencySymbol(currency?: string) {
  const c = String(currency || "").toUpperCase();
  if (c.includes("GBP")) return "£";
  if (c.includes("EUR")) return "€";
  if (c.includes("USD")) return "$";
  return "";
}

function daysSinceISO(dateStr?: string) {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 999;
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

function deriveConfidence(context: any): "high" | "medium" | "low" {
  let score = 100;
  if (context?.customer?.account?.meterType === "non-smart") score -= 40;
  if (String(context?.customer?.account?.daysRemainingBasis || "").includes("low-confidence")) score -= 20;
  if (daysSinceISO(context?.latestReadingDate) > 30) score -= 20;
  if ((context?.topUpFrequency ?? 0) < 2) score -= 10;
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function buildCustomerContext(customer: CustomerProfile, region: RegionConfig, payments: PaymentItem[], featureFlags: Record<string, boolean>) {
  const topups = payments.filter((p) => Number(p.amount) > 0);
  const now = new Date();
  const lastTopUp = topups[0] ?? null;
  const last30 = topups.filter((p) => daysSinceISO(p.date) <= 30);
  const last90Count = topups.filter((p) => daysSinceISO(p.date) <= 90).length;
  const balance = Number(customer.account?.balance ?? 0);
  const accountDaysRemaining = Number(customer.account?.daysRemaining ?? 0);
  const historicalBurnRate = last30.length ? last30.reduce((s, p) => s + Number(p.amount || 0), 0) / 30 : null;
  const coherenceBurnRate =
    accountDaysRemaining > 0 && balance > 0 ? Number((balance / accountDaysRemaining).toFixed(2)) : null;

  // Prefer coherence with visible dashboard fields: balance + days remaining.
  const burnRate = coherenceBurnRate ?? (historicalBurnRate ? Number(historicalBurnRate.toFixed(2)) : null);
  const normalizedDaysRemaining =
    accountDaysRemaining > 0 ? Math.max(1, Math.round(accountDaysRemaining)) : burnRate ? Math.max(1, Math.floor(balance / burnRate)) : null;

  return {
    nowISO: now.toISOString(),
    region: region.id,
    currency: getCurrencySymbol(region.currency),
    customer: {
      name: customer.name,
      account: {
        balance: balance || null,
        daysRemaining: normalizedDaysRemaining,
        daysRemainingBasis: customer.account?.daysRemainingBasis ?? (customer.account?.meterType === "non-smart" ? "estimated-from-reads" : "smart-actual"),
        tariff: customer.account?.tariff ?? "standard",
        meterType: customer.account?.meterType ?? (region.smartMeterAvailability ? "smart" : "non-smart"),
      },
    },
    derivedBurnRate: burnRate,
    usageVariance: null,
    lastTopUp: lastTopUp ? { amount: lastTopUp.amount, date: lastTopUp.date } : null,
    topUpFrequency: last90Count,
    latestReadingDate: lastTopUp?.date ?? null,
    touPricing: Boolean(featureFlags.touPricing),
    confidence: deriveConfidence({
      customer,
      topUpFrequency: last90Count,
      latestReadingDate: lastTopUp?.date,
    }),
  };
}

function AiAnalystCard({
  brand,
  enabled,
  customer,
  region,
  payments,
  featureFlags,
}: {
  brand: Brand;
  enabled: boolean;
  customer: CustomerProfile;
  region: RegionConfig;
  payments: PaymentItem[];
  featureFlags: Record<string, boolean>;
}) {
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [insight, setInsight] = useState("");
  const [confidenceLevel, setConfidenceLevel] = useState<"high" | "medium" | "low">("medium");
  const [caveat, setCaveat] = useState<string | null>(null);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  const context = useMemo(() => buildCustomerContext(customer, region, payments, featureFlags), [customer, region, payments, featureFlags]);
  const cardKey = `${customer.id}:${enabled ? "on" : "off"}`;

  useEffect(() => {
    setHidden(false);
    setInsight("");
    setSuggestedQuestions([]);
    setHistory([]);
    setCaveat(null);
  }, [cardKey]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!enabled || hidden) return;
      setLoading(true);
      try {
        const call = httpsCallable(functions, "aiAnalyst");
        const response: any = await call({ mode: "insight", context });
        if (cancelled) return;
        const data = response?.data || {};
        if (!data?.insight) {
          setInsight("AI analyst is enabled, but no insight is available yet. Please try again in a moment.");
          setConfidenceLevel("low");
          setCaveat("Live insight service returned no content.");
          setSuggestedQuestions(["How long will my balance last?", "Should I top up today?", "Show me a safer top-up amount."]);
          setHistory([{ role: "assistant", content: "AI analyst is enabled, but no insight is available yet. Please try again in a moment." }]);
          return;
        }
        setInsight(String(data.insight));
        setConfidenceLevel((data.confidenceLevel || "medium") as "high" | "medium" | "low");
        setCaveat(data.caveat ? String(data.caveat) : null);
        setSuggestedQuestions(Array.isArray(data.suggestedQuestions) ? data.suggestedQuestions.slice(0, 3) : []);
        setHistory([{ role: "assistant", content: String(data.insight) }]);
      } catch (e: any) {
        const raw = String(e?.message || "");
        const code = String(e?.code || "");
        const isQuota = code.includes("resource-exhausted") || raw.toLowerCase().includes("daily ai limit reached");
        const msg =
          isQuota
            ? "Daily AI limit reached (100 calls). Try again tomorrow."
            : raw.includes("not-found")
              ? "AI analyst backend is not deployed in this environment yet."
              : "AI analyst is temporarily unavailable.";
        setInsight(msg);
        setConfidenceLevel("low");
        setCaveat("Showing fallback guidance while live insight is unavailable.");
        setSuggestedQuestions(["How long will my balance last?", "What top-up amount is safest this week?"]);
        setHistory([{ role: "assistant", content: msg }]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [cardKey]);

  if (!enabled || hidden) return null;

  const tone = brand === "pulse"
    ? { surface: "#1c2026", text: "#dfe2eb", muted: "#8ba1c6", accent: "#22d3ee", border: "rgba(197,192,255,0.2)" }
    : brand === "solas"
      ? { surface: "#f6f3f0", text: "#1c1c1a", muted: "#3d4943", accent: "#00694c", border: "rgba(0,105,76,0.16)" }
      : { surface: "#ffffff", text: "#1c1c19", muted: "#524436", accent: "#855000", border: "rgba(133,80,0,0.15)" };

  const askFollowup = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || asking) return;
    setAsking(true);
    try {
      const call = httpsCallable(functions, "aiAnalyst");
      const response: any = await call({ mode: "followup", context, history, question: trimmed });
      const answer = String(response?.data?.answer || "").trim();
      if (!answer) return;
      setHistory((prev) => [...prev, { role: "user", content: trimmed }, { role: "assistant", content: answer }]);
      setQuestion("");
    } catch {
      // Silent failure by design for this card.
    } finally {
      setAsking(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setExpanded(true)}
        style={{
          marginTop: 14,
          borderRadius: 14,
          backgroundColor: tone.surface,
          borderWidth: 1,
          borderColor: tone.border,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: tone.muted, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase" }}>✦ Your energy analyst</Text>
        {loading ? (
          <>
            <View style={{ marginTop: 10, height: 13, borderRadius: 8, backgroundColor: "rgba(148,163,184,0.25)" }} />
            <View style={{ marginTop: 8, height: 13, borderRadius: 8, width: "85%", backgroundColor: "rgba(148,163,184,0.2)" }} />
          </>
        ) : (
          <>
            <Text numberOfLines={3} style={{ marginTop: 8, color: tone.text, fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 24 }}>
              {insight}
            </Text>
            {caveat || confidenceLevel !== "high" ? (
              <Text style={{ marginTop: 6, color: tone.muted, fontFamily: "Inter_500Medium", fontSize: 11 }}>
                {caveat || "Based on limited confidence data."}
              </Text>
            ) : null}
            <Text style={{ marginTop: 8, color: tone.accent, fontFamily: "Inter_700Bold", fontSize: 13 }}>Ask a follow-up →</Text>
          </>
        )}
      </Pressable>

      {expanded ? (
        <Modal
          visible={expanded}
          transparent
          animationType="slide"
          onRequestClose={() => setExpanded(false)}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
          <View style={{ maxHeight: "84%", borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: tone.surface, padding: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: tone.text, fontFamily: "Inter_700Bold", fontSize: 17 }}>✦ Your energy analyst</Text>
              <Pressable onPress={() => setExpanded(false)}><Text style={{ color: tone.muted, fontSize: 28 }}>×</Text></Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 10, gap: 10 }}>
              {history.map((m, idx) => (
                <View key={`${m.role}-${idx}`} style={{ borderRadius: 10, backgroundColor: m.role === "assistant" ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.2)", padding: 10 }}>
                  <Text style={{ color: tone.text, fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21 }}>{m.content}</Text>
                </View>
              ))}

              {suggestedQuestions.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {suggestedQuestions.map((q) => (
                    <Pressable key={q} onPress={() => askFollowup(q)} style={{ borderRadius: 999, borderWidth: 1, borderColor: tone.border, paddingHorizontal: 12, paddingVertical: 8 }}>
                      <Text style={{ color: tone.accent, fontFamily: "Inter_500Medium", fontSize: 12 }}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </ScrollView>

            <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
              <TextInput
                value={question}
                onChangeText={setQuestion}
                placeholder="Type your own question..."
                placeholderTextColor={tone.muted}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: tone.border,
                  color: tone.text,
                  paddingHorizontal: 12,
                  fontFamily: "Inter_400Regular",
                }}
              />
              <Pressable onPress={() => askFollowup(question)} style={{ height: 44, borderRadius: 10, backgroundColor: tone.accent, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", opacity: asking ? 0.7 : 1 }}>
                <Text style={{ color: brand === "pulse" ? "#03111a" : "#ffffff", fontFamily: "Inter_700Bold", fontSize: 12 }}>{asking ? "..." : "Ask"}</Text>
              </Pressable>
            </View>
          </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

function SubScreen({
  brand,
  title,
  subtitle,
  onBack,
  onHome,
  onConfig,
  onDashboard,
  onPayments,
  onSupport,
  onAccount,
  children,
}: {
  brand: Brand;
  title: string;
  subtitle: string;
  onBack: () => void;
  onHome: () => void;
  onConfig: () => void;
  onDashboard: () => void;
  onPayments: () => void;
  onSupport: () => void;
  onAccount: () => void;
  children: React.ReactNode;
}) {
  const b = brand === "shell" ? "ember" : brand;
  return (
    <View style={{ flex: 1 }}>
      <InnerHeader brand={brand} title={title} subtitle={subtitle} onHome={onHome} onConfig={onConfig} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 130 }}>{children}</ScrollView>
      <BottomNav brand={b} showFab={false} onDashboard={onDashboard} onPayments={onPayments} onSupport={onSupport} onAccount={onAccount} />
    </View>
  );
}

function ConfigPanelScreen({
  balance,
  onBalance,
  aiAnalystCard,
  autoTopUp,
  lowBalanceSms,
  aiScope,
  onScopeChange,
  scopeRegionId,
  scopeSegmentId,
  onToggleAiAnalystCard,
  onToggleAutoTopUp,
  onToggleLowBalanceSms,
  contextReady,
  onApply,
  onReset,
  onClose,
  children,
}: {
  balance: number;
  onBalance: (v: number) => void;
  aiAnalystCard: boolean;
  autoTopUp: boolean;
  lowBalanceSms: boolean;
  aiScope: ConfigScope;
  onScopeChange: (scope: ConfigScope) => void;
  scopeRegionId: string | null;
  scopeSegmentId: string | null;
  onToggleAiAnalystCard: (v: boolean) => void;
  onToggleAutoTopUp: (v: boolean) => void;
  onToggleLowBalanceSms: (v: boolean) => void;
  contextReady: boolean;
  onApply: () => void;
  onReset: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = TOKENS.ember;
  const state = balance < 25 ? "CRITICAL" : balance < 50 ? "LOW" : balance < 75 ? "STABLE" : "HIGH";
  const Toggle = ({ label, subLabel, on, onToggle }: { label: string; subLabel?: string; on: boolean; onToggle?: () => void }) => (
    <Pressable
      onPress={onToggle}
      disabled={!onToggle}
      style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, opacity: onToggle ? 1 : 0.8 }}
    >
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={{ color: t.text, fontFamily: "Inter_500Medium", fontSize: 15 }}>{label}</Text>
        {subLabel ? <Text style={{ marginTop: 2, color: t.muted, fontFamily: "Inter_400Regular", fontSize: 11 }}>{subLabel}</Text> : null}
      </View>
      <View style={{ width: 42, height: 24, borderRadius: 999, backgroundColor: on ? "#a76500" : "#eae1d7", justifyContent: "center", paddingHorizontal: 3, alignItems: on ? "flex-end" : "flex-start" }}>
        <View style={{ width: 18, height: 18, borderRadius: 999, backgroundColor: on ? "#fff" : "#b8aca0" }} />
      </View>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, backgroundColor: "rgba(31,27,21,0.18)", justifyContent: "flex-end" }}>
      <Pressable style={{ ...StyleSheet.absoluteFillObject }} onPress={onClose} />
      <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 20, paddingTop: 8, maxHeight: "92%", overflow: "hidden" }}>
        <View style={{ alignItems: "center", marginBottom: 8 }}><View style={{ width: 50, height: 6, borderRadius: 999, backgroundColor: "#eae1d7" }} /></View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ color: t.primary, fontFamily: "Inter_700Bold", fontSize: 36 }}>Demo Config Panel</Text>
            <Text style={{ color: t.muted, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 2 }}>SCREEN ID: S-04</Text>
          </View>
          <Pressable onPress={onClose} style={{ borderRadius: 999, backgroundColor: "#f6ece2", paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ color: t.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.8 }}>BACK</Text>
          </Pressable>
        </View>
        <ScrollView style={{ marginTop: 20 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
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
        <View style={{ marginTop: 16, flexDirection: "row", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.configGroupTitle}>PAYMENT MODELS</Text>
            <Toggle label="Prepayment" on />
            <Toggle label="Direct Debit" on={false} />
            <Text style={[styles.configGroupTitle, { marginTop: 8 }]}>SMART</Text>
            <Toggle
              label="Auto Top-up"
              on={autoTopUp}
              onToggle={contextReady ? () => onToggleAutoTopUp(!autoTopUp) : undefined}
            />
            <Toggle
              label="AI Energy Analyst"
              subLabel="Proactive insight card on dashboard"
              on={aiAnalystCard}
              onToggle={contextReady ? () => onToggleAiAnalystCard(!aiAnalystCard) : undefined}
            />
            <View style={{ marginTop: 6 }}>
              <Text style={styles.configGroupTitle}>AI SCOPE</Text>
              <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={contextReady ? () => onScopeChange("segment") : undefined}
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    backgroundColor: aiScope === "segment" ? "#a76500" : "#f6ece2",
                    opacity: contextReady ? 1 : 0.5,
                  }}
                >
                  <Text style={{ color: aiScope === "segment" ? "#fff" : "#524436", fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.8 }}>
                    SEGMENT ({scopeSegmentId ?? "n/a"})
                  </Text>
                </Pressable>
                <Pressable
                  onPress={contextReady ? () => onScopeChange("region") : undefined}
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    backgroundColor: aiScope === "region" ? "#a76500" : "#f6ece2",
                    opacity: contextReady ? 1 : 0.5,
                  }}
                >
                  <Text style={{ color: aiScope === "region" ? "#fff" : "#524436", fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.8 }}>
                    REGION ({scopeRegionId ?? "n/a"})
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.configGroupTitle}>ALERTS</Text>
            <Toggle
              label="Low Balance SMS"
              on={lowBalanceSms}
              onToggle={contextReady ? () => onToggleLowBalanceSms(!lowBalanceSms) : undefined}
            />
            <Toggle label="Push Notifications" on={false} />
            <Text style={[styles.configGroupTitle, { marginTop: 8 }]}>ECOSYSTEM</Text>
            <Toggle label="Solar Integration" on={false} />
          </View>
        </View>
        {children}
        {!contextReady ? (
          <Text style={{ marginTop: 10, color: "#857464", fontFamily: "Inter_500Medium", fontSize: 12 }}>
            Select a region and customer first. This panel applies to active customer context.
          </Text>
        ) : null}
        <View style={{ marginTop: 14, flexDirection: "row", gap: 10 }}>
          <View style={{ opacity: contextReady ? 1 : 0.45, flex: 1 }}>
            <PrimaryButton brand="ember" label="Apply Changes" onPress={contextReady ? onApply : () => {}} />
          </View>
          <Pressable onPress={contextReady ? onReset : () => {}} style={{ opacity: contextReady ? 1 : 0.45, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#f6ece2", paddingHorizontal: 18 }}>
            <Text style={{ color: t.text, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1.2 }}>RESET</Text>
          </Pressable>
        </View>
        </ScrollView>
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

function BottomNav({
  brand,
  showFab = true,
  onDashboard,
  onPayments,
  onSupport,
  onAccount,
}: {
  brand: Brand;
  showFab?: boolean;
  onDashboard?: () => void;
  onPayments?: () => void;
  onSupport?: () => void;
  onAccount?: () => void;
}) {
  const isPulse = brand === "pulse";
  const bg = isPulse ? "rgba(2,6,23,0.95)" : brand === "solas" ? "#e9f1e4" : "#efe9e0";
  const active = isPulse ? TOKENS.pulse.accent : brand === "solas" ? TOKENS.solas.primary : TOKENS.ember.primary;
  const muted = isPulse ? TOKENS.pulse.muted : "#98a29c";
  const labels = brand === "solas"
    ? ["HOME", "PAYMENTS", "ACCOUNT", "SUPPORT"]
    : brand === "ember"
      ? ["HOME", "PAYMENTS", "ACCOUNT", "SUPPORT"]
      : ["DASHBOARD", "METRICS", "ALERTS", "SYSTEM"];
  return (
    <>
      {brand === "ember" && showFab && (
        <View style={{ position: "absolute", right: 24, bottom: 90, width: 64, height: 64, borderRadius: 16, backgroundColor: TOKENS.ember.primary, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold" }}>⚡</Text>
        </View>
      )}
      <View style={{ position: "absolute", bottom: 10, left: 16, right: 16, backgroundColor: bg, borderRadius: brand === "pulse" ? 6 : 999, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10, paddingVertical: 12, minHeight: 56, alignItems: "center" }}>
        {labels.map((label, i) => (
          <Pressable
            key={label}
            onPress={
              brand === "solas" || brand === "ember"
                ? i === 0
                  ? onDashboard
                  : i === 1
                    ? onPayments
                    : i === 2
                      ? onAccount
                      : onSupport
                : i === 0
                  ? onDashboard
                  : i === 1
                    ? onPayments
                    : i === 2
                      ? onSupport
                      : onAccount
            }
            style={{ flex: 1, alignItems: "center", paddingHorizontal: 4, paddingVertical: 2 }}
          >
            <Text numberOfLines={1} style={{ color: i === 0 ? active : muted, fontSize: 10, letterSpacing: 1.2, fontFamily: i === 0 ? "Inter_700Bold" : "Inter_500Medium", textAlign: "center" }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </>
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
  lowWarn: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 122,
    backgroundColor: "#ffdad6",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 80,
  },
  lowWarnText: { color: "#ba1a1a", fontFamily: "Inter_700Bold", fontSize: 13 },

  shellRoot: { flex: 1, backgroundColor: "#f7f9fb" },
  shellTop: { marginHorizontal: 16, marginTop: 14, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  shellMenu: { fontSize: 18, color: "#2a3439" },
  shellLogo: { flex: 1, fontFamily: "Inter_700Bold", color: "#111827", fontSize: 24, letterSpacing: -0.5 },
  shellAvatar: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#e7dcc8" },
  shellBody: { paddingHorizontal: 18, paddingBottom: 120, gap: 16 },
  shellDisplay: { color: "#2b3a46", fontFamily: "Inter_800ExtraBold", fontSize: 60, letterSpacing: -1.2, lineHeight: 64 },
  shellLead: { color: "#58636d", fontFamily: "Inter_400Regular", fontSize: 17, lineHeight: 26, maxWidth: 350 },
  shellCard: {
    backgroundColor: "#ffffff",
    borderColor: "rgba(0,0,0,0.04)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    shadowColor: "rgba(0,0,0,0.05)",
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
  },
  shellCardFeatured: { minHeight: 330, justifyContent: "space-between" },
  shellCardIreland: { backgroundColor: "#d9e4ea" },
  shellTag: { alignSelf: "flex-start", backgroundColor: "#eef2f6", color: "#5f6d78", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontSize: 10, letterSpacing: 1.1, fontFamily: "Inter_500Medium" },
  shellCardTitle: { marginTop: 10, color: "#1f2f3c", fontFamily: "Inter_700Bold", fontSize: 42, lineHeight: 44, letterSpacing: -0.8 },
  shellCardBody: { marginTop: 8, color: "#4e5d69", fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 28 },
  shellCardRow: { marginTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  shellCurrency: { color: "#1f2f3c", fontFamily: "Inter_700Bold", fontSize: 24, lineHeight: 28 },
  shellSelectBtn: { backgroundColor: "#51657f", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12 },
  shellSelectTxt: { color: "white", fontFamily: "Inter_700Bold", fontSize: 14 },
  shellSelectHint: { color: "#51657f", fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 0.3, opacity: 0.7 },
  shellIconWrap: { width: 58, height: 58, borderRadius: 10, backgroundColor: "#e8eff3", alignItems: "center", justifyContent: "center" },
  shellIconWrapFeatured: { width: 58, height: 58, backgroundColor: "#dbe5ee" },
  shellIcon: { color: "#5d6d83", fontSize: 24 },
  shellCapabilityWrap: { marginTop: 30, gap: 26, paddingTop: 24, borderTopWidth: 1, borderTopColor: "rgba(169,180,185,0.2)" },
  shellCapabilityBlock: { paddingVertical: 6 },
  shellCapabilityTitle: { color: "#5f6d78", fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.2 },
  shellCapabilityBody: { marginTop: 8, color: "#2a3439", fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 31 },
  shellNav: { position: "absolute", left: 14, right: 14, bottom: 8, borderRadius: 12, backgroundColor: "rgba(248,250,252,0.95)", paddingHorizontal: 10, paddingVertical: 9, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "rgba(169,180,185,0.2)" },
  shellNavMuted: { color: "#9aa6b8", fontFamily: "Inter_500Medium", fontSize: 9, letterSpacing: 1, paddingHorizontal: 6, paddingVertical: 6 },
  shellNavActiveWrap: { backgroundColor: "rgba(226,232,240,0.8)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  shellNavActive: { color: "#0f172a", fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 },
  configScaleLabel: { color: TOKENS.ember.muted, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.2 },
  configGroupTitle: { color: TOKENS.ember.muted, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.2 },
  disclaimerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  disclaimerCard: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    backgroundColor: "#fff8f3",
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 12,
  },
  disclaimerTitle: {
    color: "#1f1b15",
    fontFamily: "Newsreader_500Medium",
    fontSize: 36,
    lineHeight: 42,
  },
  disclaimerBody: {
    color: "#1f1b15",
    fontFamily: "Inter_400Regular",
    fontSize: 18,
    lineHeight: 30,
  },
  disclaimerDivider: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: "rgba(133,116,100,0.3)",
  },
  disclaimerAttribution: {
    color: "#1f1b15",
    fontFamily: "Inter_500Medium",
    fontSize: 18,
    lineHeight: 26,
    marginTop: 2,
  },
  disclaimerButton: {
    marginTop: 8,
    alignSelf: "flex-end",
    borderRadius: 10,
    backgroundColor: "#855000",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  disclaimerButtonText: {
    color: "#ffffff",
    fontFamily: "Inter_700Bold",
    fontSize: 17,
  },
});
