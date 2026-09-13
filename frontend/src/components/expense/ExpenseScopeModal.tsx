import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { colors } from "@/theme/tokens";

type ExpenseScopeModalProps = {
  visible: boolean;
  onClose: () => void;
  onIndividual: () => void;
  onGroup: () => void;
};

export function ExpenseScopeModal({ visible, onClose, onIndividual, onGroup }: ExpenseScopeModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close expense options" />
        <Animated.View entering={FadeInDown.duration(220)} style={styles.sheet}>
          <View style={styles.handle} />
          <View className="flex-row items-start gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-violet-soft">
              <Text className="text-lg font-bold text-violet">+</Text>
            </View>
            <View className="flex-1">
              <Text className="text-[22px] font-bold tracking-tight text-ink">Add amount due</Text>
              <Text className="mt-1 text-[13px] leading-5 text-slate">Who should this balance belong to?</Text>
            </View>
          </View>
          <View className="mt-6 gap-3">
            <Button label="Individual" description="Track what you owe or what someone owes you" icon="user" size="choice" fullWidth onPress={onIndividual} />
            <Button label="Group" description="Split a cost and track what each person owes" icon="users" variant="secondary" size="choice" fullWidth onPress={onGroup} />
          </View>
          <View className="mt-3 items-center">
            <Button label="Not now" variant="ghost" onPress={onClose} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(16,8,35,0.52)",
  },
  sheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    shadowColor: colors.plum,
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
  },
  handle: {
    width: 42,
    height: 5,
    alignSelf: "center",
    borderRadius: 3,
    backgroundColor: colors.line,
    marginBottom: 22,
  },
});
