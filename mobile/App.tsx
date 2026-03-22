import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";

import { db, firebaseAuth, functions } from "./src/config/firebase";
import { regionTheme, type DesignTheme } from "./src/theme";
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

  const theme = useMemo(() => regionTheme(selectedRegion?.id), [selectedRegion?.id]);

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
    if (!selectedRegion) return;
    const regionId = selectedRegion.id;

    let mounted = true;
    async function loadCustomers() {
      const q = query(collection(db, "customers"), where("region", "==", regionId));
      const snap = await getDocs(q);
      if (!mounted) return;
      setCustomers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CustomerProfile, "id">) })));
      setRoute("customer");
    }

    loadCustomers().catch((err) => setError(err instanceof Error ? err.message : "Customer fetch failed"));
    return () => {
      mounted = false;
    };
  }, [selectedRegion]);

  useEffect(() => {
    if (!selectedCustomer || !selectedRegion) return;

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
    if (!selectedRegion || !selectedCustomer) return null;
    return resolveConfig(selectedRegion, segmentConfig, selectedCustomer);
  }, [selectedRegion, selectedCustomer, segmentConfig]);

  function goToCustomer() {
    setSelectedCustomer(null);
    setSegmentConfig(null);
    setPayments([]);
    setRoute("customer");
  }

  function goToRegion() {
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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Top-up failed");
    }
  }

  return (
    <SafeAreaProvider>
      {loading ? (
        <ScreenFrame theme={theme}>
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={[styles.headline, { color: theme.colors.onSurface, fontFamily: theme.type.headline }]}>Preparing PAYGO</Text>
          </View>
        </ScreenFrame>
      ) : error ? (
        <ScreenFrame theme={theme}>
          <View style={styles.center}>
            <View style={[styles.errorBlock, { backgroundColor: theme.colors.errorContainer }]}> 
              <Text style={[styles.body, { color: theme.colors.error, fontFamily: theme.type.body }]}>{error}</Text>
            </View>
            <GradientButton label="Dismiss" theme={theme} onPress={() => setError(null)} />
          </View>
        </ScreenFrame>
      ) : route === "region" ? (
        <ScreenFrame theme={theme}>
          <GlassHeader theme={theme} title="PAYGO" subtitle="Select Market" />
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={[styles.offsetBody, { color: theme.colors.onSurfaceMuted, fontFamily: theme.type.body }]}>Pick a market to retheme the shell and activate persona-aware capabilities.</Text>
            {regions.map((item) => {
              const itemTheme = regionTheme(item.id);
              return (
                <Pressable key={item.id} onPress={() => setSelectedRegion(item)} style={styles.cardPressable}>
                  <View style={[styles.surfaceLow, { backgroundColor: itemTheme.colors.surfaceLow }]}> 
                    <View style={[styles.surfaceHigh, { backgroundColor: itemTheme.colors.surfaceHigh }]}> 
                      <View style={styles.rowBetween}>
                        <Chip theme={itemTheme} label={`${item.id} Market`} />
                        <Text style={[styles.label, { color: itemTheme.colors.onSurfaceMuted, fontFamily: theme.type.label }]}>{item.currency}</Text>
                      </View>
                      <Text style={[styles.title, { color: itemTheme.colors.onSurface, fontFamily: itemTheme.type.title }]}>{item.brand}</Text>
                      <Text style={[styles.body, { color: itemTheme.colors.onSurfaceMuted, fontFamily: itemTheme.type.body }]}>{itemTheme.marketLabel}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </ScreenFrame>
      ) : route === "customer" ? (
        <ScreenFrame theme={theme}>
          <GlassHeader theme={theme} title={selectedRegion?.brand ?? "PAYGO"} subtitle="Select Persona" onHome={goToRegion} />
          <FlatList
            contentContainerStyle={styles.scrollContent}
            data={customers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable onPress={() => setSelectedCustomer(item)} style={styles.cardPressable}>
                <View style={[styles.surfaceLow, { backgroundColor: theme.colors.surfaceLow }]}> 
                  <View style={[styles.surfaceHigh, { backgroundColor: theme.colors.surfaceHigh }]}> 
                    <View style={styles.customerHeaderRow}>
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.title,
                          styles.customerName,
                          { color: theme.colors.onSurface, fontFamily: theme.type.title },
                        ]}
                      >
                        {item.name}
                      </Text>
                      <View style={styles.customerChipWrap}>
                        <Chip theme={theme} label={item.segment.replace("_", " ")} />
                      </View>
                    </View>
                    <Text style={[styles.body, { color: theme.colors.onSurfaceMuted, fontFamily: theme.type.body }]}>{item.account?.meterType ?? "Unknown meter"}</Text>
                    <Text style={[styles.label, { color: theme.colors.onSurfaceMuted, fontFamily: theme.type.label }]}>ID {item.id}</Text>
                  </View>
                </View>
              </Pressable>
            )}
          />
        </ScreenFrame>
      ) : route === "topup" ? (
        <ScreenFrame theme={theme}>
          <GlassHeader
            theme={theme}
            title="Manual Top-Up"
            subtitle={selectedCustomer?.name ?? ""}
            onBack={goToCustomer}
            onHome={goToRegion}
          />
          <View style={styles.scrollContent}>
            <View style={[styles.surfaceLow, { backgroundColor: theme.colors.surfaceLow }]}> 
              <View style={[styles.surfaceHigh, { backgroundColor: theme.colors.surfaceHigh }]}> 
                <Text style={[styles.label, { color: theme.colors.onSurfaceMuted, fontFamily: theme.type.label }]}>Amount</Text>
                <TextInput
                  value={topUpAmount}
                  onChangeText={setTopUpAmount}
                  keyboardType="numeric"
                  style={[
                    styles.editorialInput,
                    {
                      color: theme.colors.onSurface,
                      borderBottomColor: theme.colors.primary,
                      fontFamily: theme.type.title,
                    },
                  ]}
                />
              </View>
            </View>
            <GradientButton theme={theme} label="Submit via Function" onPress={onTopUp} />
            <TextLink theme={theme} label="Back to Dashboard" onPress={() => setRoute("dashboard")} />
          </View>
        </ScreenFrame>
      ) : route === "payments" ? (
        <ScreenFrame theme={theme}>
          <GlassHeader
            theme={theme}
            title="Payment History"
            subtitle={selectedCustomer?.name ?? ""}
            onBack={goToCustomer}
            onHome={goToRegion}
          />
          <FlatList
            contentContainerStyle={styles.scrollContent}
            data={payments}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={[styles.surfaceLow, { backgroundColor: theme.colors.surfaceLow, marginBottom: 10 }]}> 
                <View style={[styles.rowBetween, styles.paymentRow, { backgroundColor: theme.colors.surfaceLowest }]}> 
                  <Text style={[styles.body, { color: theme.colors.onSurface, fontFamily: theme.type.body }]}>{item.date}</Text>
                  <Text style={[styles.bodyStrong, { color: theme.colors.onSurface, fontFamily: theme.type.title }]}>{item.amount}</Text>
                </View>
              </View>
            )}
            ListFooterComponent={<TextLink theme={theme} label="Back to Dashboard" onPress={() => setRoute("dashboard")} />}
          />
        </ScreenFrame>
      ) : route === "support" ? (
        <ScreenFrame theme={theme}>
          <GlassHeader theme={theme} title="Support" subtitle={selectedRegion?.id ?? ""} onBack={goToCustomer} onHome={goToRegion} />
          <View style={styles.scrollContent}>
            <View style={[styles.surfaceLow, { backgroundColor: theme.colors.surfaceLow }]}> 
              <View style={[styles.surfaceHigh, { backgroundColor: theme.colors.surfaceHigh }]}> 
                <Text style={[styles.headline, { color: theme.colors.onSurface, fontFamily: theme.type.headline }]}>Help and guidance</Text>
                <Text style={[styles.body, { color: theme.colors.onSurfaceMuted, fontFamily: theme.type.body }]}>Support details can be themed per market while PAYGO shell remains consistent.</Text>
              </View>
            </View>
            <TextLink theme={theme} label="Back to Dashboard" onPress={() => setRoute("dashboard")} />
          </View>
        </ScreenFrame>
      ) : route === "account" ? (
        <ScreenFrame theme={theme}>
          <GlassHeader theme={theme} title="Account" subtitle={selectedCustomer?.name ?? ""} onBack={goToCustomer} onHome={goToRegion} />
          <View style={styles.scrollContent}>
            <View style={[styles.surfaceLow, { backgroundColor: theme.colors.surfaceLow }]}> 
              <View style={[styles.surfaceHigh, { backgroundColor: theme.colors.surfaceHigh }]}> 
                <Text style={[styles.body, { color: theme.colors.onSurface, fontFamily: theme.type.body }]}>Region: {selectedRegion?.id}</Text>
                <Text style={[styles.body, { color: theme.colors.onSurfaceMuted, fontFamily: theme.type.body }]}>Customer ID: {selectedCustomer?.id}</Text>
              </View>
            </View>
            <TextLink theme={theme} label="Back to Dashboard" onPress={() => setRoute("dashboard")} />
          </View>
        </ScreenFrame>
      ) : (
        <ScreenFrame theme={theme}>
          <GlassHeader
            theme={theme}
            title={selectedRegion?.brand ?? "PAYGO"}
            subtitle={selectedCustomer?.name ?? ""}
            onBack={goToCustomer}
            onHome={goToRegion}
          />
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={[styles.surfaceLow, { backgroundColor: theme.colors.surfaceLow }]}> 
              <View style={[styles.balanceHero, { backgroundColor: theme.colors.surfaceLowest, shadowColor: theme.colors.shadow }]}> 
                <View style={styles.rowBetween}>
                  <Chip theme={theme} label={theme.marketLabel} />
                  <Text style={[styles.label, { color: theme.colors.onSurfaceMuted, fontFamily: theme.type.label }]}>PAYGO Balance</Text>
                </View>
                <Text style={[styles.display, { color: theme.colors.onSurface, fontFamily: theme.type.display }]}> 
                  {selectedCustomer?.account.balanceCurrency ?? selectedRegion?.currency} {selectedCustomer?.account.balance?.toFixed(2)}
                </Text>
                {resolved?.featureFlags.daysRemainingEstimate && (
                  <Text style={[styles.offsetBody, { color: theme.colors.onSurfaceMuted, fontFamily: theme.type.body }]}> 
                    Days remaining: {selectedCustomer?.account.daysRemaining ?? "n/a"}
                  </Text>
                )}
              </View>
            </View>

            <View style={[styles.surfaceLow, { backgroundColor: theme.colors.surfaceLow }]}> 
              <View style={[styles.surfaceHigh, { backgroundColor: theme.colors.surfaceHigh }]}> 
                <Text style={[styles.headline, { color: theme.colors.onSurface, fontFamily: theme.type.headline }]}>Actions</Text>
                <View style={styles.actionGrid}>
                  <GradientButton theme={theme} label="Manual Top-Up" onPress={() => setRoute("topup")} compact />
                  <GradientButton theme={theme} label="Payment History" onPress={() => setRoute("payments")} compact />
                  <GradientButton theme={theme} label="Support" onPress={() => setRoute("support")} compact />
                  <GradientButton theme={theme} label="Account" onPress={() => setRoute("account")} compact />
                </View>
              </View>
            </View>

            {resolved?.featureFlags.lowBalanceAlert && (selectedCustomer?.account.balance ?? 0) < 20 && (
              <View style={[styles.warningBlock, { backgroundColor: theme.colors.errorContainer }]}> 
                <Text style={[styles.bodyStrong, { color: theme.colors.error, fontFamily: theme.type.title }]}>Low balance warning active</Text>
              </View>
            )}
          </ScrollView>
        </ScreenFrame>
      )}
    </SafeAreaProvider>
  );
}

function ScreenFrame({ theme, children }: { theme: DesignTheme; children: React.ReactNode }) {
  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.surface }]}>{children}</SafeAreaView>;
}

function GlassHeader({
  theme,
  title,
  subtitle,
  onBack,
  onHome,
}: {
  theme: DesignTheme;
  title: string;
  subtitle: string;
  onBack?: () => void;
  onHome?: () => void;
}) {
  return (
    <BlurView intensity={20} tint="light" style={[styles.glassHeader, { backgroundColor: theme.colors.glass }]}> 
      {(onBack || onHome) && (
        <View style={styles.headerNavRow}>
          {onBack ? (
            <Pressable onPress={onBack} style={styles.backPressable}>
              <Text style={[styles.backLabel, { color: theme.colors.primary, fontFamily: theme.type.title }]}>Back</Text>
            </Pressable>
          ) : (
            <View />
          )}
          {onHome && (
            <Pressable onPress={onHome} style={styles.backPressable}>
              <Text style={[styles.backLabel, { color: theme.colors.primary, fontFamily: theme.type.title }]}>Home</Text>
            </Pressable>
          )}
        </View>
      )}
      <Text style={[styles.title, { color: theme.colors.onSurface, fontFamily: theme.type.title }]}>{title}</Text>
      <Text style={[styles.label, { color: theme.colors.onSurfaceMuted, fontFamily: theme.type.label }]}>{subtitle}</Text>
    </BlurView>
  );
}

function Chip({ theme, label }: { theme: DesignTheme; label: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: theme.colors.secondaryContainer }]}> 
      <Text style={[styles.chipLabel, { color: theme.colors.onSecondaryContainer, fontFamily: theme.type.label }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

function TextLink({ theme, label, onPress }: { theme: DesignTheme; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.linkPressable}>
      <Text style={[styles.linkLabel, { color: theme.colors.primary, fontFamily: theme.type.title }]}>{label}</Text>
    </Pressable>
  );
}

function GradientButton({
  theme,
  label,
  onPress,
  compact,
}: {
  theme: DesignTheme;
  label: string;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[compact ? styles.compactButtonWrap : styles.buttonWrap]}> 
      <LinearGradient
        colors={[theme.colors.primary, theme.colors.primaryContainer]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[compact ? styles.compactButtonGradient : styles.buttonGradient]}
      >
        <Text style={[styles.buttonLabel, { fontFamily: theme.type.title }]}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  glassHeader: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    overflow: "hidden",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    gap: 14,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 24,
  },
  surfaceLow: {
    borderRadius: 16,
    padding: 10,
  },
  surfaceHigh: {
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  customerHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  customerName: {
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 0,
  },
  customerChipWrap: {
    maxWidth: "55%",
    alignSelf: "flex-start",
  },
  cardPressable: {
    marginBottom: 10,
  },
  balanceHero: {
    borderRadius: 18,
    padding: 16,
    gap: 10,
    shadowOpacity: 0.24,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 12 },
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  display: {
    fontSize: 44,
    lineHeight: 50,
  },
  headline: {
    fontSize: 28,
    lineHeight: 34,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  bodyStrong: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  offsetBody: {
    fontSize: 15,
    lineHeight: 22,
    marginLeft: 20,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  buttonWrap: {
    marginTop: 4,
  },
  compactButtonWrap: {
    width: "48%",
  },
  buttonGradient: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  compactButtonGradient: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  buttonLabel: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 15,
  },
  linkPressable: {
    marginTop: 6,
  },
  linkLabel: {
    fontSize: 15,
  },
  backPressable: {
    marginBottom: 8,
  },
  backLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  headerNavRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  editorialInput: {
    fontSize: 32,
    lineHeight: 38,
    paddingVertical: 8,
    borderBottomWidth: 2,
  },
  paymentRow: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  warningBlock: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorBlock: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: 340,
  },
});
