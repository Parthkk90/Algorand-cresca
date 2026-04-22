import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
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
  snapPoints?: Array<string | number>;
  title?: string;
  onClose?: () => void;
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function CrescaSheet({
  sheetRef,
  snapPoints = ["50%", "85%"],
  title,
  onClose,
  children,
  contentContainerStyle,
}: CrescaSheetProps) {
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={1}
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
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={[styles.content, contentContainerStyle]}>
        {(title || onClose) && (
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
              <Ionicons name="close" size={20} color={C.text.t1} />
            </TouchableOpacity>
          </View>
        )}
        {children}
      </BottomSheetView>
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
