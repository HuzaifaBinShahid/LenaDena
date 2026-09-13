import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { TopTabs } from "@/components/ui/TopTabs";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { usePreferences } from "@/features/preferences/PreferencesProvider";
import { formatLongDate } from "@/lib/format";

export default function SettingsScreen() {
  const { plan, updateProfile } = useLedger();
  const { configured, session, signOut } = useAuth();
  const { theme, setTheme, emailTone, setEmailTone, voiceLocale, setVoiceLocale, palette } = usePreferences();
  const [name, setName] = useState(plan.user.name);
  const [avatarUri, setAvatarUri] = useState<string | null>();
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const accountCreatedAt = plan.user.createdAt ?? session?.user.created_at;
  const visibleAvatar = avatarChanged ? avatarUri : plan.user.avatarUrl;

  useEffect(() => setName(plan.user.name), [plan.user.name]);

  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photo access needed", "Allow photo access to choose a profile picture.");
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
  };

  const saveProfile = async () => {
    if (!name.trim()) {
      Alert.alert("Add your name", "Your friends need a name to recognize you by.");
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), ...(avatarChanged ? { avatarUri: avatarUri ?? null } : {}) });
      setAvatarChanged(false);
      Alert.alert("Profile updated", "Your name and photo now appear consistently across LenaDena.");
    } catch (error) {
      Alert.alert("Could not update profile", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="Account" subtitle="Your identity, sign-in and preferences" />
      <View className="gap-7">
        <View className="overflow-hidden rounded-[26px] p-5" style={{ backgroundColor: palette.header }}>
          <View className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-white/10" />
          <View className="flex-row items-center gap-4">
            <Avatar name={name || plan.user.name} uri={visibleAvatar} size="lg" inverted />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-xl font-bold text-white">{plan.user.name}</Text>
              <Text numberOfLines={1} className="mt-1 text-xs text-white/65">{session?.user.email ?? plan.user.email}</Text>
              <View className="mt-3 self-start rounded-full border border-white/15 bg-white/10 px-3 py-1.5">
                <Text className="text-[10px] font-semibold text-mint">{configured ? session ? "Verified account" : "Sign-in required" : "Local demo"}</Text>
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
          <Text className="text-[11px] leading-4 text-slate">Changing your name or photo never changes ownership of past records. History stays tied to your verified account.</Text>
        </View>

        <Field label="Theme" hint="Dusk blends a rich header into a calm working surface.">
          <TopTabs
            tabs={[{ key: "dusk", label: "Dusk" }, { key: "cloud", label: "Cloud" }, { key: "midnight", label: "Midnight" }, { key: "system", label: "System" }]}
            value={theme}
            onChange={setTheme}
          />
        </Field>

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

        {configured && !session ? <Button label="Sign in with email" icon="mail" fullWidth onPress={() => router.push("/auth")} /> : null}
        {session ? <Button label="Sign out" icon="log-out" variant="secondary" fullWidth onPress={() => signOut()} /> : null}
        <Button label="Export my data" icon="download" variant="secondary" fullWidth onPress={() => Alert.alert("Export requested", "A production worker will email the archive when the Supabase environment is connected.")} />
        <Button label="Delete account" icon="trash-2" variant="danger" fullWidth onPress={() => Alert.alert("Not performed", "Account deletion requires explicit confirmation and a connected production environment.")} />
      </View>
    </Screen>
  );
}
