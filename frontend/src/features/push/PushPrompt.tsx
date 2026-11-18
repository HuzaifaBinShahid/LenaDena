import { useEffect, useState } from "react";
import { View } from "react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { errorMessage } from "@/lib/api";
import { useTheme } from "@/theme/ThemeProvider";
import { enablePush, isPushOn, markAskedAboutPush, PUSH_AVAILABLE, pushPermissionDenied, wasAskedAboutPush } from "./pushDevice";
import { shouldOfferPushPrompt } from "./pushRules";

/** Let the home screen settle (splash, first paint, the banner) before a sheet slides over it. */
const SHOW_DELAY_MS = 1500;

/**
 * Asks once, on the home screen, whether to switch on notifications: "Get reminders from friends?". Most people never
 * find the switch in Settings, so without this a friend's reminder would reach almost nobody. The phone's own
 * permission question only appears after "Turn on". "Not now" is remembered for this account on this phone and
 * Settings keeps the switch; nothing is ever switched on without a tap here or in Settings.
 *
 * `enabled` is false until the person's data has loaded, so the sheet never covers a loading or offline screen.
 */
export function PushPrompt({ enabled }: { enabled: boolean }) {
  const toast = useToast();
  const { session } = useAuth();
  const { colors: c } = useTheme();
  const userId = session?.user.id;
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!PUSH_AVAILABLE || !enabled || !userId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const [alreadyOn, alreadyAsked, blocked] = await Promise.all([isPushOn(userId), wasAskedAboutPush(userId), pushPermissionDenied()]);
      if (cancelled) return;
      if (!shouldOfferPushPrompt({ available: PUSH_AVAILABLE, signedIn: true, alreadyOn, alreadyAsked, blockedInPhoneSettings: blocked })) return;
      timer = setTimeout(() => { if (!cancelled) setVisible(true); }, SHOW_DELAY_MS);
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, userId]);

  if (!PUSH_AVAILABLE || !userId) return null;

  const dismiss = () => {
    setVisible(false);
    void markAskedAboutPush(userId);
  };

  const turnOn = async () => {
    setBusy(true);
    try {
      const result = await enablePush(userId);
      if (result.ok) {
        toast.success("Reminders are on", "You'll get a notification when a friend reminds you, pays you, or invites you to a group.");
      } else if (result.reason === "denied") {
        toast.warning("Notifications are blocked", "Allow notifications for LenaDena in your phone's settings, then switch reminders on in Settings.");
      } else if (result.reason === "server") {
        toast.info("Not switched on yet", "Notifications aren't switched on for LenaDena's server yet. Try again after the next update.");
      } else {
        // A network or phone hiccup: keep the sheet so a second tap can try again.
        toast.error("Couldn't turn reminders on", errorMessage(result.error, "This phone couldn't get a notification token. Check your connection and try again."));
        return;
      }
      dismiss();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={dismiss}
      title="Get reminders from friends?"
      header={
        <View className="flex-row items-start gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-violet-soft">
            <Icon name="bell" size={22} color={c.violet} />
          </View>
          <View className="flex-1">
            <Text accessibilityRole="header" className="text-[22px] font-bold tracking-tight text-ink">Get reminders from friends?</Text>
            <Text className="mt-1 text-[13px] leading-5 text-slate">We'll send a notification when a friend reminds you to settle up, says they've paid you, or invites you to a group.</Text>
          </View>
        </View>
      }
    >
      <View className="gap-3">
        <Text className="text-xs leading-4 text-slate">A notification shows the amount and the group, so anyone looking at your lock screen can see them. You can turn this off in Settings any time.</Text>
        <Button label="Turn on" fullWidth loading={busy} onPress={turnOn} />
        <View className="items-center">
          <Button label="Not now" variant="ghost" disabled={busy} onPress={dismiss} />
        </View>
      </View>
    </BottomSheet>
  );
}
