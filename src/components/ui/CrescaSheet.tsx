import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { IconWrapper } from './IconWrapper';
import React, { useCallback } from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { C, R, T } from "../../theme";

type CrescaSheetProps = {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  snapPoints?: (string | number)[];
  title?: string;
  onClose?: () => void;
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Use a scrolling content container — required when the sheet has text
   *  inputs that the on-screen keyboard might cover. */
  scrollable?: boolean;
};

export function CrescaSheet({
  sheetRef,
  snapPoints = ["50%", "85%"],
  title,
  onClose,
  children,
  contentContainerStyle,
  scrollable = false,
}: CrescaSheetProps) {
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.3}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      onDismiss={onClose}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      {(() => {
        const header = (title || onClose) ? (
          <View style={styles.header}>
            <Text style={styles.title}>{title ?? ""}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close sheet"
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              onPress={() => {
                sheetRef.current?.dismiss();
                onClose?.();
              }}
            >
              <IconWrapper icon={Cancel01Icon} size={20} color={C.text.t1} accessibilityLabel="Close sheet" />
            </TouchableOpacity>
          </View>
        ) : null;

        if (scrollable) {
          return (
            <BottomSheetScrollView
              style={styles.scrollFlex}
              contentContainerStyle={[styles.content, styles.scrollContent, contentContainerStyle]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {header}
              {children}
            </BottomSheetScrollView>
          );
        }

        return (
          <BottomSheetView style={[styles.content, contentContainerStyle]}>
            {header}
            {children}
          </BottomSheetView>
        );
      })()}
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: C.surfaces.bgSheet,
    borderTopLeftRadius: R.lg,
    borderTopRightRadius: R.lg,
  },
  handle: {
    width: 36,
    backgroundColor: "#D1D5DB",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  scrollFlex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    // extra bottom padding so the last input clears the keyboard comfortably
    paddingBottom: 280,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    ...T.h2,
    color: C.text.t1,
    flex: 1,
  },
});
