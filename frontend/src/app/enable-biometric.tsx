import { useState } from "react";
import { View } from "react-native";
import { Redirect, router, type Href } from "expo-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { describeAuthError } from "@/features/auth/authErrors";
import { PASSWORD_MAX_BYTES } from "@/features/auth/password";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { useAppLock } from "@/features/security/AppLockProvider";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Turning on biometric sign-in needs the account's password once: it is checked with Supabase, then locked behind the
 * phone's biometrics so Face ID or a fingerprint can supply it next time.
 */
export default function EnableBiometricScreen() {
  const { session, confirmPassword } = useAuth();
  const { capability, enableBiometricSignIn } = useAppLock();
  const { plan } = useLedger();
  const { colors: c } = useTheme();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const label = capability?.label ?? "Face ID";
  const glyph = capability?.kind === "face" ? "face-id" : "finger-print";

  const email = session?.user.email;
  if (!session || !email) return <Redirect href={"/auth" as Href} />;

  const problem = password.length === 0 ? "Enter your password." : undefined;

  const save = async () => {
    setSubmitted(true);
    if (problem || saving) return;
    setSaving(true);
    try {
      await confirmPassword({ email, password });
      const result = await enableBiometricSignIn({ email, name: plan.user.name, password });
      if (result.ok) {
        toast.success(`${label} sign-in is on`, result.protection === "gated" ? "Your phone can't tie it to biometrics alone, so its passcode also works here." : "Next time, tap the button on the sign-in screen instead of typing your password.");
        router.back();
        return;
      }
      if (result.reason === "cancelled") return;
      if (result.reason === "unavailable") {
        toast.warning(`${label} isn't set up`, `Add ${label} in your phone settings, then try again.`);
        return;
      }
      toast.error(`Couldn't turn on ${label}`, result.error ?? "Your phone wouldn't store the password securely. Try again.");
    } catch (error) {
      const copy = describeAuthError(error, "sign_in");
      toast.error(copy.kind === "invalid_credentials" ? "That password is wrong" : copy.title, copy.kind === "invalid_credentials" ? "Check it and try again." : copy.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <PageHeader title={`Sign in with ${label}`} subtitle={email} />
      <View className="gap-5">
        <View className="flex-row items-center gap-3.5 rounded-card border border-line bg-raised p-4">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-violet-soft">
            <Icon name={glyph} size={22} color={c.violet} />
          </View>
          <Text className="min-w-0 flex-1 text-[13px] leading-5 text-slate">
            Your password stays locked in your phone's secure storage and is released only after {label} confirms it's you. (A phone that can't bind it to {label} alone also accepts its passcode, and says so.) If you add a new {capability?.kind === "face" ? "face" : "fingerprint"} to your phone, this switches off and you sign in with your password once.
          </Text>
        </View>
        <Field label="Your password" error={submitted ? problem : undefined}>
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            maxLength={PASSWORD_MAX_BYTES}
            leadingIcon="lock-closed"
            trailingIcon={show ? "eye-off" : "eye"}
            onTrailingPress={() => setShow((shown) => !shown)}
            trailingActionLabel={show ? "Hide password" : "Show password"}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            accessibilityLabel="Password"
            invalid={submitted && Boolean(problem)}
            returnKeyType="go"
            onSubmitEditing={() => void save()}
          />
        </Field>
        <Button label={`Turn on ${label}`} icon={glyph} fullWidth loading={saving} onPress={save} />
      </View>
    </Screen>
  );
}
