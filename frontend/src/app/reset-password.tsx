import { useRef, useState } from "react";
import type { TextInput } from "react-native";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, router, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { BrandMark } from "@/components/brand/BrandMark";
import { SpaceBackdrop } from "@/components/brand/SpaceBackdrop";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { describeAuthError } from "@/features/auth/authErrors";
import { PASSWORD_HINT, PASSWORD_MAX_BYTES, PASSWORDS_DIFFER, passwordError } from "@/features/auth/password";
import { goToSignIn } from "@/features/auth/navigation";
import { useAppLock } from "@/features/security/AppLockProvider";
import { colors } from "@/theme/tokens";

/** Where a password-reset email lands: the link has already signed the person in, so all that is left is the new password. */
export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { session, ready, recovering, verifyingLink, setNewPassword } = useAuth();
  const { updateBiometricPassword } = useAppLock();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const confirmInput = useRef<TextInput>(null);

  const passwordProblem = passwordError(password);
  const confirmProblem = confirm !== password ? PASSWORDS_DIFFER : undefined;

  // Signed in without a reset in progress (someone typed the address): nothing to do here.
  if (ready && !verifyingLink && !recovering && session) return <Redirect href={"/" as Href} />;

  const save = async () => {
    setSubmitted(true);
    if (passwordProblem || confirmProblem || saving) return;
    setSaving(true);
    try {
      await setNewPassword(password);
      const address = session?.user.email;
      if (address) await updateBiometricPassword(address, password);
      toast.success("Password changed", "You're signed in with your new password.");
      router.replace("/" as Href);
    } catch (error) {
      const copy = describeAuthError(error, "update");
      toast.error(copy.title, copy.message);
    } finally {
      setSaving(false);
    }
  };

  const waiting = !ready || verifyingLink;
  const expired = !waiting && !recovering && !session;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SpaceBackdrop fit="top" />
      <KeyboardAwareScrollView
        style={styles.fill}
        bottomOffset={16}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <BrandMark size="sm" tone="light" />
        </View>
        <View style={styles.spacer} />

        {waiting ? (
          <View style={styles.center} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.lavender} />
            <Text className="mt-3 text-[13px] font-semibold text-white/80">Checking your link…</Text>
          </View>
        ) : expired ? (
          <View>
            <Text className="text-[34px] font-extrabold uppercase leading-[38px] text-white" accessibilityRole="header">Link expired</Text>
            <Text className="mt-4 text-[13px] font-semibold leading-[19px] text-white/85">
              Reset links work once and only for a short time. Ask for a new one from the sign-in screen, and open it on this phone.
            </Text>
            <View style={styles.fields}>
              <Button label="Back to sign in" variant="gradient" size="lg" fullWidth onPress={goToSignIn} />
            </View>
          </View>
        ) : (
          <View>
            <Text className="text-[34px] font-extrabold uppercase leading-[38px] text-white" accessibilityRole="header">New password</Text>
            <Text className="mt-4 text-[13px] font-semibold text-white/85">Choose a password you don't use anywhere else.</Text>
            <View style={styles.fields}>
              <Field appearance="dark" error={submitted ? passwordProblem : undefined} hint={PASSWORD_HINT}>
                <Input
                  appearance="dark"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="New password"
                  maxLength={PASSWORD_MAX_BYTES}
                  leadingIcon="lock-closed"
                  trailingIcon={show ? "eye-off" : "eye"}
                  onTrailingPress={() => setShow((shown) => !shown)}
                  trailingActionLabel={show ? "Hide password" : "Show password"}
                  secureTextEntry={!show}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  passwordRules="minlength: 8; required: lower; required: digit; maxlength: 72;"
                  accessibilityLabel="New password"
                  invalid={submitted && Boolean(passwordProblem)}
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => confirmInput.current?.focus()}
                />
              </Field>
              <Field appearance="dark" error={submitted ? confirmProblem : undefined}>
                <Input
                  ref={confirmInput}
                  appearance="dark"
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="Type it again"
                  maxLength={PASSWORD_MAX_BYTES}
                  leadingIcon="lock-closed"
                  secureTextEntry={!show}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  accessibilityLabel="Confirm new password"
                  invalid={submitted && Boolean(confirmProblem)}
                  returnKeyType="go"
                  onSubmitEditing={() => void save()}
                />
              </Field>
              <Button label="Save password" variant="gradient" size="lg" icon="arrow-right" iconSide="right" fullWidth loading={saving} onPress={save} />
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night },
  fill: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  header: { minHeight: 48, flexDirection: "row", alignItems: "center" },
  spacer: { minHeight: 220, flexGrow: 1 },
  center: { alignItems: "center", paddingVertical: 32 },
  fields: { marginTop: 18, gap: 12 },
});
