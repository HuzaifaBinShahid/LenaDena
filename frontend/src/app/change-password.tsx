import { useRef, useState } from "react";
import type { TextInput } from "react-native";
import { View } from "react-native";
import { Redirect, router, type Href } from "expo-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Screen } from "@/components/ui/Screen";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { describeAuthError } from "@/features/auth/authErrors";
import { PASSWORD_HINT, PASSWORD_MAX_BYTES, PASSWORDS_DIFFER, passwordError } from "@/features/auth/password";
import { useAppLock } from "@/features/security/AppLockProvider";

/** For a signed-in person. The current password is asked again, so a phone left unlocked can't have its password changed. */
export default function ChangePasswordScreen() {
  const { session, changePassword } = useAuth();
  const { updateBiometricPassword } = useAppLock();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const nextInput = useRef<TextInput>(null);
  const confirmInput = useRef<TextInput>(null);

  const email = session?.user.email;
  if (!session || !email) return <Redirect href={"/auth" as Href} />;

  const currentProblem = current.length === 0 ? "Enter your current password." : undefined;
  const nextProblem = passwordError(next) ?? (next === current ? "Choose a password that's different from your current one." : undefined);
  const confirmProblem = confirm !== next ? PASSWORDS_DIFFER : undefined;

  const save = async () => {
    setSubmitted(true);
    if (currentProblem || nextProblem || confirmProblem || saving) return;
    setSaving(true);
    try {
      await changePassword({ email, currentPassword: current, newPassword: next });
      await updateBiometricPassword(email, next);
      toast.success("Password changed", "Use your new password the next time you sign in.");
      router.back();
    } catch (error) {
      const copy = describeAuthError(error, "update");
      // A wrong current password arrives as invalid credentials: say which field it is.
      toast.error(copy.kind === "invalid_credentials" ? "Your current password is wrong" : copy.title, copy.kind === "invalid_credentials" ? "Check it and try again, or sign out and use Forgot password." : copy.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="Change password" subtitle={email} />
      <View className="gap-5">
        <Field label="Current password" error={submitted ? currentProblem : undefined}>
          <Input
            value={current}
            onChangeText={setCurrent}
            placeholder="Current password"
            maxLength={PASSWORD_MAX_BYTES}
            leadingIcon="lock-closed"
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            accessibilityLabel="Current password"
            invalid={submitted && Boolean(currentProblem)}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => nextInput.current?.focus()}
          />
        </Field>
        <Field label="New password" hint={PASSWORD_HINT} error={submitted ? nextProblem : undefined}>
          <Input
            ref={nextInput}
            value={next}
            onChangeText={setNext}
            placeholder="New password"
            maxLength={PASSWORD_MAX_BYTES}
            leadingIcon="lock-closed"
            trailingIcon={show ? "eye-off" : "eye"}
            onTrailingPress={() => setShow((shown) => !shown)}
            trailingActionLabel={show ? "Hide passwords" : "Show passwords"}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            passwordRules="minlength: 8; required: lower; required: digit; maxlength: 72;"
            accessibilityLabel="New password"
            invalid={submitted && Boolean(nextProblem)}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => confirmInput.current?.focus()}
          />
        </Field>
        <Field label="Confirm new password" error={submitted ? confirmProblem : undefined}>
          <Input
            ref={confirmInput}
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
        <Button label="Change password" icon="check" fullWidth loading={saving} onPress={save} />
        <Text className="text-[11px] leading-4 text-slate">Other phones where you're signed in stay signed in until their session ends. If you suspect someone has your password, change it here and sign in again on your devices.</Text>
      </View>
    </Screen>
  );
}
