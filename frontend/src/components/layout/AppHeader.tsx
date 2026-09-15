import { createElement } from "react";
import { StyleSheet, Text as NativeText, View } from "react-native";
import { router } from "expo-router";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { Touch } from "@/components/ui/Touch";
import type { Connection } from "@/features/ledger/planState";
import { usePreferences } from "@/features/preferences/PreferencesProvider";
import { firstName } from "@/lib/format";
import { colors } from "@/theme/tokens";

export type AppHeaderProps = {
  /** "greeting" (Plan): "Hello, {first}" over "Welcome back!". "title": the tab's own eyebrow and title. */
  variant: "greeting" | "title";
  name: string;
  /** The placeholder plan is showing (loading or offline with nothing cached), so the name is not real yet. */
  placeholder: boolean;
  /** A brand-new account with nothing in it yet: the greeting title becomes "Welcome aboard!". */
  newAccount: boolean;
  avatarUrl?: string;
  connection: Connection;
  eyebrow?: string;
  title?: string;
  /** "dark" when the tab's top surface is dark chrome (Activity). */
  tone: "light" | "dark";
  /** The colour behind the header; rings the bell's count badge. */
  surfaceColor: string;
  reviewCount: number;
  onOpenReviews: () => void;
};

const SYNC: Record<Connection, { dot: string; label: string }> = {
  live: { dot: colors.mint, label: "Synced" },
  loading: { dot: colors.violet, label: "Connecting" },
  demo: { dot: colors.gold, label: "Demo data" },
  error: { dot: colors.coral, label: "Offline" },
};

/** Shared home header: eyebrow with the sync pill, the tab title, then the reviews bell and the settings avatar. */
export function AppHeader({ variant, name, placeholder, newAccount, avatarUrl, connection, eyebrow, title, tone, surfaceColor, reviewCount, onOpenReviews }: AppHeaderProps) {
  const { palette } = usePreferences();
  const dark = tone === "dark";
  const first = placeholder ? "" : firstName(name);
  const greeting = variant === "greeting";
  const eyebrowText = greeting ? (first ? `Hello, ${first}` : "Hello there") : eyebrow ?? "";
  const titleText = greeting ? (newAccount ? "Welcome aboard!" : "Welcome back!") : title ?? "";
  const sync = SYNC[connection];
  const count = Math.max(0, Math.floor(reviewCount));

  const eyebrowStyle = greeting
    ? [styles.greeting, { color: dark ? colors.lavender : colors.violet }]
    : [styles.eyebrow, { color: dark ? "rgba(255,255,255,0.6)" : colors.slate }];

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <View style={styles.eyebrowRow}>
          {eyebrowText
            ? createElement(NativeText, { numberOfLines: 1, style: [styles.eyebrowText, eyebrowStyle] }, eyebrowText)
            : null}
          <View
            accessible
            accessibilityLabel={`Sync status: ${sync.label}`}
            style={[styles.pill, dark ? styles.pillDark : { backgroundColor: palette.surface, borderColor: colors.line }]}
          >
            <View style={[styles.pillDot, { backgroundColor: sync.dot }]} />
            {createElement(
              NativeText,
              { numberOfLines: 1, maxFontSizeMultiplier: 1.3, style: [styles.pillLabel, { color: dark ? "rgba(255,255,255,0.75)" : colors.slate }] },
              sync.label,
            )}
          </View>
        </View>
        {createElement(
          NativeText,
          {
            accessibilityRole: "header",
            numberOfLines: 1,
            adjustsFontSizeToFit: true,
            minimumFontScale: 0.8,
            style: [styles.title, { color: dark ? colors.white : colors.ink }],
          },
          titleText,
        )}
      </View>

      <View style={styles.cluster}>
        <Touch
          onPress={onOpenReviews}
          hitSlop={8}
          pressedScale={0.92}
          haptic
          accessibilityRole="button"
          accessibilityLabel={count > 0 ? `Payment reviews, ${count} need attention` : "Payment reviews, nothing waiting"}
          containerStyle={styles.buttonBox}
          pressableStyle={[styles.bell, dark ? styles.bellDark : styles.bellLight]}
        >
          <Icon name="bell" size={22} color={dark ? colors.white : colors.violet} />
          {count > 0 ? (
            <View pointerEvents="none" style={[styles.badge, { borderColor: surfaceColor }]}>
              {createElement(NativeText, { maxFontSizeMultiplier: 1.2, style: styles.badgeLabel }, count > 9 ? "9+" : String(count))}
            </View>
          ) : null}
        </Touch>

        <Touch
          onPress={() => router.push("/settings")}
          hitSlop={8}
          haptic
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          containerStyle={styles.buttonBox}
          pressableStyle={styles.avatarButton}
        >
          {placeholder ? (
            // No real profile yet: a neutral person glyph in the Avatar frame instead of initials from the placeholder name.
            <View style={[styles.placeholderAvatar, dark ? styles.placeholderAvatarDark : styles.placeholderAvatarLight]}>
              <Icon name="user" size={18} color={dark ? colors.white : colors.violet} />
            </View>
          ) : (
            <Avatar name={name} uri={avatarUrl} size="sm" inverted={dark} />
          )}
          <View pointerEvents="none" style={[styles.gear, { backgroundColor: palette.surface }]}>
            <Icon name="settings" size={11} color={colors.slate} />
          </View>
        </Touch>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  left: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eyebrowText: {
    flexShrink: 1,
  },
  greeting: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 17,
    lineHeight: 22,
  },
  eyebrow: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 13,
    lineHeight: 18,
  },
  pill: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  pillDark: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.15)",
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillLabel: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 10.5,
    lineHeight: 14,
  },
  title: {
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.8,
  },
  cluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginLeft: 12,
  },
  buttonBox: {
    width: 44,
    height: 44,
  },
  bell: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bellLight: {
    backgroundColor: colors.violetSoft,
    borderColor: "rgba(118,87,246,0.10)",
  },
  bellDark: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.15)",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.coral,
  },
  badgeLabel: {
    color: colors.white,
    fontFamily: "Manrope_700Bold",
    fontSize: 10,
    lineHeight: 12,
  },
  avatarButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderAvatarLight: {
    backgroundColor: colors.violetSoft,
    borderColor: colors.line,
  },
  placeholderAvatarDark: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderColor: "rgba(255,255,255,0.20)",
  },
  gear: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
});
