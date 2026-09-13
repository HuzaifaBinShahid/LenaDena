import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { AppHeader } from "@/components/layout/AppHeader";
import { TopTabs } from "@/components/ui/TopTabs";
import { ActivityView } from "@/features/home/ActivityView";
import { GroupsView } from "@/features/home/GroupsView";
import { PlanView } from "@/features/home/PlanView";
import { ReviewsView } from "@/features/home/ReviewsView";
import { useLedger } from "@/features/ledger/LedgerProvider";
import type { TabKey } from "@/features/ledger/types";
import { useAuth } from "@/features/auth/AuthProvider";
import { Spinner } from "@/components/ui/Spinner";
import { usePreferences } from "@/features/preferences/PreferencesProvider";

export default function HomeScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const { plan, connection } = useLedger();
  const { configured, ready, session } = useAuth();
  const { palette } = usePreferences();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>("plan");
  const tabs = useMemo(() => [
    { key: "plan" as const, label: "Plan", icon: "wallet" as const },
    { key: "groups" as const, label: "Groups", icon: "users" as const },
    { key: "reviews" as const, label: "Reviews", icon: "check-circle" as const, badge: plan.reviews.length },
    { key: "activity" as const, label: "Activity", icon: "pulse" as const },
  ], [plan.reviews.length]);

  useEffect(() => {
    if (params.tab === "plan" || params.tab === "groups" || params.tab === "reviews" || params.tab === "activity") setTab(params.tab);
  }, [params.tab]);

  if (configured && !ready) {
    return <SafeAreaView className="flex-1 items-center justify-center bg-ink"><Spinner size="large" tone="mint" /></SafeAreaView>;
  }

  if (ready && configured && !session) {
    return <Redirect href="/auth" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-ink" style={{ backgroundColor: palette.header }} edges={["top"]}>
      <StatusBar style="light" />
      <LinearGradient colors={[palette.header, palette.headerEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View pointerEvents="none" style={styles.headerGlowLarge} />
        <View pointerEvents="none" style={styles.headerGlowSmall} />
        <AppHeader name={plan.user.name} connection={connection} />
      </LinearGradient>
      <View className="flex-1 overflow-hidden rounded-t-[32px] bg-canvas" style={{ backgroundColor: palette.screen }}>
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 112 + insets.bottom }} showsVerticalScrollIndicator={false}>
          {tab === "plan" ? <PlanView /> : null}
          {tab === "groups" ? <GroupsView /> : null}
          {tab === "reviews" ? <ReviewsView /> : null}
          {tab === "activity" ? <ActivityView /> : null}
        </ScrollView>
      </View>
      <View pointerEvents="box-none" style={[styles.navigationDock, { bottom: Math.max(insets.bottom, 12) }]}> 
        <TopTabs tabs={tabs} value={tab} onChange={setTab} appearance="navigation" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    overflow: "hidden",
    paddingBottom: 8,
  },
  headerGlowLarge: {
    position: "absolute",
    width: 220,
    height: 220,
    right: -68,
    top: -112,
    borderRadius: 110,
    backgroundColor: "rgba(190,168,255,0.16)",
  },
  headerGlowSmall: {
    position: "absolute",
    width: 92,
    height: 92,
    left: -28,
    bottom: -48,
    borderRadius: 46,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  navigationDock: {
    position: "absolute",
    left: 20,
    right: 20,
    zIndex: 40,
  },
});
