import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { Icon } from "@/components/ui/Icon";
import { Switch } from "@/components/ui/Switch";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { errorMessage } from "@/lib/api";
import { useTheme } from "@/theme/ThemeProvider";
import { disablePush, enablePush, isPushOn, PUSH_AVAILABLE, pushPermissionDenied } from "./pushDevice";

/** Settings: "Reminders from friends". Off until the person turns it on; only then does the phone ask for permission. */
export function NotificationsSection() {
  const toast = useToast();
  const { session } = useAuth();
  const { colors: c } = useTheme();
  const userId = session?.user.id;
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!PUSH_AVAILABLE || !userId) return;
    void isPushOn(userId).then(setOn);
    void pushPermissionDenied().then(setBlocked);
  }, [userId]);

  if (!PUSH_AVAILABLE || !userId) return null;

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      if (!next) {
        await disablePush(userId);
        setOn(false);
        toast.success("Reminders are off", "This phone won't get reminders, payment updates or group invitations.");
        return;
      }
      const result = await enablePush(userId);
      if (result.ok) {
        setOn(true);
        setBlocked(false);
        toast.success("Reminders are on", "You'll get a notification when a friend reminds you, pays you, or invites you to a group.");
        return;
      }
      if (result.reason === "denied") {
        setBlocked(await pushPermissionDenied());
        toast.warning("Notifications are blocked", "Allow notifications for LenaDena in your phone's settings, then try again.");
      } else if (result.reason === "server") {
        toast.info("Not switched on yet", "Notifications aren't switched on for LenaDena's server yet. Try again after the next update.");
      } else {
        toast.error("Couldn't turn reminders on", errorMessage(result.error, "This phone couldn't get a notification token. Check your connection and try again."));
      }
    } catch (error) {
      toast.error("Couldn't change reminders", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="gap-2.5">
      <Text className="px-1 text-[11px] font-bold uppercase tracking-[1.2px] text-slate">Notifications</Text>
      <View className="overflow-hidden rounded-card border border-line bg-raised">
        <View className="flex-row items-center gap-3.5 px-4 py-3.5">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-violet-soft">
            <Icon name="bell" size={22} color={c.violet} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-[15px] font-bold text-ink">Reminders from friends</Text>
            <Text className="mt-0.5 text-xs leading-4 text-slate">A notification when a friend reminds you to settle up, says they have paid you, or invites you to a group.</Text>
          </View>
          <Switch value={on} onValueChange={(next) => void toggle(next)} busy={busy} accessibilityLabel="Reminders from friends" />
        </View>
      </View>
      {blocked && !on ? (
        <Text className="px-1 text-xs leading-4 text-slate" onPress={() => void Linking.openSettings()}>
          Notifications are blocked for LenaDena in your phone's settings. Tap here to open them.
        </Text>
      ) : null}
      <Text className="px-1 text-xs leading-4 text-slate">The notification shows the amount and the group, so anyone looking at your lock screen can see them. Turn it off here any time.</Text>
    </View>
  );
}
