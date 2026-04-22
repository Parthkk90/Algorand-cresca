declare module "@gorhom/bottom-sheet" {
  import * as React from "react";
  import { StyleProp, ViewStyle } from "react-native";

  export type BottomSheetBackdropProps = {
    appearsOnIndex?: number;
    disappearsOnIndex?: number;
    opacity?: number;
    pressBehavior?: "none" | "close" | "collapse";
  };

  export const BottomSheetBackdrop: React.ComponentType<BottomSheetBackdropProps>;

  export type BottomSheetModalProps = {
    children?: React.ReactNode;
    index?: number;
    snapPoints?: Array<string | number>;
    onDismiss?: () => void;
    enablePanDownToClose?: boolean;
    backdropComponent?: (props: BottomSheetBackdropProps) => React.ReactNode;
    backgroundStyle?: StyleProp<ViewStyle>;
    handleIndicatorStyle?: StyleProp<ViewStyle>;
  };

  export class BottomSheetModal extends React.Component<BottomSheetModalProps> {
    present: () => void;
    dismiss: () => void;
  }

  export const BottomSheetView: React.ComponentType<{
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
  }>;
}
