import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, useReducedMotion } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { useScreenObscured } from "@/components/ui/ScreenObscured";
import { Text } from "@/components/ui/Text";
import { describeCustomPayment } from "@/features/ledger/amounts";
import { formatMoney } from "@/lib/format";
import { shadows } from "@/theme/shadows";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";

export type SettleMode = "full" | "partial";

type SettleEntryModalProps = {
  visible: boolean;
  /** The entry being settled, e.g. "Coffee money". */
  title: string;
  /** What is still open on the entry. */
  remainingMinor: number;
  /** The entry's original amount. */
  totalMinor: number;
  currency: string;
  /** How much was already paid; 0 hides the line and the progress bar. */
  paidMinor?: number;
  loading?: SettleMode | null;
  onSettleFull: () => void;
  onSettlePartial: (amountMinor: number) => void;
  onClose: () => void;
};

/** Exact money for the live hint under the field: `formatMoney` rounds to whole units, which would hide 250.50. */
function exactMoney(minor: number, currency: string) {
  const whole = minor % 100 === 0;
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/**
 * The "Custom payment" dialog for an individual entry. The rows already settle everything in one tap, so this is
 * for the other case: pay a different amount and keep the rest open. The top button is the full-amount shortcut:
 * it settles right away and never fills the field.
 */
export function SettleEntryModal({
  visible,
  title,
  remainingMinor,
  totalMinor,
  currency,
  paidMinor = 0,
  loading = null,
  onSettleFull,
  onSettlePartial,
  onClose,
}: SettleEntryModalProps) {
  const obscured = useScreenObscured();
  const reduceMotion = useReducedMotion();
  const { colors: c } = useTheme();
  const styles = useStyles();
  const [amount, setAmount] = useState("");
  const busy = loading !== null;

  useEffect(() => {
    if (visible) setAmount("");
  }, [visible, title]);

  const payment = useMemo(() => describeCustomPayment(amount, remainingMinor), [amount, remainingMinor]);
  const progress = totalMinor > 0 ? Math.min(100, Math.max(0, (paidMinor / totalMinor) * 100)) : 0;
  const hint = payment.error
    ? undefined
    : payment.settlesInFull
      ? "This settles the entry in full."
      : payment.valid
        ? `${exactMoney(payment.leftMinor, currency)} will stay open.`
        : `Up to ${exactMoney(remainingMinor, currency)}.`;

  const close = () => {
    if (!busy) onClose();
  };
  const save = () => {
    if (payment.valid && !busy) onSettlePartial(payment.amountMinor);
  };

  return (
    <Modal visible={visible && !obscured} transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={close}>
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={`Close ${title}`} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Animated.View entering={reduceMotion ? FadeIn.duration(140) : FadeInDown.duration(220)} style={styles.card}>
              <View style={styles.iconWrap}>
                <Icon name="cash" size={27} color={c.violet} />
              </View>
              <Text accessibilityRole="header" className="mt-4 text-center text-[22px] font-bold tracking-tight text-ink">Custom payment</Text>
              <Text numberOfLines={2} className="mt-1 text-center text-[13px] leading-5 text-slate">{title}</Text>

              <View className="mt-5 rounded-2xl border border-line bg-surface p-4">
                <View className="flex-row items-end justify-between gap-3">
                  <View className="min-w-0 flex-1">
                    <Text className="text-xs font-semibold uppercase tracking-wider text-slate">Still open</Text>
                    <Text className="mt-1 text-[28px] font-bold tracking-tight text-ink">{formatMoney(remainingMinor, currency)}</Text>
                  </View>
                  {paidMinor > 0 ? (
                    <Text className="text-right text-[11px] leading-4 text-slate">
                      {formatMoney(paidMinor, currency)} paid{"\n"}of {formatMoney(totalMinor, currency)}
                    </Text>
                  ) : null}
                </View>
                {paidMinor > 0 ? (
                  <View style={styles.track} accessible={false}>
                    <View style={[styles.fill, { width: `${progress}%` }]} />
                  </View>
                ) : null}
              </View>

              <View className="mt-5">
                <Button
                  label={`Full amount (${formatMoney(remainingMinor, currency)})`}
                  icon="check-circle"
                  size="lg"
                  fullWidth
                  loading={loading === "full"}
                  disabled={busy}
                  onPress={onSettleFull}
                  accessibilityHint="Settles everything that is still open on this entry"
                />
              </View>

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text className="text-xs font-semibold text-slate">or record a custom amount</Text>
                <View style={styles.dividerLine} />
              </View>

              <View className="gap-2">
                <Input
                  value={amount}
                  onChangeText={setAmount}
                  placeholder={`Amount in ${currency}`}
                  accessibilityLabel="Amount paid now"
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={save}
                  leadingIcon="credit-card"
                  invalid={Boolean(payment.error)}
                />
                <Text
                  accessibilityLiveRegion="polite"
                  className={`min-h-4 px-1 text-xs ${payment.error ? "font-semibold text-coral" : "text-slate"}`}
                >
                  {payment.error ?? hint}
                </Text>
              </View>

              <View className="mt-4 gap-1">
                <Button
                  label="Record payment"
                  icon="check"
                  size="lg"
                  variant="secondary"
                  fullWidth
                  loading={loading === "partial"}
                  disabled={busy || !payment.valid}
                  onPress={save}
                  accessibilityHint={payment.settlesInFull ? "Records the full remaining amount and settles this entry" : "Records the amount entered and keeps the remainder open"}
                />
                <Button label="Cancel" variant="ghost" fullWidth disabled={busy} onPress={close} />
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c, { isDark }) => ({
  root: {
    flex: 1,
    backgroundColor: isDark ? c.backdrop : "rgba(16,8,35,0.58)",
  },
  keyboard: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    alignSelf: "center",
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: 28,
    backgroundColor: c.raised,
    padding: 24,
    ...shadows.sheet,
  },
  iconWrap: {
    width: 56,
    height: 56,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: c.violetSoft,
  },
  track: {
    height: 6,
    marginTop: 14,
    overflow: "hidden",
    borderRadius: 3,
    backgroundColor: c.line,
  },
  fill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: c.violet,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.line,
  },
}));
