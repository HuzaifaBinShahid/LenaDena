import { createElement, useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { ScrollView, StyleSheet, Text as NativeText, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { DashedOutline } from "@/components/ui/DashedOutline";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { Touch } from "@/components/ui/Touch";
import type { Group, Member } from "@/features/ledger/types";
import { usePreferences } from "@/features/preferences/PreferencesProvider";
import { firstName } from "@/lib/format";
import { colors } from "@/theme/tokens";

const ITEM_W = 64;
const ITEM_H = 88;
const DISC = 64;
const GAP = 22;
const ROW_GAP = 14;
const SIDE_PAD = 20;

export type MemberRowProps = {
  group: Group;
  currentUserId: string;
  /** Shows the dashed Invite circle first. Omit it where inviting makes no sense (split and payment pickers). */
  onInvite?: () => void;
  inviting?: boolean;
  /** members: static avatars. radio: pick one (you are excluded). checkbox: pick several (you included). */
  mode: "members" | "radio" | "checkbox";
  selectedIds?: readonly string[];
  onToggle?: (memberId: string) => void;
  /** scroll (default): horizontal scroller with 20pt side padding. wrap: wrapping grid, gap 22, row gap 14, no side padding. */
  layout?: "scroll" | "wrap";
  /** Trailing caption beside the items. In members mode a group with only you gets "Invite friends to split costs in {name}." */
  caption?: string;
  style?: StyleProp<ViewStyle>;
};

function memberTint(id: string, surface: string): string {
  const tints = [colors.violetSoft, colors.limeSoft, colors.goldSoft, surface];
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return tints[hash % tints.length] ?? surface;
}

function byName(a: Member, b: Member) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/** Invite, You, then everyone else by name (§2.24). Radio mode lists only the other members. */
export function MemberRow({ group, currentUserId, onInvite, inviting = false, mode, selectedIds, onToggle, layout = "scroll", caption, style }: MemberRowProps) {
  const { palette } = usePreferences();
  const members = useMemo(() => {
    const you = group.members.find((member) => member.id === currentUserId);
    const others = group.members.filter((member) => member.id !== currentUserId).sort(byName);
    return mode === "radio" || !you ? others : [you, ...others];
  }, [currentUserId, group.members, mode]);
  const solo = !group.members.some((member) => member.id !== currentUserId);
  const groupName = group.name.trim() || "this group";
  const trailingCaption = caption ?? (mode === "members" && solo ? `Invite friends to split costs in ${groupName}.` : undefined);

  const items = [
    onInvite ? <InviteCircle key="invite" name={groupName} onPress={onInvite} inviting={inviting} /> : null,
    ...members.map((member) => {
      const isYou = member.id === currentUserId;
      const tint = memberTint(member.id, palette.surface);
      if (mode === "members") {
        return <StaticMember key={member.id} member={member} isYou={isYou} tint={tint} />;
      }
      return (
        <SelectableMember
          key={member.id}
          member={member}
          isYou={isYou}
          tint={tint}
          role={mode}
          selected={Boolean(selectedIds?.includes(member.id))}
          surface={palette.surface}
          onPress={() => onToggle?.(member.id)}
        />
      );
    }),
  ];

  const groupRole = mode === "radio" ? "radiogroup" : undefined;

  if (layout === "wrap" || trailingCaption) {
    return createElement(
      View,
      {
        accessibilityLabel: `Members of ${groupName}`,
        accessibilityRole: groupRole,
        style: [layout === "wrap" ? styles.wrap : styles.captionRow, style],
      },
      items,
      trailingCaption ? (
        <View key="caption" style={layout === "wrap" ? styles.wrapCaption : styles.caption}>
          <NativeText maxFontSizeMultiplier={1.4} style={styles.captionLabel}>{trailingCaption}</NativeText>
        </View>
      ) : null,
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={`Members of ${groupName}`}
      accessibilityRole={groupRole}
      contentContainerStyle={styles.scrollContent}
      style={style}
    >
      {items}
    </ScrollView>
  );
}

function ItemLabel({ text, strong }: { text: string; strong?: boolean }) {
  return (
    <NativeText numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.label, strong ? styles.labelStrong : null]}>{text}</NativeText>
  );
}

function StaticMember({ member, isYou, tint }: { member: Member; isYou: boolean; tint: string }) {
  const spoken = `${isYou ? "You" : member.name}${member.email ? `, ${member.email}` : ""}`;
  return (
    <View style={styles.item} accessible accessibilityLabel={spoken}>
      <View style={styles.disc}>
        {isYou ? (
          <View style={styles.youRing}>
            <Avatar name={member.name} uri={member.avatarUrl} size="row" shape="circle" tint={tint} accent={colors.violetStrong} />
          </View>
        ) : (
          <Avatar name={member.name} uri={member.avatarUrl} size="row" shape="circle" tint={tint} accent={colors.violetStrong} />
        )}
      </View>
      <ItemLabel text={isYou ? "You" : firstName(member.name) || member.name} strong={isYou} />
    </View>
  );
}

type SelectableMemberProps = {
  member: Member;
  isYou: boolean;
  tint: string;
  role: "radio" | "checkbox";
  selected: boolean;
  surface: string;
  onPress: () => void;
};

function SelectableMember({ member, isYou, tint, role, selected, surface, onPress }: SelectableMemberProps) {
  const name = isYou ? "You" : member.name;
  return (
    <Touch
      onPress={onPress}
      haptic
      pressedScale={0.96}
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={name}
      containerStyle={styles.item}
      pressableStyle={styles.itemPressable}
    >
      <View style={styles.disc}>
        <Avatar name={member.name} uri={member.avatarUrl} size="row" shape="circle" tint={tint} accent={colors.violetStrong} />
        <View pointerEvents="none" style={[styles.selectRing, selected ? styles.selectRingOn : styles.selectRingOff]} />
        <View pointerEvents="none" style={[styles.badge, selected ? styles.badgeOn : [styles.badgeOff, { backgroundColor: surface }]]}>
          <Icon name={selected ? "check" : "plus"} size={11} color={selected ? colors.white : colors.slate} />
        </View>
      </View>
      <ItemLabel text={isYou ? "You" : firstName(member.name) || member.name} strong={isYou || selected} />
    </Touch>
  );
}

/** Dashed Invite circle: 64pt violetStrong dashed ring around a 52pt plum disc. Presses are ignored while inviting. */
export function InviteCircle({ name, onPress, inviting = false }: { name: string; onPress: () => void; inviting?: boolean }) {
  return (
    <Touch
      onPress={() => {
        if (!inviting) onPress();
      }}
      haptic
      pressedScale={0.94}
      accessibilityRole="button"
      accessibilityLabel={`Invite friends to ${name}`}
      accessibilityState={{ busy: inviting }}
      containerStyle={styles.item}
      pressableStyle={styles.itemPressable}
    >
      <View style={styles.disc}>
        <DashedOutline width={DISC} height={DISC} radius={DISC / 2} color={colors.violetStrong} strokeWidth={1.75} dashCount={24} />
        <View style={styles.inviteInner}>
          {inviting ? <Spinner tone="light" /> : <Icon name="user-plus" size={22} color={colors.white} />}
        </View>
      </View>
      <ItemLabel text="Invite" strong />
    </Touch>
  );
}

/** Loading placeholder: three static 56pt circles with 36×8 bars. No shimmer. */
export function MemberRowLoading({ style }: { style?: StyleProp<ViewStyle> }) {
  const { palette } = usePreferences();
  return (
    <View style={[styles.captionRow, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((key) => (
        <View key={key} style={styles.item}>
          <View style={styles.disc}>
            <View style={[styles.placeholderCircle, { backgroundColor: palette.surface }]} />
          </View>
          <View style={[styles.placeholderBar, { backgroundColor: palette.surface }]} />
        </View>
      ))}
    </View>
  );
}

/** No-groups row: a dashed "New group" circle and the caption "Friends you invite will show up here." */
export function MemberRowCreate({ onPress, style }: { onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.captionRow, style]}>
      <Touch
        onPress={onPress}
        haptic
        pressedScale={0.94}
        accessibilityRole="button"
        accessibilityLabel="New group"
        accessibilityHint="Create a group to invite friends"
        containerStyle={styles.item}
        pressableStyle={styles.itemPressable}
      >
        <View style={styles.disc}>
          <DashedOutline width={DISC} height={DISC} radius={DISC / 2} color={colors.violetStrong} strokeWidth={1.75} dashCount={24} />
          <Icon name="plus" size={22} color={colors.violetStrong} />
        </View>
        <ItemLabel text="New group" strong />
      </Touch>
      <View style={styles.caption}>
        <NativeText maxFontSizeMultiplier={1.4} style={styles.captionLabel}>Friends you invite will show up here.</NativeText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: SIDE_PAD,
    gap: GAP,
  },
  captionRow: {
    flexDirection: "row",
    paddingHorizontal: SIDE_PAD,
    gap: GAP,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: GAP,
    rowGap: ROW_GAP,
  },
  item: {
    width: ITEM_W,
    minHeight: ITEM_H,
  },
  itemPressable: {
    width: ITEM_W,
    minHeight: ITEM_H,
    alignItems: "center",
  },
  disc: {
    width: DISC,
    height: DISC,
    alignItems: "center",
    justifyContent: "center",
  },
  youRing: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    borderColor: colors.violet,
    alignItems: "center",
    justifyContent: "center",
  },
  selectRing: {
    position: "absolute",
    top: 0,
    left: 0,
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
  },
  selectRingOn: {
    borderWidth: 2.5,
    borderColor: colors.violet,
  },
  selectRingOff: {
    borderWidth: 1,
    borderColor: colors.line,
  },
  badge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeOn: {
    backgroundColor: colors.violet,
  },
  badgeOff: {
    borderWidth: 1,
    borderColor: colors.line,
  },
  inviteInner: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.plum,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    width: ITEM_W,
    marginTop: 8,
    textAlign: "center",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink,
  },
  labelStrong: {
    fontFamily: "Manrope_700Bold",
  },
  caption: {
    flex: 1,
    minWidth: 0,
    minHeight: DISC,
    justifyContent: "center",
  },
  wrapCaption: {
    flexBasis: "100%",
  },
  captionLabel: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 13,
    lineHeight: 18,
    color: colors.slate,
  },
  placeholderCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  placeholderBar: {
    alignSelf: "center",
    width: 36,
    height: 8,
    marginTop: 12,
    borderRadius: 4,
  },
});
