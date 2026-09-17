import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, useReducedMotion } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useScreenObscured } from "@/components/ui/ScreenObscured";
import { Text } from "@/components/ui/Text";
import { shadows } from "@/theme/shadows";
import { colors } from "@/theme/tokens";

type ConfirmModalProps = {
  visible: boolean;
  icon?: IconName;
  title: string;
  detail: string;
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** A branded confirmation dialog for actions that change a balance or payment state. */
export function ConfirmModal({
  visible,
  icon = "check-circle",
  title,
  detail,
  confirmLabel,
  cancelLabel = "Cancel",
  loading = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const obscured = useScreenObscured();
  const reduceMotion = useReducedMotion();
  const close = () => {
    if (!loading) onClose();
  };

  return (
    <Modal visible={visible && !obscured} transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={close}>
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={`Close ${title}`} />
        <Animated.View entering={reduceMotion ? FadeIn.duration(140) : FadeInDown.duration(220)} style={styles.card}>
          <View style={styles.iconWrap}>
            <Icon name={icon} size={29} color={colors.violet} />
          </View>
          <Text accessibilityRole="header" className="mt-5 text-center text-[22px] font-bold tracking-tight text-ink">{title}</Text>
          <Text className="mt-2 text-center text-[13px] leading-5 text-slate">{detail}</Text>
          <View className="mt-6 gap-2">
            <Button label={confirmLabel} icon="check" fullWidth loading={loading} onPress={onConfirm} />
            <Button label={cancelLabel} variant="ghost" fullWidth disabled={loading} onPress={close} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(16,8,35,0.58)",
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 28,
    backgroundColor: colors.raised,
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
    backgroundColor: colors.violetSoft,
  },
});
