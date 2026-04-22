import React, { useEffect } from "react";
import { StyleProp, StyleSheet, TextStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { C, T } from "../../theme";

type LiveBadgeProps = {
  isLoading?: boolean;
  style?: StyleProp<TextStyle>;
};

export function LiveBadge({ isLoading = true, style }: LiveBadgeProps) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (isLoading) {
      opacity.value = withRepeat(withTiming(0.4, { duration: 500 }), -1, true);
      return;
    }

    opacity.value = withTiming(1, { duration: 150 });
  }, [isLoading, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.Text style={[styles.text, animatedStyle, style]}>
      {"\u26A1 Live"}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  text: {
    ...T.smBold,
    color: C.brand.purple,
  },
});
