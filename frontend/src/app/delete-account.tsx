import { useRef, useState } from "react";
import type { TextInput } from "react-native";
import { View } from "react-native";
import { Redirect, type Href } from "expo-router";
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
import { DELETE_WORD, describeDeleteError, isDeleteWord } from "@/features/auth/deleteAccount";
import { goToSignIn } from "@/features/auth/navigation";
import { PASSWORD_MAX_BYTES } from "@/features/auth/password";
import { useAppLock } from "@/features/security/AppLockProvider";
import { useTheme } from "@/theme/ThemeProvider";

const DELETED = [
  "Your sign-in: your email and password",
  "Your name, email address and profile photo",
  "Your individual balances, the people you saved, and the receipts and photos you added to them",
  "Anything that was queued to be emailed to you or about your people",
];

const STAYS = [
  "Groups you shared with others keep their expenses, payments and activity, so everyone's balances stay right. They show you as \"Deleted user\", with no name, email address or photo.",
  "A group you owned passes to the member who joined first. A group where you were the only member is deleted.",
  "Messages and emails you already sent can't be taken back.",
];

function Bullets({ items }: { items: readonly string[] }) {
  return (
    <View className="gap-2">
      {items.map((item) => (
        <View key={item} className="flex-row gap-2.5">
          <Text className="text-[13px] leading-5 text-slate">•</Text>
          <Text className="min-w-0 flex-1 text-[13px] leading-5 text-ink">{item}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Permanently deletes the account, from inside the app (the stores require it). The password is asked again and the
 * word DELETE typed, and the API wants a password sign-in from the last few minutes, so it cannot happen by accident.
 */
export default function DeleteAccountScreen() {
  const { session, configured, deleteAccount } = useAuth();
  const { disableBiometricSignIn } = useAppLock();
  const { colors: c } = useTheme();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [show, setShow] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // After a successful deletion the session ends while this screen is still up: do not bounce to Settings on the way out.
  const [done, setDone] = useState(false);
  const confirmInput = useRef<TextInput>(null);

  const email = session?.user.email;
  if (!done && (!configured || !session || !email)) return <Redirect href={"/settings" as Href} />;

  const ready = password.length > 0 && isDeleteWord(typed);

  const confirmDeletion = async () => {
    if (deleting || !ready) return;
    setDeleting(true);
    try {
      await deleteAccount(password);
      setDone(true);
      // The password kept for Face ID or fingerprint sign-in belongs to an account that no longer exists.
      await disableBiometricSignIn().catch(() => undefined);
      toast.success("Your account is deleted", "Your data has been removed. Thank you for trying LenaDena.");
      goToSignIn();
    } catch (error) {
      const auth = describeAuthError(error, "sign_in");
      if (auth.kind === "invalid_credentials") {
        toast.error("That password is wrong", "Check it and try again. Nothing was deleted.");
      } else if (auth.kind === "network" || auth.kind === "rate_limited") {
        toast.error(auth.title === "Couldn't sign you in" ? "Couldn't delete your account" : auth.title, auth.message);
      } else {
        const copy = describeDeleteError(error);
        toast.error(copy.title, copy.message);
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Screen>
      <PageHeader title="Delete account" subtitle={email ?? ""} />
      <View className="gap-5">
        <View className="gap-3 rounded-card border bg-raised p-4" style={{ borderColor: c.coral }}>
          <View className="flex-row items-center gap-2.5">
            <Icon name="alert-circle" size={20} color={c.coral} />
            <Text className="text-[15px] font-bold text-ink">This can't be undone</Text>
          </View>
          <Text className="text-[13px] leading-5 text-slate">Deleting your account removes you from LenaDena for good, and signs you out on every phone.</Text>
        </View>

        <View className="gap-2.5">
          <Text className="px-1 text-[11px] font-bold uppercase tracking-[1.2px] text-slate">What is deleted</Text>
          <View className="rounded-card border border-line bg-raised p-4"><Bullets items={DELETED} /></View>
        </View>

        <View className="gap-2.5">
          <Text className="px-1 text-[11px] font-bold uppercase tracking-[1.2px] text-slate">What stays for other people</Text>
          <View className="rounded-card border border-line bg-raised p-4"><Bullets items={STAYS} /></View>
        </View>

        <Field label="Your password" hint="We ask again to be sure it's you.">
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
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => confirmInput.current?.focus()}
          />
        </Field>
        <Field label={`Type ${DELETE_WORD} to confirm`}>
          <Input
            ref={confirmInput}
            value={typed}
            onChangeText={setTyped}
            placeholder={DELETE_WORD}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel={`Type ${DELETE_WORD} to confirm`}
            returnKeyType="go"
            onSubmitEditing={() => void confirmDeletion()}
          />
        </Field>
        <Button
          label="Delete my account for good"
          icon="trash-2"
          variant="danger"
          fullWidth
          loading={deleting}
          disabled={!ready}
          accessibilityHint="Permanently deletes your account and signs you out"
          onPress={() => void confirmDeletion()}
        />
      </View>
    </Screen>
  );
}
