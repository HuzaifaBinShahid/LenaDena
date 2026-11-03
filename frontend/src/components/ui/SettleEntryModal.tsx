import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, useReducedMotion } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { useScreenObscured } from "@/components/ui/ScreenObscured";
import { Text } from "@/components/ui/Text";
import { formatMoney, toMinorUnits } from "@/lib/format";
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
  /** How much was already paid; 0 hides the line. */
  paidMinor?: number;
  loading?: SettleMode | null;
  onSettleFull: () => void;
  onSettlePartial: (amountMinor: number) => void;
  onClose: () => void;
};

function plainAmount(minor: number) {
  const value = minor / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * Settling an individual entry: full by default with one tap, or a smaller amount that keeps the rest open.
 * The quick "Full amount" button fills the field so a partial flow never needs mental arithmetic.
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

  const parsed = useMemo(() => toMinorUnits(amount), [amount]);
  const paymentValid = parsed > 0 && parsed <= remainingMinor;
  const settlesInFull = parsed > 0 && parsed >= remainingMinor;
  const amountError = amount.trim() && parsed <= 0
    ? "Enter an amount greater than zero."
    : parsed > remainingMinor
      ? "That is more than what is still open."
      : undefined;

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal visible={visible && !obscured} transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={close}>
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={`Close ${title}`} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Animated.View entering={reduceMotion ? FadeIn.duration(140) : FadeInDown.duration(220)} style={styles.card}>
              <View style={styles.iconWrap}>
                <Icon name="check-circle" size={29} color={c.violet} />
              </View>
              <Text accessibilityRole="header" className="mt-5 text-center text-[22px] font-bold tracking-tight text-ink">{title}</Text>
              <Text className="mt-2 text-center text-[13px] leading-5 text-slate">
                How much did you pay? Settle it all at once, or record part now and keep the rest open.
              </Text>

              <View className="mt-5 rounded-2xl border border-line bg-surface p-4">
                <View className="flex-row items-end justify-between gap-3">
                  <View className="min-w-0 flex-1">
                    <Text className="text-xs font-semibold uppercase tracking-wider text-slate">Still open</Text>
                    <Text className="mt-1 text-2xl font-bold tracking-tight text-ink">{formatMoney(remainingMinor, currency)}</Text>
                  </View>
                  {paidMinor > 0 ? (
                    <Text className="text-right text-[11px] leading-4 text-slate">
                      {formatMoney(paidMinor, currency)} paid{"\n"}of {formatMoney(totalMinor, currency)}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View className="mt-5 gap-2">
                <Text className="text-sm font-bold text-ink">Amount paid now</Text>
                <Input
                  value={amount}
                  onChangeText={setAmount}
                  placeholder={plainAmount(remainingMinor)}
                  keyboardType="decimal-pad"
                  leadingIcon="credit-card"
                  invalid={Boolean(amountError)}
                />
                <Button
                  label={`Full amount · ${formatMoney(remainingMinor, currency)}`}
                  icon="arrow-up-right"
                  size="sm"
                  variant="secondary"
                  onPress={() => setAmount(plainAmount(remainingMinor))}
                />
                {amountError ? <Text className="text-xs font-semibold text-coral">{amountError}</Text> : null}
              </View>

              <View className="mt-6 gap-2">
                <Button
                  label="Mark fully settled"
                  icon="check-circle"
                  fullWidth
                  loading={loading === "full"}
                  disabled={busy}
                  onPress={onSettleFull}
                  accessibilityHint="Settles everything that is still open on this entry"
                />
                <Button
                  label={settlesInFull ? "Save full payment" : "Save partial payment"}
                  icon="check"
                  variant="secondary"
                  fullWidth
                  loading={loading === "partial"}
                  disabled={busy || !paymentValid}
                  onPress={() => onSettlePartial(parsed)}
                  accessibilityHint={settlesInFull ? "Records the full remaining amount and settles this entry" : "Records the amount entered and keeps the remainder open"}
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
    width: 62,
    height: 62,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: c.violetSoft,
  },
}));
