import { StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/Button";

type SettleActionsProps = {
  /** The entry's title, used in the accessibility hints. */
  title: string;
  /** This entry is being settled: the first button spins and both are held. */
  loading?: boolean;
  /** Settles everything still open, with no dialog in between. */
  onSettle: () => void;
  /** Opens the custom payment dialog for an amount of the person's own. */
  onCustom: () => void;
};

/**
 * The footer of an open individual entry: one tap settles it in full, the second button opens the custom
 * payment dialog. The two share the width equally, and stack at full width when the row is too narrow.
 */
export function SettleActions({ title, loading = false, onSettle, onCustom }: SettleActionsProps) {
  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <Button
          label="Mark settled"
          variant="secondary"
          fullWidth
          loading={loading}
          onPress={onSettle}
          accessibilityHint={`Settles ${title} in full right away`}
        />
      </View>
      <View style={styles.cell}>
        <Button
          label="Custom payment"
          variant="secondary"
          fullWidth
          disabled={loading}
          onPress={onCustom}
          accessibilityHint={`Opens a dialog to record a payment of your own amount on ${title}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  // "Custom payment" is about 154pt wide with its padding, so a cell never starts narrower than that: when two
  // would not fit on one line they wrap and stack instead of squeezing the label onto two lines.
  cell: {
    flexGrow: 1,
    flexBasis: 156,
  },
});
