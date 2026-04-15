import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';

interface ScreenContainerProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  /** Adds paddingBottom equal to the device's bottom safe-area inset. Enable on screens whose content can scroll beneath the tab bar. Default: true */
  bottomInset?: boolean;
}

/**
 * ScreenContainer
 * ===============
 * Replaces SafeAreaView across all screens.
 *
 * Uses useSafeAreaInsets() to apply an explicit paddingTop equal to the
 * device-reported top inset. This is more reliable than SafeAreaView's
 * edge detection on Android punch-hole camera devices (e.g. OnePlus Nord CE3)
 * where translucent status bar reporting can be inaccurate.
 *
 * Usage:
 *   import { ScreenContainer } from '../components/ScreenContainer';
 *   <ScreenContainer>...</ScreenContainer>
 */
export function ScreenContainer({ children, style, bottomInset = true }: ScreenContainerProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top,
          paddingBottom: bottomInset ? insets.bottom : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg.screen,
  },
});
