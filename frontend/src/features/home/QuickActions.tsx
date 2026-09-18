import { createElement, type ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, Text as NativeText, View } from "react-native";
import { router } from "expo-router";
import { ClayCoin, ClayPeople, ClayReceipt, ClayWallet } from "@/components/brand/Clay";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { Touch } from "@/components/ui/Touch";
import { shadows } from "@/theme/shadows";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

export type QuickActionsProps = {
  /** True only once the plan has loaded and it has no groups. Loading and offline never claim "Needs a group". */
  needsGroup: boolean;
};

type ActionCard = {
  key: string;
  label: string;
  caption: string;
  accessibilityLabel: string;
  background: string;
  border?: string;
  /** The violet card: white text on a coloured fill in both themes. */
  dark: boolean;
  art: ReactNode;
  onPress: () => void;
};

const CARD_WIDTH = 148;
const CARD_HEIGHT = 164;
const INK_CHIP = "rgba(23,17,41,0.06)";

/**
 * "Quick actions": four cards with clay art sticking out above them. In light mode three wear soft tints; in dark
 * mode those become raised surfaces with a hairline (deep tints read muddy). Their art keeps the default themed
 * surface, so Clay dims its pale paper on the dark cards; only the violet card's art is on an always-dark surface.
 */
export function QuickActions({ needsGroup }: QuickActionsProps) {
  const toast = useToast();
  const { colors: c, isDark } = useTheme();

  const startWithGroup = () => {
    toast.show({
      tone: "info",
      title: "Start with a group",
      message: "Bills and payments are shared inside a group.",
      action: { label: "New group", onPress: () => router.push("/group/new") },
    });
  };

  const cards: ActionCard[] = [
    {
      key: "split",
      label: "Split bill",
      caption: needsGroup ? "Needs a group" : "Group expense",
      accessibilityLabel: needsGroup ? "Split bill, needs a group" : "Split bill, group expense",
      // Static violet: white text on it keeps 4.7:1 in both themes (the dark palette's brighter violet would not).
      background: colors.violet,
      dark: true,
      art: <ClayReceipt size={84} stamp="plus" surface="dark" glow={false} />,
      onPress: needsGroup ? startWithGroup : () => router.push("/expense/new"),
    },
    {
      key: "paid",
      label: "I paid",
      caption: needsGroup ? "Needs a group" : "Claim a payment",
      accessibilityLabel: needsGroup ? "I paid, needs a group" : "I paid, claim a payment",
      background: isDark ? c.raised : c.goldSoft,
      ...(isDark ? { border: c.line } : null),
      dark: false,
      art: <ClayWallet size={112} />,
      onPress: needsGroup ? startWithGroup : () => router.push("/settlement/new"),
    },
    {
      key: "iou",
      label: "Log an IOU",
      caption: "Personal entry",
      accessibilityLabel: "Log an IOU, personal entry",
      background: isDark ? c.raised : c.lavenderSoft,
      border: isDark ? c.line : "rgba(118,87,246,0.14)",
      dark: false,
      art: <ClayCoin size={96} tone="gold" glyph="exchange" />,
      onPress: () => router.push("/transaction/new"),
    },
    {
      key: "group",
      label: "New group",
      caption: "Invite friends",
      accessibilityLabel: "New group, invite friends",
      background: isDark ? c.raised : c.limeSoft,
      border: isDark ? c.line : "rgba(19,154,120,0.16)",
      dark: false,
      art: <ClayPeople size={112} accessory="plus" />,
      onPress: () => router.push("/group/new"),
    },
  ];

  return (
    <View>
      <SectionHeader title="Quick actions" style={styles.header} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH + 12}
        decelerationRate="fast"
        contentContainerStyle={styles.scroller}
      >
        {cards.map((card) => (
          <ActionCardView key={card.key} card={card} />
        ))}
      </ScrollView>
    </View>
  );
}

function ActionCardView({ card }: { card: ActionCard }) {
  const themed = useStyles();
  const { colors: c, isDark } = useTheme();
  const hint = card.caption === "Needs a group" ? "Shows how to start with a group" : undefined;
  // iOS-only shadow: on Android the art sticking out must never be drawn under an elevated card. The violet card keeps its
  // violet glow in dark; the raised cards' plum shadow would not show on the dark canvas, so they rely on their hairline.
  const shadow = Platform.OS !== "ios" ? null : card.dark ? shadows.accent : isDark ? null : shadows.raised;
  return (
    <Touch
      onPress={card.onPress}
      pressedScale={0.96}
      haptic
      accessibilityRole="button"
      accessibilityLabel={card.accessibilityLabel}
      accessibilityHint={hint}
      containerStyle={styles.cardContainer}
      pressableStyle={styles.cardPressable}
    >
      <View
        style={[
          styles.card,
          { backgroundColor: card.background },
          card.border ? { borderWidth: 1, borderColor: card.border } : null,
          shadow,
          styles.noElevation,
        ]}
      >
        <View style={styles.bottom}>
          <View style={styles.labelRow}>
            {createElement(
              NativeText,
              {
                numberOfLines: 1,
                adjustsFontSizeToFit: true,
                minimumFontScale: 0.8,
                maxFontSizeMultiplier: 1.3,
                style: [styles.label, card.dark ? styles.labelOnViolet : themed.label],
              },
              card.label,
            )}
            <View style={[styles.chip, card.dark ? styles.chipOnViolet : themed.chip]}>
              <Icon name="arrow-right" size={15} color={card.dark ? colors.white : c.ink} />
            </View>
          </View>
          {createElement(
            NativeText,
            { numberOfLines: 1, maxFontSizeMultiplier: 1.3, style: [styles.caption, card.dark ? styles.captionOnViolet : themed.caption] },
            card.caption,
          )}
        </View>
        {/* Art container is the last child so it draws above the card; it sticks out 34pt above the top edge. */}
        <View pointerEvents="none" style={styles.art}>
          {card.art}
        </View>
      </View>
    </Touch>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    marginTop: 28,
  },
  scroller: {
    paddingHorizontal: 20,
    paddingTop: 34,
    paddingBottom: 8,
    gap: 12,
  },
  cardContainer: {
    width: CARD_WIDTH,
  },
  cardPressable: {
    height: CARD_HEIGHT,
  },
  card: {
    height: CARD_HEIGHT,
    borderRadius: 24,
  },
  noElevation: {
    elevation: 0,
  },
  art: {
    position: "absolute",
    top: -34,
    left: 0,
    right: 0,
    height: 108,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bottom: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    flex: 1,
    fontFamily: "Manrope_700Bold",
    fontSize: 15,
    lineHeight: 20,
  },
  labelOnViolet: {
    color: colors.white,
  },
  chip: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOnViolet: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  caption: {
    marginTop: 2,
    fontFamily: "Manrope_500Medium",
    fontSize: 11,
    lineHeight: 14,
  },
  captionOnViolet: {
    color: "rgba(255,255,255,0.75)",
  },
});

/** Text and chip on the tinted (light) or raised (dark) cards. */
const useStyles = makeStyles((c, { isDark }) => ({
  label: {
    color: c.ink,
  },
  chip: {
    backgroundColor: isDark ? c.surface : INK_CHIP,
  },
  caption: {
    color: c.slate,
  },
}));
