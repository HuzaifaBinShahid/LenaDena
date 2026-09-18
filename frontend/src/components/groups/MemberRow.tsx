import { createElement, useMemo } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { ScrollView, Text as NativeText, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { DashedOutline } from "@/components/ui/DashedOutline";
import { Icon } from "@/components/ui/Icon";
import { Spinner } from "@/components/ui/Spinner";
import { Touch } from "@/components/ui/Touch";
import type { Group, Member } from "@/features/ledger/types";
import { firstName } from "@/lib/format";
import type { Palette } from "@/theme/palettes";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

const ITEM_W = 64;
const ITEM_H = 88;
const DISC = 64;
const GAP = 22;
const ROW_GAP = 14;
const SIDE_PAD = 20;
/** Selection badge: a violet (or quiet) disc inside a ring cut from the surface behind the row. */
const BADGE = 24;
const BADGE_INNER = 20;

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
  /** What the row sits on: the screen canvas (default) or a raised card. The selection badge's ring is cut from it. */
  surface?: "canvas" | "raised";
  style?: StyleProp<ViewStyle>;
};

function memberTint(id: string, c: Palette, isDark: boolean): string {
  // The last tint is the raised white in light. In dark, raised would vanish inside raised cards, so it lifts to surface.
  const fallback = isDark ? c.surface : c.raised;
  const tints = [c.violetSoft, c.limeSoft, c.goldSoft, fallback];
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return tints[hash % tints.length] ?? fallback;
}

/** Initials on the tinted discs: violetStrong on light pastels, lavender on the deep dark tints. */
function initialsColor(isDark: boolean) {
  return isDark ? colors.lavender : colors.violetStrong;
}

function byName(a: Member, b: Member) {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/** Invite, You, then everyone else by name (§2.24). Radio mode lists only the other members. */
export function MemberRow({ group, currentUserId, onInvite, inviting = false, mode, selectedIds, onToggle, layout = "scroll", caption, surface = "canvas", style }: MemberRowProps) {
  const styles = useStyles();
  const { colors: c, isDark } = useTheme();
  const backdrop = surface === "raised" ? c.raised : c.canvas;
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
      const tint = memberTint(member.id, c, isDark);
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
          backdrop={backdrop}
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

/** default: ink. selected: the name picks up the selection violet. quiet: an unselected option recedes to slate. */
type LabelTone = "default" | "selected" | "quiet";

function ItemLabel({ text, strong, tone = "default" }: { text: string; strong?: boolean; tone?: LabelTone }) {
  const styles = useStyles();
  return (
    <NativeText
      numberOfLines={1}
      maxFontSizeMultiplier={1.3}
      style={[styles.label, strong ? styles.labelStrong : null, tone === "selected" ? styles.labelSelected : tone === "quiet" ? styles.labelQuiet : null]}
    >
      {text}
    </NativeText>
  );
}

function StaticMember({ member, isYou, tint }: { member: Member; isYou: boolean; tint: string }) {
  const styles = useStyles();
  const { isDark } = useTheme();
  const spoken = `${isYou ? "You" : member.name}${member.email ? `, ${member.email}` : ""}`;
  const avatar = <Avatar name={member.name} uri={member.avatarUrl} size="row" shape="circle" tint={tint} accent={initialsColor(isDark)} />;
  return (
    <View style={styles.item} accessible accessibilityLabel={spoken}>
      <View style={styles.disc}>
        {isYou ? <View style={styles.youRing}>{avatar}</View> : avatar}
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
  /** The surface behind the row: the badge's cut-out ring and the unselected badge fill. */
  backdrop: string;
  onPress: () => void;
};

/**
 * Selected: a solid violet ring, a filled violet check badge and the name in violet, bold.
 * Unselected: a hairline ring, a hollow "+" badge and a slate name, so the chosen people stand out in both themes.
 */
function SelectableMember({ member, isYou, tint, role, selected, backdrop, onPress }: SelectableMemberProps) {
  const styles = useStyles();
  const { colors: c, isDark } = useTheme();
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
        <Avatar name={member.name} uri={member.avatarUrl} size="row" shape="circle" tint={tint} accent={initialsColor(isDark)} />
        <View pointerEvents="none" style={[styles.selectRing, selected ? styles.selectRingOn : styles.selectRingOff]} />
        <View pointerEvents="none" style={[styles.badge, { backgroundColor: backdrop }]}>
          <View style={[styles.badgeInner, selected ? styles.badgeOn : [styles.badgeOff, { backgroundColor: backdrop }]]}>
            {/* White on the violet fill in both themes. */}
            <Icon name={selected ? "check" : "plus"} size={selected ? 13 : 11} color={selected ? colors.white : c.slate} />
          </View>
        </View>
      </View>
      <ItemLabel text={isYou ? "You" : firstName(member.name) || member.name} strong={isYou || selected} tone={selected ? "selected" : "quiet"} />
    </Touch>
  );
}

/** Dashed Invite circle: 64pt dashed ring around a 52pt plum disc (violet in dark). Presses are ignored while inviting. */
export function InviteCircle({ name, onPress, inviting = false }: { name: string; onPress: () => void; inviting?: boolean }) {
  const styles = useStyles();
  const { isDark } = useTheme();
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
        <DashedOutline width={DISC} height={DISC} radius={DISC / 2} color={dashColor(isDark)} strokeWidth={1.75} dashCount={24} />
        <View style={styles.inviteInner}>
          {inviting ? <Spinner tone="light" /> : <Icon name="user-plus" size={22} color={colors.white} />}
        </View>
      </View>
      <ItemLabel text="Invite" strong />
    </Touch>
  );
}

/** Dashed outlines: violetStrong on light surfaces; it sinks into the night canvas, so dark uses lavender. */
function dashColor(isDark: boolean) {
  return isDark ? colors.lavender : colors.violetStrong;
}

/** Loading placeholder: three static 56pt circles with 36×8 bars. No shimmer. */
export function MemberRowLoading({ style }: { style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return (
    <View style={[styles.captionRow, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((key) => (
        <View key={key} style={styles.item}>
          <View style={styles.disc}>
            <View style={styles.placeholderCircle} />
          </View>
          <View style={styles.placeholderBar} />
        </View>
      ))}
    </View>
  );
}

/** No-groups row: a dashed "New group" circle and the caption "Friends you invite will show up here." */
export function MemberRowCreate({ onPress, style }: { onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const { isDark } = useTheme();
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
          <DashedOutline width={DISC} height={DISC} radius={DISC / 2} color={dashColor(isDark)} strokeWidth={1.75} dashCount={24} />
          <Icon name="plus" size={22} color={dashColor(isDark)} />
        </View>
        <ItemLabel text="New group" strong />
      </Touch>
      <View style={styles.caption}>
        <NativeText maxFontSizeMultiplier={1.4} style={styles.captionLabel}>Friends you invite will show up here.</NativeText>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c, { isDark }) => ({
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
    borderColor: c.violet,
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
    borderWidth: 3,
    borderColor: c.violet,
  },
  selectRingOff: {
    borderWidth: 1,
    borderColor: c.line,
  },
  // Centred on the ring at 45°, slightly outside the 64pt disc.
  badge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeInner: {
    width: BADGE_INNER,
    height: BADGE_INNER,
    borderRadius: BADGE_INNER / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeOn: {
    backgroundColor: c.violet,
  },
  badgeOff: {
    borderWidth: 1,
    borderColor: c.line,
  },
  inviteInner: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 52,
    height: 52,
    borderRadius: 26,
    // Plum is the strongest disc on the light canvas; in dark it would vanish, so the invite takes the violet fill.
    backgroundColor: isDark ? c.violet : c.plum,
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
    color: c.ink,
  },
  labelStrong: {
    fontFamily: "Manrope_700Bold",
  },
  labelSelected: {
    // violetStrong keeps 8:1 on the light canvas; lavender keeps 8:1 on the dark one.
    color: isDark ? colors.lavender : colors.violetStrong,
  },
  labelQuiet: {
    color: c.slate,
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
    color: c.slate,
  },
  placeholderCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: c.raised,
  },
  placeholderBar: {
    alignSelf: "center",
    width: 36,
    height: 8,
    marginTop: 12,
    borderRadius: 4,
    backgroundColor: c.raised,
  },
}));
