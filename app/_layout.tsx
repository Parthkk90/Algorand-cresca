// app/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values';
import '../utils/globalPolyfills';
import { Colors } from '../constants/theme';
import { notificationService } from '../services/notificationService';
import { onboardingEmitter } from '../utils/onboardingEmitter';
import { appPasswordService } from '../services/appPasswordService';
import { authEmitter } from '../utils/authEmitter';

const ONBOARDING_DONE_KEY = 'cresca_onboarding_completed';

export default function TabLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [queryClient] = useState(() => new QueryClient());
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(true);

  useEffect(() => {
    void notificationService.requestPermissions();
    return () => {};
  }, []);

  // One-shot read on mount; thereafter driven by emitter — no polling
  useEffect(() => {
    let mounted = true;

    (async () => {
      const val = await AsyncStorage.getItem(ONBOARDING_DONE_KEY);
      if (!mounted) return;

      const onboarded = val === '1';
      setIsOnboarded(onboarded);

      if (!onboarded) {
        setIsUnlocked(true);
      } else {
        const hasPassword = await appPasswordService.hasPassword();
        const unlocked = !hasPassword || appPasswordService.isSessionUnlocked();
        setIsUnlocked(unlocked);
      }

      setIsCheckingOnboarding(false);
    })();

    const unsub = onboardingEmitter.subscribe(() => {
      if (mounted) setIsOnboarded(true);
    });

    const unsubAuth = authEmitter.subscribe((unlocked) => {
      if (mounted) setIsUnlocked(unlocked);
    });

    return () => {
      mounted = false;
      unsub();
      unsubAuth();
    };
  }, []);

  const guardTabPress = (e: any) => {
    if (!isOnboarded || !isUnlocked) e.preventDefault();
  };

  useEffect(() => {
    if (isCheckingOnboarding) return;

    const inOnboarding = segments[0] === 'onboarding';
    if (!isOnboarded && !inOnboarding) {
      router.replace('/onboarding');
      return;
    }

    if (isOnboarded && inOnboarding) {
      router.replace('/index');
    }
  }, [isCheckingOnboarding, isOnboarded, router, segments]);

  if (isCheckingOnboarding) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.bg.screen,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const tabBarStyle = Platform.select({
    ios: {
      position: 'absolute' as const,
      backgroundColor: 'rgba(23,31,51,0.92)',
      borderTopWidth: 0.5,
      borderTopColor: Colors.border,
      paddingBottom: 20,
      height: 85,
      shadowColor: Colors.primary,
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
    },
    default: {
      backgroundColor: Colors.bg.card,
      borderTopWidth: 0.5,
      borderTopColor: Colors.border,
      height: 70,
      elevation: 12,
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <BottomSheetModalProvider>
          <SafeAreaProvider>
            <StatusBar style="light" translucent={false} backgroundColor={Colors.bg.screen} />
            <Tabs
              screenOptions={{
                tabBarActiveTintColor: Colors.primary,
                tabBarInactiveTintColor: Colors.text.muted,
                headerShown: false,
                tabBarStyle: isOnboarded && isUnlocked ? tabBarStyle : { display: 'none' },
                tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
              }}
            >
              <Tabs.Screen
                name="index"
                options={{
                  title: 'Home',
                  tabBarIcon: ({ color, focused }) => (
                    <Ionicons name={focused ? 'home' : 'home-outline'} color={color} size={24} />
                  ),
                }}
              />
              <Tabs.Screen
                name="markets"
                listeners={{ tabPress: guardTabPress }}
                options={{
                  title: 'Markets',
                  tabBarIcon: ({ color, focused }) => (
                    <Ionicons name={focused ? 'trending-up' : 'trending-up-outline'} color={color} size={24} />
                  ),
                }}
              />
              <Tabs.Screen
                name="bucket"
                listeners={{ tabPress: guardTabPress }}
                options={{
                  title: 'Bundles',
                  tabBarIcon: ({ color, focused }) => (
                    <Ionicons name={focused ? 'flash' : 'flash-outline'} color={color} size={24} />
                  ),
                }}
              />
              <Tabs.Screen
                name="calendar"
                listeners={{ tabPress: guardTabPress }}
                options={{
                  title: 'Schedule',
                  tabBarIcon: ({ color, focused }) => (
                    <Ionicons name={focused ? 'calendar' : 'calendar-outline'} color={color} size={24} />
                  ),
                }}
              />
              <Tabs.Screen
                name="payments"
                listeners={{ tabPress: guardTabPress }}
                options={{
                  title: 'Settings',
                  tabBarIcon: ({ color, focused }) => (
                    <Ionicons name={focused ? 'person' : 'person-outline'} color={color} size={22} />
                  ),
                }}
              />
              <Tabs.Screen name="bundlesList" options={{ href: null }} />
              <Tabs.Screen name="bundleTrade" options={{ href: null }} />
              <Tabs.Screen name="assetDetail" options={{ href: null }} />
              <Tabs.Screen name="swap" options={{ href: null }} />
              <Tabs.Screen name="onboarding" options={{ href: null }} />
            </Tabs>
          </SafeAreaProvider>
        </BottomSheetModalProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
