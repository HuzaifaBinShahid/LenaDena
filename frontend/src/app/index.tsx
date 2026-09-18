import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { ExpenseScopeModal } from "@/components/expense/ExpenseScopeModal";
import { AppHeader, type AppHeaderProps } from "@/components/layout/AppHeader";
import { TabDock, dockContentPadding, type TabDockProps } from "@/components/navigation/TabDock";
import { Spinner } from "@/components/ui/Spinner";
import { useAuth } from "@/features/auth/AuthProvider";
import { ActivityView } from "@/features/home/ActivityView";
import { GroupsView } from "@/features/home/GroupsView";
import { homeChrome } from "@/features/home/homeChrome";
import { PlanView } from "@/features/home/PlanView";
import { ReviewsView } from "@/features/home/ReviewsView";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { getPlanState, isNewAccount } from "@/features/ledger/planState";
import type { TabKey } from "@/features/ledger/types";
import { layout } from "@/theme/layout";
import { useTheme } from "@/theme/ThemeProvider";

/** Header copy for the tabs that use the title variant (§3.2). Plan uses the greeting. */
const TITLES: Record<Exclude<TabKey, "plan">, { eyebrow: string; title: string }> = {
  groups: { eyebrow: "Your circles", title: "Groups" },
  reviews: { eyebrow: "Confirm and track", title: "Payments" },
  activity: { eyebrow: "Balance history", title: "Activity" },
};

export default function HomeScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const { plan, connection } = useLedger();
  const { configured, ready, session } = useAuth();
  const { colors: c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [tab, setTab] = useState<TabKey>("plan");
  const [scopeVisible, setScopeVisible] = useState(false);

  const reviewCount = plan.reviews.length + plan.claims.filter((claim) => claim.canSelfSettle).length;
  const dockTabs = useMemo<TabDockProps<TabKey>["tabs"]>(() => [
    { key: "plan", label: "Plan", icon: "home", activeIcon: "home-active" },
    { key: "groups", label: "Groups", icon: "users", activeIcon: "users-active" },
    { key: "reviews", label: "Reviews", icon: "check-circle-outline", activeIcon: "check-circle", badge: reviewCount },
    { key: "activity", label: "Activity", icon: "chart", activeIcon: "chart-active" },
  ], [reviewCount]);

  const changeTab = useCallback((next: TabKey) => {
    setTab(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);
  const openAddEntry = useCallback(() => setScopeVisible(true), []);
  const closeAddEntry = useCallback(() => setScopeVisible(false), []);
  const openReviews = useCallback(() => changeTab("reviews"), [changeTab]);

  useEffect(() => {
    if (params.tab === "plan" || params.tab === "groups" || params.tab === "reviews" || params.tab === "activity") changeTab(params.tab);
  }, [changeTab, params.tab]);

  if (configured && !ready) {
    // The always-dark brand night in both themes (bg-ink would turn light in dark mode).
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-night">
        <StatusBar style="light" />
        <Spinner size="large" tone="mint" />
      </SafeAreaView>
    );
  }

  if (ready && configured && !session) {
    return <Redirect href="/auth" />;
  }

  const chrome = homeChrome(tab, c, isDark);
  const topSurface = chrome.surface;
  const column = Math.min(width, layout.contentMax);
  const planState = getPlanState(plan, connection);
  const placeholder = planState === "loading" || planState === "offline";
  const tabTitle = tab === "plan" ? null : TITLES[tab];
  const headerProps: AppHeaderProps = {
    variant: tabTitle ? "title" : "greeting",
    name: plan.user.name,
    placeholder,
    newAccount: planState === "empty" && isNewAccount(plan),
    connection,
    tone: chrome.tone,
    surfaceColor: topSurface,
    reviewCount,
    onOpenReviews: openReviews,
    ...(plan.user.avatarUrl ? { avatarUrl: plan.user.avatarUrl } : null),
    ...(tabTitle ? { eyebrow: tabTitle.eyebrow, title: tabTitle.title } : null),
  };

  return (
    <View style={[styles.root, { backgroundColor: c.canvas }]}>
      <StatusBar style={chrome.statusBar} />
      <ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: dockContentPadding(insets.bottom) }}
      >
        {/* Paints the pull-down overscroll area in the tab's top surface. */}
        <View pointerEvents="none" style={[styles.overscroll, { backgroundColor: topSurface }]} />
        <View style={{ backgroundColor: topSurface, paddingTop: insets.top + 12 }}>
          <View style={[styles.headerColumn, { width: column }]}>
            <AppHeader {...headerProps} />
          </View>
        </View>
        {tab === "plan" ? <PlanView onAddEntry={openAddEntry} onChangeTab={changeTab} /> : null}
        {tab === "groups" ? <GroupsView onAddEntry={openAddEntry} onChangeTab={changeTab} /> : null}
        {tab === "reviews" ? <ReviewsView onAddEntry={openAddEntry} onChangeTab={changeTab} /> : null}
        {tab === "activity" ? <ActivityView onAddEntry={openAddEntry} onChangeTab={changeTab} /> : null}
      </ScrollView>
      {/* Status bar scrim with a short fade, so scrolled content never runs under the clock. */}
      <View pointerEvents="none" style={[styles.scrim, { height: insets.top, backgroundColor: topSurface }]} />
      <LinearGradient
        pointerEvents="none"
        colors={[topSurface, chrome.surfaceClear]}
        style={[styles.scrimFade, { top: insets.top }]}
      />
      <TabDock
        tabs={dockTabs}
        value={tab}
        onChange={changeTab}
        barColor={c.shell}
        centerAction={{ label: "Add entry", hint: "Choose an individual or group entry", onPress: openAddEntry }}
      />
      <ExpenseScopeModal
        visible={scopeVisible}
        onClose={closeAddEntry}
        onIndividual={() => {
          closeAddEntry();
          router.push("/transaction/new");
        }}
        onGroup={() => {
          closeAddEntry();
          router.push("/expense/new");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overscroll: {
    position: "absolute",
    top: -800,
    left: 0,
    right: 0,
    height: 800,
  },
  headerColumn: {
    alignSelf: "center",
  },
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    elevation: 30,
  },
  scrimFade: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 16,
    zIndex: 30,
  },
});
