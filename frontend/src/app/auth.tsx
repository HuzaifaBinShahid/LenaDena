import { useState } from "react";
import { Alert, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { router, useLocalSearchParams } from "expo-router";
import { BrandMark } from "@/components/brand/BrandMark";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { useAuth } from "@/features/auth/AuthProvider";

export default function AuthScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { configured, sendMagicLink } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      Alert.alert("Check your details", "Enter your name and a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const redirectTo = next?.startsWith("/invite/") ? `oweyaar://${next.slice(1)}` : "oweyaar://";
      await sendMagicLink(email.trim().toLowerCase(), name.trim(), redirectTo);
      setSent(true);
    } catch (error) {
      Alert.alert("Could not send link", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View className="pt-10"><BrandMark size="md" /></View>
      <View className="mt-14">
        <Text className="text-xs font-semibold uppercase tracking-[1.6px] text-violet">Your shared tab, simplified</Text>
        <Text className="mt-3 text-[34px] font-bold leading-10 tracking-tight text-ink">Join your people.</Text>
        <Text className="mt-3 text-[15px] leading-6 text-slate">Sign in with a one-time email link. No password, no friction.</Text>
        <View className="mt-9 gap-5">
          <Field label="Name" required>
            <Input value={name} onChangeText={setName} autoCapitalize="words" placeholder="Huzaifa" leadingIcon="user" />
          </Field>
          <Field label="Email" required>
            <Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="you@example.com" leadingIcon="mail" />
          </Field>
          <Button label={sent ? "Send another link" : "Email me a sign-in link"} icon="arrow-right" iconSide="right" fullWidth size="lg" loading={loading} disabled={!configured} onPress={submit} />
          {sent ? <Text className="rounded-2xl bg-mint-soft p-4 text-sm font-semibold leading-5 text-mint">Link sent. Open it on this device to return to OweYaar.</Text> : null}
          {!configured ? <Text className="rounded-2xl bg-gold-soft p-4 text-sm leading-5 text-ink">Supabase is not configured, so the app is running with the demo identity.</Text> : null}
          <Button label="Continue to demo" variant="ghost" fullWidth onPress={() => router.replace("/")} />
        </View>
      </View>
    </Screen>
  );
}
