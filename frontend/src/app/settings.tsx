import { Alert, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { router } from "expo-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Screen } from "@/components/ui/Screen";
import { TopTabs } from "@/components/ui/TopTabs";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { usePreferences } from "@/features/preferences/PreferencesProvider";

export default function SettingsScreen() {
  const { plan } = useLedger();
  const { configured, session, signOut } = useAuth();
  const { theme, setTheme, emailTone, setEmailTone, voiceLocale, setVoiceLocale, palette } = usePreferences();

  return (
    <Screen>
      <PageHeader title="You" subtitle="Your preferences beat group defaults" />
      <View className="gap-7">
        <View className="rounded-card bg-ink p-5" style={{ backgroundColor: palette.header }}>
          <Text className="text-2xl font-bold text-white">{plan.user.name}</Text>
          <Text className="mt-1 text-sm text-white/60">{session?.user.email ?? plan.user.email}</Text>
          <Text className="mt-4 text-xs font-semibold text-mint">{configured ? session ? "Supabase account connected" : "Sign in available" : "Local demo identity"}</Text>
        </View>

        <Field label="Theme" hint="Dusk Blend mixes an ink header with warm working surfaces.">
          <TopTabs
            tabs={[{ key: "dusk", label: "Dusk" }, { key: "cloud", label: "Cloud" }, { key: "midnight", label: "Midnight" }, { key: "system", label: "System" }]}
            value={theme}
            onChange={setTheme}
          />
        </Field>

        <Field label="Email tone" hint="Humor never appears in errors, disputes, or privacy messages.">
          <TopTabs
            tabs={[{ key: "friendly", label: "Friendly" }, { key: "cheeky", label: "Cheeky" }, { key: "chaos", label: "Chaos" }, { key: "quiet", label: "Quiet" }]}
            value={emailTone}
            onChange={setEmailTone}
          />
        </Field>

        <Field label="Voice language" hint="Use system or any BCP-47 locale installed on your phone, such as ur-PK, ar-SA, hi-IN, or fr-FR.">
          <Input value={voiceLocale} onChangeText={setVoiceLocale} placeholder="system" leadingIcon="mic" autoCapitalize="none" autoCorrect={false} />
        </Field>

        <View className="rounded-card border border-line bg-raised p-5">
          <Text className="font-bold text-ink">Reminder controls</Text>
          <Text className="mt-2 text-sm leading-5 text-slate">Automatic reminders pause while a payment is under review. Manual nudges have a 24-hour cooldown, and every message includes a mute path.</Text>
        </View>

        {configured && !session ? <Button label="Sign in with email" icon="mail" fullWidth onPress={() => router.push("/auth")} /> : null}
        {session ? <Button label="Sign out" icon="log-out" variant="secondary" fullWidth onPress={() => signOut()} /> : null}
        <Button label="Export my data" icon="download" variant="secondary" fullWidth onPress={() => Alert.alert("Export requested", "A production worker will email the completed archive when the Supabase environment is connected.")} />
        <Button label="Delete account" icon="trash-2" variant="danger" fullWidth onPress={() => Alert.alert("Not performed", "Account deletion requires explicit confirmation and a connected production environment.")} />
      </View>
    </Screen>
  );
}
