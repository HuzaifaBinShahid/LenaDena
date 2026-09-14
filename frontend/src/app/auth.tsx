import { createElement, useRef } from "react";
import type { TextInput } from "react-native";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useLocalSearchParams, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Animated, { FadeIn, FadeInDown, FadeOutUp, LinearTransition, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BrandMark } from "@/components/brand/BrandMark";
import { SpaceBackdrop } from "@/components/brand/SpaceBackdrop";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Text } from "@/components/ui/Text";
import { Touch } from "@/components/ui/Touch";
import { useAuth } from "@/features/auth/AuthProvider";
import { EMAIL_MAX_LENGTH, NAME_MAX_LENGTH, useAuthForm, type AuthForm } from "@/features/auth/useAuthForm";
import { colors } from "@/theme/tokens";

const WIDE_BREAKPOINT = 900;

export default function AuthScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { session } = useAuth();
  const form = useAuthForm(next);
  const { width } = useWindowDimensions();

  if (session) return <Redirect href={form.returnPath as Href} />;

  return width >= WIDE_BREAKPOINT ? <WideLayout form={form} /> : <CompactLayout form={form} width={width} />;
}

function CompactLayout({ form, width }: { form: AuthForm; width: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SpaceBackdrop fit="top" />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={[styles.compactContent, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <BrandMark size="sm" tone="light" showName={width >= 390} />
            <ModeLink form={form} />
          </View>
          {/* Keeps the planet and moon clear of the heading; spare height is shared two-to-one above and below the form. */}
          <View style={{ minHeight: width * 0.5, flexGrow: 1 }} />
          <AuthPanel form={form} headingSize={Math.min(56, width * 0.135)} />
          <View style={{ flexGrow: 0.5 }} />
          <Footer />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function WideLayout({ form }: { form: AuthForm }) {
  return (
    <View style={styles.wideRoot}>
      <StatusBar style="light" />
      <View style={styles.widePanel}>
        <SpaceBackdrop fit="cover" />
        <View style={styles.wideBrand}>
          <BrandMark size="md" tone="light" />
        </View>
        <View style={styles.wideTagline}>
          <Text className="font-extrabold uppercase text-white" style={styles.taglineText}>Shared money,</Text>
          <Text className="font-extrabold uppercase" style={[styles.taglineText, { color: colors.lavender }]}>minus the awkward.</Text>
        </View>
      </View>
      <View style={styles.wideSide}>
        <LinearGradient colors={[colors.night, "#1B0E40", "#241150"]} style={StyleSheet.absoluteFill} />
        <View style={styles.wideTopBar}>
          <ModeLink form={form} />
        </View>
        <ScrollView contentContainerStyle={styles.wideScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.wideForm}>
            <AuthPanel form={form} headingSize={64} />
          </View>
        </ScrollView>
        <View style={styles.wideFooter}>
          <Footer />
        </View>
      </View>
    </View>
  );
}

function ModeLink({ form }: { form: AuthForm }) {
  const signup = form.mode === "signup";
  return (
    <Touch
      onPress={() => form.switchMode(signup ? "signin" : "signup")}
      disabled={form.busy}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={signup ? "Have an account? Sign in" : "New to LenaDena? Sign up"}
      pressableStyle={styles.modeLink}
    >
      <Text className="text-[10.5px] font-semibold uppercase tracking-[1.4px] text-white/60">
        {signup ? "Have an account? " : "New here? "}
        <Text className="text-[10.5px] font-extrabold uppercase tracking-[1.4px] text-white">{signup ? "Sign in" : "Sign up"}</Text>
      </Text>
    </Touch>
  );
}

function AuthPanel({ form, headingSize }: { form: AuthForm; headingSize: number }) {
  const reduceMotion = useReducedMotion();
  const emailInput = useRef<TextInput>(null);
  const signup = form.mode === "signup";
  const linkOnly = form.instantAuth === false;
  const layout = reduceMotion ? undefined : LinearTransition.springify().damping(24).stiffness(240);

  return (
    <View>
      {createElement(
        Animated.View,
        { key: form.mode, entering: reduceMotion ? undefined : FadeIn.duration(260) },
        <Text className="font-extrabold uppercase text-white" style={{ fontSize: headingSize, lineHeight: Math.round(headingSize * 1.06), letterSpacing: -1 }} accessibilityRole="header">
          {signup ? "Sign up" : "Sign in"}
        </Text>,
        <Text className="mt-4 text-[13px] font-semibold text-white/85">
          {linkOnly ? "We'll email you a one-time sign-in link" : signup ? "Create your account with your name and email" : "Sign in with your email address"}
        </Text>,
      )}

      <View style={styles.fields}>
        {signup ? createElement(
          Animated.View,
          { entering: reduceMotion ? undefined : FadeInDown.duration(240), exiting: reduceMotion ? undefined : FadeOutUp.duration(150) },
          <Field appearance="dark" error={form.nameError}>
            <Input
              appearance="dark"
              value={form.name}
              onChangeText={form.setName}
              placeholder="Your name"
              maxLength={NAME_MAX_LENGTH}
              leadingIcon="user"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              accessibilityLabel="Name"
              invalid={Boolean(form.nameError)}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => emailInput.current?.focus()}
            />
          </Field>,
        ) : null}
        {createElement(
          Animated.View,
          { layout },
          <Field appearance="dark" error={form.emailError}>
            <Input
              ref={emailInput}
              appearance="dark"
              value={form.email}
              onChangeText={form.setEmail}
              placeholder="you@example.com"
              maxLength={EMAIL_MAX_LENGTH}
              leadingIcon="mail"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              accessibilityLabel="Email"
              invalid={Boolean(form.emailError)}
              returnKeyType="go"
              onSubmitEditing={() => void form.submit()}
            />
          </Field>,
        )}
        {createElement(
          Animated.View,
          { layout },
          <Button
            label={linkOnly ? "Email me a link" : signup ? "Create account" : "Sign in"}
            variant="gradient"
            size="lg"
            icon="arrow-right"
            iconSide="right"
            fullWidth
            loading={form.loading}
            disabled={form.busy && !form.loading}
            onPress={form.submit}
          />,
        )}
      </View>

      {form.quickSignIn ? createElement(
        Animated.View,
        { layout, entering: reduceMotion ? undefined : FadeIn.duration(220) },
        <View style={styles.divider} />,
        <Text className="text-[11.5px] font-medium text-white/65">Or continue with</Text>,
        <View style={styles.quickRow}>
          <Button
            label={`${form.quickSignIn.label} · ${form.quickSignIn.name}`}
            icon={form.quickSignIn.icon}
            variant="glass"
            fullWidth
            loading={form.biometricLoading}
            disabled={form.busy && !form.biometricLoading}
            onPress={form.quickSignIn.run}
            accessibilityHint={`Signs in as ${form.quickSignIn.name} after checking it's you`}
          />
        </View>,
      ) : null}

      {createElement(
        Animated.View,
        { layout },
        <Text className="mt-5 text-[11.5px] leading-[17px] text-white/55">
          LenaDena only keeps the tab. It <Text className="text-[11.5px] font-semibold text-lavender">never holds or moves your money</Text>.
        </Text>,
      )}
    </View>
  );
}

function Footer() {
  return <Text className="mt-8 text-center text-[10px] font-semibold uppercase tracking-[1.6px] text-white/30">© {new Date().getFullYear()} LenaDena</Text>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.night,
  },
  fill: {
    flex: 1,
  },
  compactContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  header: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modeLink: {
    minHeight: 44,
    justifyContent: "center",
  },
  fields: {
    marginTop: 18,
    gap: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 26,
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  quickRow: {
    marginTop: 10,
  },
  wideRoot: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.night,
  },
  widePanel: {
    flex: 1.15,
    overflow: "hidden",
  },
  wideBrand: {
    position: "absolute",
    top: 40,
    left: 48,
  },
  wideTagline: {
    position: "absolute",
    left: 56,
    right: 56,
    bottom: 64,
  },
  taglineText: {
    fontSize: 52,
    lineHeight: 56,
    letterSpacing: -1,
  },
  wideSide: {
    flex: 1,
  },
  wideTopBar: {
    alignItems: "flex-end",
    paddingHorizontal: 40,
    paddingTop: 28,
  },
  wideScroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 24,
  },
  wideForm: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  wideFooter: {
    paddingBottom: 28,
  },
});
