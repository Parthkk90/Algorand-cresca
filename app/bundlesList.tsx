import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { Colors, Radius, Shadow, Spacing, Typography } from '../constants/theme';

interface BundleItem {
  id: string;
  name: string;
  subtitle: string;
  composition: string;
  risk: 'Low' | 'Medium' | 'High';
  leverageCap: string;
}

const BUNDLES: BundleItem[] = [
  {
    id: 'standard',
    name: 'Standard DART Bundle',
    subtitle: 'Balanced synthetic exposure for testnet trading',
    composition: 'ALGO 60%  ·  USDC 40%',
    risk: 'Medium',
    leverageCap: '1x-40x',
  },
  {
    id: 'defensive',
    name: 'Defensive ALGO Basket',
    subtitle: 'Lower-volatility profile anchored on ALGO',
    composition: 'ALGO 80%  ·  USDC 20%',
    risk: 'Low',
    leverageCap: '1x-20x',
  },
  {
    id: 'tactical',
    name: 'Tactical Momentum Basket',
    subtitle: 'Faster profile for active directional setups',
    composition: 'ALGO 45%  ·  USDC 55%',
    risk: 'High',
    leverageCap: '1x-40x',
  },
];

export default function BundlesListScreen() {
  const router = useRouter();

  const riskStyle = (risk: BundleItem['risk']) => {
    void risk;
    return { bg: '#2E4D6B55', fg: Colors.navy };
  };

  return (
    <ScreenContainer style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.title}>Dynamic Bundles</Text>
          <Text style={styles.subtitle}>Pick a profile, then open your synthetic bucket position on Algorand testnet.</Text>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="flash" size={18} color={Colors.navy} />
          <Text style={styles.infoText}>Live pricing and execution are routed through DART + Algorand contracts.</Text>
        </View>

        {BUNDLES.map((bundle) => {
          const badge = riskStyle(bundle.risk);
          return (
            <TouchableOpacity
              key={bundle.id}
              activeOpacity={0.85}
              style={styles.card}
              accessibilityRole="button"
              accessibilityLabel={`Open ${bundle.name} bundle, ${bundle.risk} risk`}
              onPress={() =>
                router.push({
                  pathname: '/bundleTrade',
                  params: {
                    bundleId: bundle.id,
                    bundleName: bundle.name,
                    composition: bundle.composition,
                    risk: bundle.risk,
                  },
                })
              }
            >
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>{bundle.name}</Text>
                <View style={[styles.riskBadge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.riskText, { color: badge.fg }]}>{bundle.risk}</Text>
                </View>
              </View>

              <Text style={styles.cardSubtitle}>{bundle.subtitle}</Text>
              <Text style={styles.composition}>{bundle.composition}</Text>

              <View style={styles.cardFoot}>
                <Text style={styles.meta}>Leverage {bundle.leverageCap}</Text>
                <Ionicons name="arrow-forward" size={18} color={Colors.steel} />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.screen,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  hero: {
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.xl,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  subtitle: {
    marginTop: Spacing.xs,
    fontSize: Typography.sm,
    color: Colors.text.secondary,
    lineHeight: 20,
  },
  infoCard: {
    flexDirection: 'row',
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bg.subtle,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoText: {
    flex: 1,
    color: Colors.text.primary,
    fontSize: Typography.sm,
    fontWeight: '500',
  },
  card: {
    borderRadius: Radius.xl,
    backgroundColor: Colors.bg.card,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    flex: 1,
    color: Colors.text.primary,
    fontWeight: '700',
    fontSize: Typography.md,
    marginRight: Spacing.sm,
  },
  riskBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  riskText: {
    fontSize: Typography.xs,
    fontWeight: '700',
  },
  cardSubtitle: {
    marginTop: Spacing.sm,
    color: Colors.text.secondary,
    fontSize: Typography.sm,
  },
  composition: {
    marginTop: Spacing.sm,
    color: Colors.text.primary,
    fontWeight: '600',
    fontSize: Typography.base,
  },
  cardFoot: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meta: {
    color: Colors.text.secondary,
    fontSize: Typography.sm,
  },
});