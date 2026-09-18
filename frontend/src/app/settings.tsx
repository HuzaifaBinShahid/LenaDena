import { useEffect, useState } from "react";
import { View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { Switch } from "@/components/ui/Switch";
import { Text } from "@/components/ui/Text";
import { TopTabs } from "@/components/ui/TopTabs";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { goToSignIn } from "@/features/auth/navigation";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { usePreferences } from "@/features/preferences/PreferencesProvider";
import { useAppLock } from "@/features/security/AppLockProvider";
import { authenticationFailureMessage, LOCK_DELAYS, lockDelayLabel, isLockDelay } from "@/features/security/lock-policy";
import { AppearancePicker } from "@/features/settings/AppearancePicker";
import { errorMessage } from "@/lib/api";
import { formatLongDate } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";

/** Where the dark account card meets the dark canvas (dark mode only). */
const SHELL_EDGE = "rgba(181,165,255,0.16)";

export default function SettingsScreen() {
  const { plan, updateProfile } = useLedger();
  const { configured, session, signOut } = useAuth();
  const { runWithoutLocking } = useAppLock();
  const toast = useToast();
  const { emailTone, setEmailTone, voiceLocale, setVoiceLocale } = usePreferences();
  const { colors: c, isDark } = useTheme();
  const [name, setName] = useState(plan.user.name);
  const [avatarUri, setAvatarUri] = useState<string | null>();
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const accountCreatedAt = plan.user.createdAt ?? session?.user.created_at;
  const visibleAvatar = avatarChanged ? avatarUri : plan.user.avatarUrl;

  useEffect(() => setName(plan.user.name), [plan.user.name]);

  const choosePhoto = () => runWithoutLocking(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.warning("Photo access needed", "Allow photo access in your phone settings to choose a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setAvatarUri(result.assets[0].uri);
      setAvatarChanged(true);
    }
  });

  const saveProfile = async () => {
    if (!name.trim()) {
      toast.warning("Add your name", "Friends need a name to recognize you by.");
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), ...(avatarChanged ? { avatarUri: avatarUri ?? null } : {}) });
      setAvatarChanged(false);
      toast.success("Profile updated", "Your name and photo now appear across LenaDena.");
    } catch (error) {
      toast.error("Couldn't update profile", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="Account" subtitle="Your identity, security and preferences" />
      <View className="gap-7">
        {/* The brand's dark shell in both themes; dark mode adds the hairline so it lifts off the canvas. */}
        <View className="overflow-hidden rounded-[26px] p-5" style={{ backgroundColor: c.shell, borderWidth: isDark ? 1 : 0, borderColor: SHELL_EDGE }}>
          <View className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10" />
          <View className="flex-row items-center gap-4">
            <Avatar name={name || plan.user.name} uri={visibleAvatar} size="lg" inverted />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-xl font-bold text-white">{plan.user.name}</Text>
              <Text numberOfLines={1} className="mt-1 text-xs text-white/65">{session?.user.email ?? plan.user.email}</Text>
              <View className="mt-3 self-start rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                <Text className="text-[10px] font-semibold text-white/80">{configured ? session ? "Signed in" : "Sign-in required" : "Local demo"}</Text>
              </View>
            </View>
          </View>
          <View className="mt-5 flex-row gap-2.5 border-t border-white/10 pt-4">
            <View className="flex-1"><Button label="Choose photo" icon="image" variant="glass" fullWidth onPress={choosePhoto} /></View>
            {visibleAvatar ? <Button label="Remove" icon="trash-2" variant="glass" onPress={() => { setAvatarUri(null); setAvatarChanged(true); }} /> : null}
          </View>
          {accountCreatedAt ? <Text className="mt-4 text-[11px] text-white/55">Member since {formatLongDate(accountCreatedAt.slice(0, 10))}</Text> : null}
        </View>

        <View className="gap-5 rounded-card border border-line bg-raised p-4">
          <View>
            <Text className="text-lg font-bold text-ink">Public profile</Text>
            <Text className="mt-1 text-xs leading-5 text-slate">This is how people recognize you in groups and payment reviews.</Text>
          </View>
          <Field label="Display name" required>
            <Input value={name} onChangeText={setName} placeholder="Your name" leadingIcon="user" autoCapitalize="words" />
          </Field>
          <Button label="Save profile" icon="check" fullWidth loading={saving} disabled={!name.trim()} onPress={saveProfile} />
          <Text className="text-[11px] leading-4 text-slate">Changing your name or photo never changes ownership of past records.</Text>
        </View>

        <SecuritySection />

        <AppearancePicker />

        <Field label="Email tone" hint="Humor never appears in disputes, errors or privacy messages.">
          <TopTabs
            tabs={[{ key: "friendly", label: "Friendly" }, { key: "cheeky", label: "Cheeky" }, { key: "chaos", label: "Chaos" }, { key: "quiet", label: "Quiet" }]}
            value={emailTone}
            onChange={setEmailTone}
          />
        </Field>

        <Field label="Voice language" hint="Use system or a BCP-47 locale installed on your phone, such as ur-PK, ar-SA, hi-IN or fr-FR.">
          <Input value={voiceLocale} onChangeText={setVoiceLocale} placeholder="system" leadingIcon="mic" autoCapitalize="none" autoCorrect={false} />
        </Field>

        <View className="rounded-card border border-line bg-raised p-5">
          <Text className="font-bold text-ink">Account records</Text>
          <Text className="mt-2 text-sm leading-5 text-slate">Expenses, payment claims, review decisions and fallback settlements are saved against your account with an audit trail.</Text>
        </View>

        {configured && !session ? <Button label="Sign in" icon="mail" fullWidth onPress={() => router.push("/auth")} /> : null}
        {session ? (
          <Button
            label="Sign out"
            icon="log-out"
            variant="secondary"
            fullWidth
            onPress={async () => {
              try {
                await signOut();
                goToSignIn();
              } catch (error) {
                toast.error("Couldn't sign out", errorMessage(error));
              }
            }}
          />
        ) : null}
        <Button label="Export my data" icon="download" variant="secondary" fullWidth onPress={() => toast.info("Export isn't available yet", "Data export arrives with the production email worker.")} />
        <Button label="Delete account" icon="trash-2" variant="danger" fullWidth onPress={() => toast.info("Deletion isn't available yet", "Account deletion needs a confirmed production backend first.")} />
      </View>
    </Screen>
  );
}

function SecuritySection() {
  const toast = useToast();
  const { supported, capability, preference, setEnabled, setLockDelay, refreshCapability } = useAppLock();
  const { colors: c } = useTheme();
  const [busy, setBusy] = useState(false);
  const label = capability?.label ?? "Face ID";
  const glyph = capability?.kind === "face" ? "face-id" : "finger-print";

  useEffect(() => {
    // Biometrics may have been enrolled in system settings since launch.
    void refreshCapability();
  }, [refreshCapability]);

  if (!supported) return null;

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      const result = await setEnabled(next);
      if (result.ok) {
        toast.success(next ? `${label} is on` : `${label} is off`, next ? "LenaDena locks when you leave and unlocks with your face or fingerprint." : "LenaDena opens without a biometric check.");
        return;
      }
      if (result.reason === "cancelled") return;
      if (result.reason === "unavailable") {
        toast.warning(`${label} isn't set up`, `Add ${label} in your phone settings, then try again.`);
        return;
      }
      const failure = authenticationFailureMessage(result.error, label);
      toast.show({ title: failure.title, message: failure.message, tone: failure.tone });
    } catch (error) {
      toast.error("Couldn't change app lock", errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const hint = capability?.faceIdNeedsDevelopmentBuild
    ? "Expo Go can't use Face ID, so iOS asks for your passcode instead. Face ID works in a development build."
    : capability && !capability.available && !preference.enabled
      ? capability.hasHardware
        ? `Add ${label} in your phone settings to turn this on.`
        : "This device has no face or fingerprint sensor."
      : null;

  return (
    <View className="gap-2.5">
      <Text className="px-1 text-[11px] font-bold uppercase tracking-[1.2px] text-slate">Security</Text>
      <View className="overflow-hidden rounded-card border border-line bg-raised">
        <View className="flex-row items-center gap-3.5 px-4 py-3.5">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-violet-soft">
            <Icon name={glyph} size={22} color={c.violet} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-[15px] font-bold text-ink">Unlock with {label}</Text>
            <Text className="mt-0.5 text-xs leading-4 text-slate">Keep balances private when you leave the app.</Text>
          </View>
          <Switch
            value={preference.enabled}
            onValueChange={(next) => void toggle(next)}
            busy={busy}
            disabled={!preference.enabled && capability !== null && !capability.available}
            accessibilityLabel={`Unlock with ${label}`}
          />
        </View>
        {preference.enabled ? (
          <View className="gap-2.5 border-t border-line px-4 pb-4 pt-3.5">
            <Text className="text-sm font-bold text-ink">Require {label}</Text>
            <TopTabs
              tabs={LOCK_DELAYS.map((delay) => ({ key: String(delay), label: lockDelayLabel(delay) }))}
              value={String(preference.lockAfterMs)}
              onChange={(value) => {
                const delay = Number(value);
                if (isLockDelay(delay)) void setLockDelay(delay);
              }}
            />
          </View>
        ) : null}
      </View>
      {hint ? <Text className="px-1 text-xs leading-4 text-slate">{hint}</Text> : null}
    </View>
  );
}
