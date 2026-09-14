import { createElement, forwardRef, Fragment, useState } from "react";
import type { TextInputProps } from "react-native";
import { Modal, Platform, Pressable, StyleSheet, Text as NativeText, TextInput, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import Animated, { interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useScreenObscured } from "@/components/ui/ScreenObscured";
import { colors } from "@/theme/tokens";
import { Touch } from "@/components/ui/Touch";

type InputProps = TextInputProps & {
  leadingIcon?: IconName;
  trailingIcon?: IconName;
  onTrailingPress?: () => void;
  invalid?: boolean;
  /** `dark` sits on the plum space backdrop used by sign-in and the app lock. */
  appearance?: "light" | "dark";
  datePicker?: {
    value: Date;
    onChange: (value: Date) => void;
    minimumDate?: Date;
    maximumDate?: Date;
    title?: string;
  };
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { leadingIcon, trailingIcon, onTrailingPress, invalid = false, appearance = "light", datePicker, className: _className, onFocus, onBlur, style, multiline, ...props },
  ref,
) {
  const focusProgress = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(() => datePicker?.value ?? new Date());
  const obscured = useScreenObscured();
  const dark = appearance === "dark";
  const restingBorder = dark ? "rgba(255,255,255,0.1)" : colors.line;
  const focusBorder = dark ? colors.lavender : colors.violet;
  const iconColor = invalid ? (dark ? colors.coralBright : colors.coral) : dark ? colors.lavender : colors.violet;
  const focusStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focusProgress.value, [0, 1], [restingBorder, focusBorder]),
    shadowOpacity: focusProgress.value * (dark ? 0.3 : 0.12),
    elevation: focusProgress.value * 2,
  }));

  const openDatePicker = () => {
    if (!datePicker) return;
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: datePicker.value,
        mode: "date",
        minimumDate: datePicker.minimumDate,
        maximumDate: datePicker.maximumDate,
        onValueChange: (_event, value) => datePicker.onChange(value),
      });
      return;
    }
    setDraftDate(datePicker.value);
    setPickerVisible(true);
  };

  const frame = createElement(
    Animated.View,
    { style: [styles.frame, dark && styles.frameDark, focusStyle, invalid && (dark ? styles.invalidDark : styles.invalid)] },
    leadingIcon ? <Icon name={leadingIcon} size={19} color={iconColor} /> : null,
    createElement(TextInput, {
      keyboardAppearance: dark ? "dark" : "default",
      ...props,
      ref,
      multiline,
      editable: datePicker ? false : props.editable,
      caretHidden: datePicker ? true : props.caretHidden,
      style: [styles.input, dark && styles.inputDark, leadingIcon && styles.inputWithLeading, multiline && styles.multiline, style],
      placeholderTextColor: dark ? "rgba(236,232,255,0.42)" : colors.slate,
      selectionColor: focusBorder,
      onFocus: (event) => {
        focusProgress.value = withTiming(1, { duration: reduceMotion ? 0 : 140 });
        onFocus?.(event);
      },
      onBlur: (event) => {
        focusProgress.value = withTiming(0, { duration: reduceMotion ? 0 : 140 });
        onBlur?.(event);
      },
    }),
    trailingIcon ? (
      <Touch
        onPress={() => onTrailingPress?.()}
        disabled={!onTrailingPress}
        pressableStyle={styles.trailingAction}
        accessibilityRole={onTrailingPress ? "button" : undefined}
        accessibilityLabel={onTrailingPress ? "Input action" : undefined}
        hitSlop={4}
      >
        <Icon name={trailingIcon} size={19} color={iconColor} />
      </Touch>
    ) : null,
  );

  if (!datePicker || Platform.OS === "web") return frame;

  return createElement(
    Fragment,
    null,
    createElement(
      Pressable,
      {
        onPress: openDatePicker,
        accessibilityRole: "button",
        accessibilityLabel: `${datePicker.title ?? "Choose date"}: ${String(props.value ?? "")}`,
      },
      frame,
    ),
    Platform.OS === "ios" ? createElement(
      Modal,
      {
        visible: pickerVisible && !obscured,
        transparent: true,
        animationType: "fade",
        presentationStyle: "overFullScreen",
        onRequestClose: () => setPickerVisible(false),
      },
      createElement(
        View,
        { style: styles.modalRoot, accessibilityViewIsModal: true },
        createElement(Pressable, {
          style: StyleSheet.absoluteFill,
          onPress: () => setPickerVisible(false),
          accessibilityLabel: "Close date picker",
        }),
        createElement(
          View,
          { style: styles.dateSheet },
          createElement(NativeText, { style: styles.dateTitle }, datePicker.title ?? "Choose date"),
          createElement(DateTimePicker, {
            value: draftDate,
            mode: "date",
            display: "spinner",
            themeVariant: "light",
            textColor: colors.ink,
            minimumDate: datePicker.minimumDate,
            maximumDate: datePicker.maximumDate,
            onValueChange: (_event, value) => setDraftDate(value),
            style: styles.datePicker,
          }),
          createElement(
            View,
            { style: styles.dateActions },
            <Button label="Cancel" variant="ghost" onPress={() => setPickerVisible(false)} />,
            <Button
              label="Use this date"
              icon="check"
              onPress={() => {
                datePicker.onChange(draftDate);
                setPickerVisible(false);
              }}
            />,
          ),
        ),
      ),
    ) : null,
  );
});

const styles = StyleSheet.create({
  frame: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised,
    paddingHorizontal: 16,
    shadowColor: colors.violet,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
  },
  frameDark: {
    borderRadius: 16,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(12,6,34,0.86)",
    shadowColor: colors.lavender,
  },
  invalid: {
    borderColor: colors.coral,
  },
  invalidDark: {
    borderColor: colors.coralBright,
  },
  input: {
    flex: 1,
    minHeight: 54,
    paddingVertical: 13,
    color: colors.ink,
    fontFamily: "Manrope_500Medium",
    fontSize: 15,
  },
  inputDark: {
    color: colors.white,
  },
  inputWithLeading: {
    marginLeft: 12,
  },
  multiline: {
    minHeight: 92,
    paddingTop: 16,
    textAlignVertical: "top",
  },
  trailingAction: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(16,8,35,0.45)",
  },
  dateSheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 34,
    shadowColor: colors.plum,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
  },
  dateTitle: {
    color: colors.ink,
    fontFamily: "Manrope_700Bold",
    fontSize: 19,
  },
  datePicker: {
    alignSelf: "stretch",
    height: 190,
    marginVertical: 10,
  },
  dateActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
});
