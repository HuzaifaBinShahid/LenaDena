import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { COMPACT_CARD, LayeredGroupCard } from "@/components/groups/LayeredGroupCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { TopTabs } from "@/components/ui/TopTabs";
import { Touch } from "@/components/ui/Touch";
import { useToast } from "@/components/ui/Toast";
import { groupSkin } from "@/features/groups/groupSkin";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { layout } from "@/theme/layout";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

// Stored accent values stay the same; they are rendered only through groupSkin().
const accents = ["#6657E8", "#168AAD", "#16A77E", "#E88B3D", "#EC6075"];

/** Screen padding (px-[18px] on each side). */
const SCREEN_GUTTERS = 36;

export default function CreateGroupScreen() {
  const { createGroup } = useLedger();
  const toast = useToast();
  const styles = useStyles();
  const { isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<"PKR" | "USD" | "EUR">("PKR");
  const [emails, setEmails] = useState("");
  const [accent, setAccent] = useState(accents[0] ?? colors.violet);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const nameError = submitted && name.trim().length < 2 ? "Enter a group name." : undefined;
  const cardWidth = Math.min(windowWidth, layout.contentMax) - SCREEN_GUTTERS - COMPACT_CARD.MARGIN_LEFT;
  const previewName = name.trim() || "Weekend crew";
  const skin = groupSkin(accent);

  const save = async () => {
    setSubmitted(true);
    if (name.trim().length < 2) {
      return;
    }
    setSaving(true);
    const inviteEmails = emails.split(/[\s,]+/).map((email) => email.trim().toLowerCase()).filter(Boolean);
    try {
      await createGroup({ name: name.trim(), currency, accent, inviteEmails });
      router.back();
      toast.success(
        `${name.trim()} is ready`,
        inviteEmails.length ? `Invites are on their way to ${inviteEmails.length} ${inviteEmails.length === 1 ? "person" : "people"}.` : "Invite friends from the group whenever you're ready.",
      );
    } catch (error) {
      toast.error("Couldn't create the group", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="Create group" subtitle="You will be the group owner" />
      <View style={styles.preview}>
        <LayeredGroupCard
          variant="compact"
          width={cardWidth}
          height={COMPACT_CARD.HEIGHT}
          skin={skin}
          art="full"
          glyph="users"
          name={previewName}
          currency={currency}
          label="Your position"
          amount={formatMoney(0, currency)}
          meta="Just you"
          chip={{ icon: "sparkles", label: "No balance yet", color: colors.lavender }}
          accessibilityLabel={`Preview: ${previewName}. ${currency}. Just you. No balance yet.`}
        />
      </View>
      <View className="gap-6">
        <Field label="Group name" required error={nameError}>
          <Input value={name} onChangeText={setName} placeholder="Weekend crew" maxLength={80} autoFocus invalid={Boolean(nameError)} />
        </Field>
        <Field label="Currency" required hint="A group uses one currency at launch.">
          <TopTabs
            tabs={[{ key: "PKR", label: "PKR" }, { key: "USD", label: "USD" }, { key: "EUR", label: "EUR" }]}
            value={currency}
            onChange={setCurrency}
          />
        </Field>
        <Field label="Invite friends" hint="Separate email addresses with commas. You can invite more people later.">
          <Input value={emails} onChangeText={setEmails} placeholder="sara@example.com, hamza@example.com" keyboardType="email-address" autoCapitalize="none" multiline />
        </Field>
        <Field label="Group accent" hint="Accent changes decoration only, never financial status colors.">
          <View style={styles.swatches} accessibilityRole="radiogroup">
            {accents.map((value) => {
              const selected = value === accent;
              const swatchSkin = groupSkin(value);
              return (
                <Touch
                  key={value}
                  onPress={() => setAccent(value)}
                  haptic
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`Choose ${swatchSkin.name} accent`}
                  containerStyle={styles.swatchSlot}
                  pressableStyle={[styles.swatch, selected ? styles.swatchSelected : null]}
                >
                  <View style={styles.swatchTile}>
                    {isDark ? (
                      <LinearGradient pointerEvents="none" colors={SWATCH_ART_DARK} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                    ) : null}
                    <View style={[styles.swatchDisc, { backgroundColor: swatchSkin.disc }]} />
                    {selected ? <Icon name="check" size={16} color={colors.white} /> : null}
                  </View>
                </Touch>
              );
            })}
          </View>
        </Field>
        <Button label="Create group" icon="users" size="lg" fullWidth loading={saving} onPress={save} />
      </View>
    </Screen>
  );
}

/**
 * Each swatch is a tiny group card: the art's colour with the skin's disc in the corner. Light shows the flat plum;
 * on the dark canvas plum disappears, so dark shows the card art's own violetStrong → plum gradient (the disc still
 * sits on its darkest corner) with a hairline edge.
 */
const SWATCH_ART_DARK = [colors.violetStrong, colors.plum] as const;

const useStyles = makeStyles((c, { isDark }) => ({
  preview: {
    marginLeft: COMPACT_CARD.MARGIN_LEFT,
    marginTop: 2,
    marginBottom: 30,
  },
  swatches: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  swatchSlot: {
    width: 48,
    height: 48,
  },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 2,
    // violetStrong at 0 opacity, so the selected border can appear without shifting the tile.
    borderColor: "rgba(75,42,164,0)",
    alignItems: "center",
    justifyContent: "center",
  },
  // Selected: a solid 2pt ring outside the tile plus the white check on it; violetStrong on light, bright violet on dark.
  swatchSelected: {
    borderColor: isDark ? c.violet : colors.violetStrong,
  },
  swatchTile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: colors.plum,
    borderWidth: isDark ? 1 : 0,
    borderColor: "rgba(181,165,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  swatchDisc: {
    position: "absolute",
    right: -5,
    bottom: -5,
    width: 22,
    height: 22,
    borderRadius: 11,
  },
}));
