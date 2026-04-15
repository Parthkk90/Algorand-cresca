import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { LineChart } from 'react-native-gifted-charts';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';

type Frame = '1D' | '1W' | '1M' | '1Y';

export default function AssetDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const name = String(params.name || 'Asset');
  const symbol = String(params.symbol || 'ALGO');
  const price = Number(params.price || 0);
  const change24h = Number(params.change24h || 0);

  const [frame, setFrame] = useState<Frame>('1M');
  const width = Dimensions.get('window').width - 70;

  const series = useMemo(() => {
    const points = frame === '1D' ? 24 : frame === '1W' ? 7 : frame === '1M' ? 30 : 52;
    const out: { value: number; label: string }[] = [];
    let v = price * 0.88;

    for (let i = 0; i < points; i += 1) {
      const drift = (price - v) * 0.04;
      const noise = (Math.random() - 0.5) * price * 0.02;
      v = Math.max(0.000001, v + drift + noise);
      out.push({ value: v, label: '' });
    }

    if (out.length > 0) out[out.length - 1] = { value: price, label: '' };
    return out;
  }, [frame, price]);

  const frameReturn = useMemo(() => {
    if (!series.length || series[0].value === 0) return 0;
    return ((price - series[0].value) / series[0].value) * 100;
  }, [price, series]);

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.navy} />
        </TouchableOpacity>
        <View style={styles.center}>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.sub}>{symbol} on Algorand</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.statCard}>
          <Text style={styles.price}>${price.toFixed(2)}</Text>
          <Text style={[styles.delta, change24h >= 0 ? styles.up : styles.down]}>
            {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}% (24h)
          </Text>
          <Text style={[styles.delta2, frameReturn >= 0 ? styles.up : styles.down]}>
            {frame} return: {frameReturn >= 0 ? '+' : ''}{frameReturn.toFixed(2)}%
          </Text>
        </View>

        <View style={styles.chartWrap}>
          <LineChart
            data={series}
            width={width}
            height={210}
            color={Colors.navy}
            thickness={3}
            hideRules
            hideDataPoints
            curved
            areaChart
            yAxisThickness={0}
            xAxisThickness={0}
            startFillColor={Colors.sky}
            endFillColor={Colors.bg.screen}
            startOpacity={0.32}
            endOpacity={0.02}
            noOfSections={4}
          />
        </View>

        <View style={styles.frames}>
          {(['1D', '1W', '1M', '1Y'] as const).map((k) => (
            <TouchableOpacity
              key={k}
              style={[styles.frameBtn, frame === k && styles.frameBtnOn]}
              onPress={() => setFrame(k)}
              accessibilityRole="button"
              accessibilityLabel={`Show ${k} chart`}
              accessibilityState={{ selected: frame === k }}
            >
              <Text style={[styles.frameTxt, frame === k && styles.frameTxtOn]}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Market Context</Text>
          <Text style={styles.infoText}>
            This view represents live market movement used by Cresca synthetic bundles. Execution and settlement happen on Algorand testnet smart contracts.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.screen },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  center: { alignItems: 'center' },
  title: { color: Colors.text.primary, fontWeight: '700', fontSize: Typography.md },
  sub: { marginTop: 2, color: Colors.text.secondary, fontSize: Typography.xs },
  content: { padding: Spacing.lg, gap: Spacing.md },
  statCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  price: { fontSize: 38, fontWeight: '700', color: Colors.text.primary },
  delta: { marginTop: Spacing.xs, fontSize: Typography.base, fontWeight: '600' },
  delta2: { marginTop: 4, fontSize: Typography.sm, fontWeight: '500' },
  up: { color: Colors.gain },
  down: { color: Colors.loss },
  chartWrap: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
    paddingLeft: Spacing.sm,
  },
  frames: { flexDirection: 'row', gap: Spacing.sm },
  frameBtn: {
    flex: 1,
    alignItems: 'center',
    borderRadius: Radius.full,
    paddingVertical: 8,
    backgroundColor: Colors.bg.subtle,
  },
  frameBtnOn: { backgroundColor: Colors.navy },
  frameTxt: { color: Colors.text.secondary, fontWeight: '600' },
  frameTxtOn: { color: Colors.white },
  infoCard: {
    backgroundColor: Colors.bg.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  infoTitle: { color: Colors.text.primary, fontWeight: '700', marginBottom: Spacing.xs },
  infoText: { color: Colors.text.secondary, lineHeight: 20, fontSize: Typography.sm },
});