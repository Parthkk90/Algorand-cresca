import React, { useEffect, useMemo, useState } from "react";
import {
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { C, T } from "../../theme";

type SegmentTabsProps = {
  tabs: string[];
  activeIndex: number;
  onTabChange: (nextIndex: number) => void;
  style?: StyleProp<ViewStyle>;
};

export function SegmentTabs({ tabs, activeIndex, onTabChange, style }: SegmentTabsProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const tabWidth = useMemo(() => {
    if (tabs.length === 0) return 0;
    return containerWidth / tabs.length;
  }, [containerWidth, tabs.length]);

  const translateX = useSharedValue(0);

  useEffect(() => {
    translateX.value = withTiming(tabWidth * activeIndex, { duration: 220 });
  }, [activeIndex, tabWidth, translateX]);

  const underlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={[styles.wrapper, style]} onLayout={onLayout}>
      <View style={styles.row}>
        {tabs.map((tab, index) => {
          const selected = index === activeIndex;
          return (
            <TouchableOpacity
              key={`${tab}-${index}`}
              style={styles.tabButton}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Switch to ${tab}`}
              onPress={() => onTabChange(index)}
            >
              <Text style={[styles.tabText, selected ? styles.tabTextActive : styles.tabTextInactive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tabWidth > 0 ? (
        <Animated.View
          style={[
            styles.underline,
            { width: tabWidth },
            underlineStyle,
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  tabText: {
    ...T.bodyMd,
  },
  tabTextActive: {
    color: C.text.t1,
    fontFamily: "DMSans_700Bold",
  },
  tabTextInactive: {
    color: C.text.t3,
  },
  underline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    height: 2,
    backgroundColor: C.brand.black,
  },
});
