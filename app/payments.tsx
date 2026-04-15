import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppNoticeModal, AppNoticeTone } from '../components/AppNoticeModal';
import { ScreenContainer } from '../components/ScreenContainer';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';
import { algorandService } from '../services/algorandService';

type ProfileSetting = {
  key: 'wallet' | 'security' | 'notifications' | 'network' | 'support' | 'swap';
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const PROFILE_SETTINGS: ProfileSetting[] = [
  {
    key: 'wallet',
    title: 'Wallet Settings',
    subtitle: 'Manage address, backups, and wallet preferences',
    icon: 'wallet-outline',
  },
  {
    key: 'security',
    title: 'Security And Privacy',
    subtitle: 'Password lock, session security, and privacy controls',
    icon: 'lock-closed-outline',
  },
  {
    key: 'notifications',
    title: 'Notifications',
    subtitle: 'Transaction and market alert preferences',
    icon: 'notifications-outline',
  },
  {
    key: 'network',
    title: 'Network Settings',
    subtitle: 'Testnet mode and explorer preferences',
    icon: 'globe-outline',
  },
  {
    key: 'support',
    title: 'Help And Support',
    subtitle: 'FAQs, troubleshooting, and contact support',
    icon: 'help-circle-outline',
  },
  {
    key: 'swap',
    title: 'Swap',
    subtitle: 'Open token swap and conversion flow',
    icon: 'swap-horizontal-outline',
  },
];

export default function PaymentsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState('0.000000');
  const [notice, setNotice] = useState<{ title: string; message: string; tone: AppNoticeTone } | null>(null);

  const shortAddress = useMemo(() => {
    if (!address) return '...';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);

  useEffect(() => {
    (async () => {
      try {
        const wallet = await algorandService.initializeWallet();
        const bal = await algorandService.getBalance();
        setAddress(wallet.address);
        setBalance(bal.algo);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onSettingPress = (key: ProfileSetting['key']) => {
    if (key === 'swap') {
      router.push('/swap');
      return;
    }

    if (key === 'wallet') {
      setNotice({
        title: 'Wallet Settings',
        message: 'Wallet controls will be expanded in this section.',
        tone: 'info',
      });
      return;
    }

    if (key === 'security') {
      setNotice({
        title: 'Security And Privacy',
        message: 'Security controls will be expanded in this section.',
        tone: 'info',
      });
      return;
    }

    if (key === 'notifications') {
      setNotice({
        title: 'Notifications',
        message: 'Notification controls will be expanded in this section.',
        tone: 'info',
      });
      return;
    }

    if (key === 'network') {
      setNotice({
        title: 'Network Settings',
        message: 'Network controls will be expanded in this section.',
        tone: 'info',
      });
      return;
    }

    setNotice({
      title: 'Help And Support',
      message: 'Support options will be expanded in this section.',
      tone: 'info',
    });
  };

  const copyAddress = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setNotice({
      title: 'Copied',
      message: 'Wallet address copied to clipboard.',
      tone: 'success',
    });
  };

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color={Colors.navy} />
      </View>
    );
  }

  return (
    <ScreenContainer style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Profile</Text>
            <Text style={styles.subtitle}>Account and settings</Text>
          </View>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() =>
              setNotice({
                title: 'Edit Profile',
                message: 'Profile editing will be added here.',
                tone: 'info',
              })
            }
          >
            <Ionicons name="pencil" size={16} color={Colors.navy} />
          </TouchableOpacity>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>C</Text>
            <View style={styles.onlineDot} />
          </View>
          <Text style={styles.profileName}>Cresca User</Text>

          <TouchableOpacity style={styles.addressPill} onPress={copyAddress} activeOpacity={0.85}>
            <Ionicons name="copy-outline" size={14} color={Colors.steel} />
            <Text style={styles.addressPillText}>{shortAddress}</Text>
          </TouchableOpacity>

          <Text style={[styles.profileBalance, { fontVariant: ['tabular-nums'] }]}>{parseFloat(balance).toFixed(4)} ALGO</Text>
        </View>

        <View style={styles.settingsCard}>
          {PROFILE_SETTINGS.map((item, index) => {
            const isLast = index === PROFILE_SETTINGS.length - 1;
            return (
              <TouchableOpacity
                key={item.key}
                style={isLast ? styles.settingsRowLast : styles.settingsRow}
                onPress={() => onSettingPress(item.key)}
                activeOpacity={0.85}
              >
                <View style={styles.settingsLeft}>
                  <View style={styles.settingsIconWrap}>
                    <Ionicons name={item.icon} size={17} color={Colors.navy} />
                  </View>
                  <View style={styles.settingsTextWrap}>
                    <Text style={styles.settingsRowTitle}>{item.title}</Text>
                    <Text style={styles.settingsRowSub}>{item.subtitle}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.steel} />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <AppNoticeModal
        visible={!!notice}
        title={notice?.title ?? ''}
        message={notice?.message ?? ''}
        tone={notice?.tone ?? 'info'}
        onClose={() => setNotice(null)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.cream },
  content: { padding: Spacing.xl, paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: { color: Colors.navy, fontSize: Typography.xl, fontWeight: Typography.bold },
  subtitle: { color: Colors.steel, fontSize: Typography.sm, marginTop: 3 },
  editBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    padding: Spacing.xl,
    marginBottom: Spacing.md,
  },
  avatarWrap: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: Colors.bg.subtle,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarText: { color: Colors.navy, fontSize: Typography.lg, fontWeight: Typography.bold },
  onlineDot: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.white,
    backgroundColor: Colors.gain,
  },
  profileName: {
    color: Colors.navy,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    marginTop: Spacing.sm,
  },
  addressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.bg.subtle,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: Spacing.sm,
  },
  addressPillText: { color: Colors.steel, fontSize: Typography.xs, fontWeight: Typography.semibold },
  profileBalance: {
    color: Colors.navy,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    marginTop: Spacing.sm,
  },
  settingsCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  settingsRowLast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  settingsLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  settingsIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bg.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsTextWrap: { flex: 1 },
  settingsRowTitle: { color: Colors.navy, fontSize: Typography.sm, fontWeight: Typography.semibold },
  settingsRowSub: { color: Colors.steel, fontSize: Typography.xs, marginTop: 2 },
});
