import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { Icon, type IconName } from "@/components/ui/Icon";
import { colors } from "@/theme/tokens";
import { Button } from "@/components/ui/Button";
import { ClayEmpty } from "@/components/brand/Clay";

export type EmptyAction = { label: string; onPress: () => void; icon?: IconName };

type EmptyStateProps = {
  icon: IconName;
  title: string;
  detail: string;
  action?: EmptyAction;
  secondaryAction?: EmptyAction;
  /** Use when the user has no data of this kind at all. A filtered-empty view keeps the `icon` (§2.13). */
  illustration?: "activity" | "groups" | "expenses" | "reviews";
  /** "card" (default) is the bordered card; "inset" has no border, background or shadow, for use inside another surface. */
  variant?: "card" | "inset";
};

export function EmptyState({ icon, title, detail, action, secondaryAction, illustration, variant }: EmptyStateProps) {
  // With none of the new props this is exactly the original markup.
  if (!variant && !illustration && !secondaryAction) {
    return (
      <View className="items-center rounded-card border border-line bg-raised px-6 py-10 shadow-sm shadow-black/5">
        <View className="h-14 w-14 items-center justify-center rounded-[18px] bg-violet-soft">
          <Icon name={icon} size={25} color={colors.violet} />
        </View>
        <Text className="mt-4 text-center text-lg font-bold text-ink">{title}</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-slate">{detail}</Text>
        {action ? <View className="mt-5"><Button label={action.label} icon={action.icon} onPress={action.onPress} /></View> : null}
      </View>
    );
  }

  const inset = variant === "inset";
  const art = illustration ? (
    <ClayEmpty subject={illustration} size={inset ? 128 : 148} surface="light" />
  ) : (
    <View className="h-14 w-14 items-center justify-center rounded-[18px] bg-violet-soft">
      <Icon name={icon} size={25} color={colors.violet} />
    </View>
  );
  // The card frame and its icon-only copy keep the original classes. The new treatments use exact point values
  // (NativeWind's rem is 14pt on native), so their spacing and type sizes are styles.
  const copy = inset
    ? { title: styles.insetTitle, detail: styles.insetDetail }
    : illustration
      ? { title: styles.illustratedTitle, detail: styles.illustratedDetail }
      : null;

  return (
    <View
      className={inset ? "items-center" : "items-center rounded-card border border-line bg-raised px-6 py-10 shadow-sm shadow-black/5"}
      style={inset ? styles.insetFrame : undefined}
    >
      {art}
      {copy ? (
        <>
          <Text className="text-center font-bold text-ink" style={copy.title}>{title}</Text>
          <Text className="text-center font-medium text-slate" style={copy.detail}>{detail}</Text>
        </>
      ) : (
        <>
          <Text className="mt-4 text-center text-lg font-bold text-ink">{title}</Text>
          <Text className="mt-2 text-center text-sm leading-5 text-slate">{detail}</Text>
        </>
      )}
      {action || secondaryAction ? (
        <View style={styles.actions}>
          {action ? <Button label={action.label} icon={action.icon} size="md" onPress={action.onPress} /> : null}
          {secondaryAction ? <Button label={secondaryAction.label} icon={secondaryAction.icon} size="md" variant="secondary" onPress={secondaryAction.onPress} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  insetFrame: {
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  illustratedTitle: {
    marginTop: 12,
    fontSize: 18,
    lineHeight: 24,
  },
  illustratedDetail: {
    marginTop: 6,
    maxWidth: 300,
    fontSize: 14,
    lineHeight: 20,
  },
  insetTitle: {
    marginTop: 14,
    fontSize: 16,
    lineHeight: 22,
  },
  insetDetail: {
    marginTop: 6,
    maxWidth: 300,
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
});
