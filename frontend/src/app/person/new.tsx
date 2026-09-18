import { createElement, useEffect, useRef, useState } from "react";
import type { TextInput } from "react-native";
import { StyleSheet, Text as NativeText, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { PersonHeroCard } from "@/components/people/PersonHeroCard";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { LedgerList } from "@/components/ui/LedgerRow";
import { Screen } from "@/components/ui/Screen";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Touch } from "@/components/ui/Touch";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { getPlanState } from "@/features/ledger/planState";
import type { UpdatePersonInput } from "@/features/ledger/types";
import { findPersonByName, personEmailError, personFirstName, personNameError } from "@/features/people/people";
import { addBalanceHref, peopleHref, personHref } from "@/features/people/routes";
import { usePeopleSummaries } from "@/features/people/usePeople";
import { useAppLock } from "@/features/security/AppLockProvider";
import { errorMessage } from "@/lib/api";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

const AVATAR = 104;

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Add a person, or edit one (`?id=`). Not a plain form: a live contact card on the brand shell leads the page and
 * changes as you type (the initials and their tint follow the name), the photo is picked from the card itself,
 * and only two generous fields sit below it. `?name=` pre-fills a name typed elsewhere (People search).
 */
export default function PersonFormScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string }>();
  const editingId = typeof params.id === "string" && params.id ? params.id : undefined;
  const { plan, connection, refresh, createPerson, updatePerson, deletePerson } = useLedger();
  const { runWithoutLocking } = useAppLock();
  const toast = useToast();
  const navigation = useNavigation();
  const styles = useStyles();
  const summaries = usePeopleSummaries();
  const planState = getPlanState(plan, connection);
  const current = editingId ? plan.people.find((person) => person.id === editingId) : undefined;
  const [name, setName] = useState(() => current?.name ?? (typeof params.name === "string" ? params.name : ""));
  const [email, setEmail] = useState(() => current?.email ?? "");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Set once the save or removal went through, so the refreshed plan can't flash "already in your people" or
  // "not in your people" while the screen animates away.
  const [finished, setFinished] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const hydrated = useRef(Boolean(current));
  const lastKnown = useRef(current);
  if (current) lastKnown.current = current;
  const existing = current ?? (removing || finished ? lastKnown.current : undefined);

  // Opened before the plan arrived (a deep link, a cold start): fill the form once the person shows up.
  useEffect(() => {
    if (!existing || hydrated.current) return;
    hydrated.current = true;
    setName(existing.name);
    setEmail(existing.email ?? "");
  }, [existing]);

  if (editingId && !existing) {
    return (
      <Screen>
        <PageHeader title="Edit person" />
        {planState === "loading" ? (
          <LedgerList>
            <View style={shape.loading} accessible accessibilityLabel="Loading this person">
              <Spinner />
            </View>
          </LedgerList>
        ) : planState === "offline" ? (
          <LedgerList>
            <EmptyState
              variant="inset"
              icon="alert-circle"
              title="Couldn't load this person"
              detail="Their details show up once LenaDena reconnects."
              action={{ label: "Try again", onPress: () => void refresh() }}
            />
          </LedgerList>
        ) : (
          <EmptyState
            icon="user"
            illustration="groups"
            title="Not in your people"
            detail="They may have been removed. Entries with them stay in Activity."
            action={{ label: "See people", icon: "users", onPress: () => router.replace(peopleHref) }}
          />
        )}
      </Screen>
    );
  }

  const trimmedName = name.trim();
  const shownPhoto = photoChanged ? photoUri : existing?.avatarUrl ?? null;
  const duplicate = trimmedName ? findPersonByName(plan.people, trimmedName) : undefined;
  const clash = duplicate && duplicate.id !== editingId && !finished ? duplicate : undefined;
  const nameError = personNameError(name);
  const emailError = personEmailError(email);
  const nameMessage = clash ? `${clash.name} is already in your people.` : submitted ? nameError : undefined;
  const entryCount = existing ? summaries.find((summary) => summary.person.id === existing.id)?.entryCount ?? 0 : 0;
  const first = personFirstName(trimmedName || existing?.name || "");

  const choosePhoto = () => runWithoutLocking(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.warning("Photo access needed", "Allow photo access in your phone settings to choose a photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
      setPhotoChanged(true);
    }
  });

  const removePhoto = () => {
    setPhotoUri(null);
    setPhotoChanged(true);
  };

  const save = async () => {
    setSubmitted(true);
    if (nameError || emailError || clash) return;
    setSaving(true);
    try {
      if (existing) {
        const changes: UpdatePersonInput = {
          ...(trimmedName !== existing.name ? { name: trimmedName } : {}),
          ...(email.trim().toLowerCase() !== (existing.email ?? "") ? { email: email.trim() || null } : {}),
          ...(photoChanged ? { avatarUri: photoUri } : {}),
        };
        if (Object.keys(changes).length) {
          await updatePerson(existing.id, changes);
          toast.success("Saved", `${first}'s details are up to date.`);
        }
        setFinished(true);
        router.back();
        return;
      }
      const person = await createPerson({
        name: trimmedName,
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(photoChanged && photoUri ? { avatarUri: photoUri } : {}),
      });
      setFinished(true);
      if (router.canGoBack()) router.back();
      else router.replace(personHref(person.id));
      toast.show({
        tone: "success",
        title: `${personFirstName(person.name)} is in your people`,
        message: "Add a balance now, or pick them whenever you add one.",
        action: { label: "Add balance", onPress: () => router.push(addBalanceHref(person.id)) },
      });
    } catch (error) {
      toast.error(existing ? "Couldn't save the changes" : "Couldn't add this person", errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!existing) return;
    setRemoving(true);
    void deletePerson(existing.id)
      .then(() => {
        setFinished(true);
        setConfirmingRemoval(false);
        toast.success(
          `${personFirstName(existing.name)} removed`,
          entryCount ? `${plural(entryCount, "entry stays", "entries stay")} in Activity.` : "They're no longer in your people.",
        );
        // Their page would be empty now, so leave it too when we came from there.
        const routes = navigation.getState()?.routes ?? [];
        if (routes[routes.length - 2]?.name === "person/[id]") router.dismiss(2);
        else if (router.canGoBack()) router.back();
        else router.replace(peopleHref);
      })
      .catch((error: unknown) => toast.error("Couldn't remove this person", errorMessage(error)))
      .finally(() => setRemoving(false));
  };

  return (
    <Screen>
      <PageHeader title={existing ? "Edit person" : "Add a person"} subtitle={existing ? "Changes show everywhere they appear" : "Only you can see your people"} />

      <PersonHeroCard>
        <View style={shape.preview}>
          <Touch
            onPress={() => void choosePhoto()}
            pressedScale={0.95}
            haptic
            accessibilityRole="button"
            accessibilityLabel={shownPhoto ? "Replace photo" : "Choose a photo"}
            accessibilityHint="Opens your photo library"
            containerStyle={shape.avatarButton}
          >
            {trimmedName || shownPhoto ? (
              <PersonAvatar name={trimmedName} uri={shownPhoto} size={AVATAR} />
            ) : (
              // Before a name or photo there is nothing to tint yet: an open, dashed-feeling disc invites one.
              <View style={styles.emptyAvatar}>
                <Icon name="user" size={42} color="rgba(255,255,255,0.72)" />
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Icon name="camera" size={17} color={colors.violetStrong} />
            </View>
          </Touch>
          {createElement(
            NativeText,
            { numberOfLines: 2, adjustsFontSizeToFit: true, minimumFontScale: 0.7, style: [styles.previewName, !trimmedName && styles.previewPlaceholder] },
            trimmedName || "Their name",
          )}
          <View style={shape.emailRow}>
            <Icon name={email.trim() ? "mail" : "at"} size={14} color="rgba(255,255,255,0.6)" />
            {createElement(NativeText, { numberOfLines: 1, style: [styles.previewEmail, !email.trim() && styles.previewPlaceholder] }, email.trim() || "No email")}
          </View>
          <View style={shape.photoActions}>
            <Button label={shownPhoto ? "Replace photo" : "Add photo"} icon="image" variant="glass" onPress={() => void choosePhoto()} />
            {shownPhoto ? <Button label="Remove photo" icon="trash-2" variant="glass" onPress={removePhoto} /> : null}
          </View>
        </View>
      </PersonHeroCard>

      <View style={shape.fields}>
        <Field label="Name" required error={nameMessage}>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Mani"
            leadingIcon="user"
            autoFocus={!existing}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            submitBehavior="submit"
            invalid={Boolean(nameMessage)}
            accessibilityLabel="Name"
          />
        </Field>
        {clash ? (
          <View style={shape.clash}>
            <Button label={`Open ${personFirstName(clash.name)}`} icon="arrow-right" iconSide="right" variant="ghost" size="sm" onPress={() => router.replace(personHref(clash.id))} />
          </View>
        ) : null}
        <Field label="Email" hint="Optional, for your reference only." error={submitted ? emailError : undefined}>
          <Input
            ref={emailRef}
            value={email}
            onChangeText={setEmail}
            placeholder="name@example.com"
            leadingIcon="mail"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            invalid={Boolean(submitted && emailError)}
            accessibilityLabel="Email, optional"
          />
        </Field>
        <Button
          label={existing ? "Save changes" : "Add person"}
          icon={existing ? "check" : "user-plus"}
          size="lg"
          fullWidth
          loading={saving}
          onPress={save}
        />
        {existing ? (
          <Button label="Remove person" icon="person-remove" variant="danger" size="lg" fullWidth disabled={saving} onPress={() => setConfirmingRemoval(true)} />
        ) : (
          createElement(NativeText, { style: styles.footnote }, "Typing a new name when you add a balance saves that person here too.")
        )}
      </View>

      {existing ? (
        <ConfirmModal
          visible={confirmingRemoval}
          icon="person-remove"
          title={`Remove ${personFirstName(existing.name)}?`}
          detail={entryCount
            ? `${personFirstName(existing.name)} leaves your people. Their ${plural(entryCount, "entry", "entries")} stay in Activity, still under their name.`
            : `${personFirstName(existing.name)} leaves your people. You can add them again any time.`}
          confirmLabel="Remove"
          tone="danger"
          cancelLabel="Keep"
          loading={removing}
          onConfirm={remove}
          onClose={() => setConfirmingRemoval(false)}
        />
      ) : null}
    </Screen>
  );
}

// The preview sits on the always-dark violet card, so its text is fixed white in both themes.
const useStyles = makeStyles((c) => ({
  emptyAvatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    // The rim takes the shell colour so the white badge separates from light tints and photos.
    borderColor: c.shell,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  previewName: {
    marginTop: 14,
    textAlign: "center",
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
    color: colors.white,
  },
  previewEmail: {
    flexShrink: 1,
    fontFamily: "Manrope_500Medium",
    fontSize: 13,
    lineHeight: 18,
    color: "rgba(255,255,255,0.75)",
  },
  previewPlaceholder: {
    color: "rgba(255,255,255,0.45)",
  },
  footnote: {
    textAlign: "center",
    fontFamily: "Manrope_500Medium",
    fontSize: 12,
    lineHeight: 17,
    color: c.slate,
  },
}));

const shape = StyleSheet.create({
  preview: {
    alignItems: "center",
    paddingTop: 6,
  },
  avatarButton: {
    width: AVATAR,
    height: AVATAR,
  },
  emailRow: {
    marginTop: 4,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  photoActions: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  fields: {
    marginTop: 26,
    gap: 18,
  },
  clash: {
    marginTop: -10,
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
});
