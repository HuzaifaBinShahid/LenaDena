import { View } from "react-native";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useTheme } from "@/theme/ThemeProvider";

type ConfirmDeleteProps = {
  title: string;
  /** What deleting removes and what it changes for others, in plain words. */
  message: string;
  confirmLabel: string;
  /** The safe choice's label. Default "Keep it". */
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Asks before something is removed for good. It sits in the screen instead of a system alert, so it looks the same
 * and works everywhere (the system alert does nothing on the web build).
 */
export function ConfirmDelete({ title, message, confirmLabel, cancelLabel = "Keep it", busy = false, onConfirm, onCancel }: ConfirmDeleteProps) {
  const { colors: c } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      className="gap-4 rounded-[24px] border bg-raised p-4"
      style={{ borderColor: c.coral }}
    >
      <View>
        <Text className="text-lg font-bold text-ink">{title}</Text>
        <Text className="mt-1 text-sm leading-5 text-slate">{message}</Text>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Button label={cancelLabel} variant="secondary" size="lg" fullWidth disabled={busy} onPress={onCancel} />
        </View>
        <View className="flex-[1.5]">
          <Button label={confirmLabel} icon="trash-2" variant="danger" size="lg" fullWidth loading={busy} onPress={onConfirm} />
        </View>
      </View>
    </View>
  );
}
