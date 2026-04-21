import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import algosdk from 'algosdk';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { ScreenContainer } from '../../components/ScreenContainer';
import { CrescaInput, CrescaSheet, PrimaryButton } from '../../src/components/ui';
import { C, H_PAD, R, S, T } from '../../src/theme';
import { appPasswordService } from '../../services/appPasswordService';
import { algorandService } from '../../services/algorandService';
import { onboardingEmitter } from '../../utils/onboardingEmitter';

const ONBOARDING_DONE_KEY = 'cresca_onboarding_completed';
const WALLET_EXISTS_KEY = 'cresca_wallet_exists';

type Params = {
  mode?: string;
};

export default function OnboardingWelcomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();

  const createPasswordSheetRef = useRef<BottomSheetModal | null>(null);
  const seedRevealSheetRef = useRef<BottomSheetModal | null>(null);
  const clipboardClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [createError, setCreateError] = useState('');
  const [seedError, setSeedError] = useState('');
  const [busy, setBusy] = useState(false);

  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [seedWords, setSeedWords] = useState<string[]>([]);
  const [seedSheetOpen, setSeedSheetOpen] = useState(false);
  const [seedVisible, setSeedVisible] = useState(false);

  const canContinuePassword = useMemo(() => {
    return password.length >= 8 && confirmPassword.length >= 8 && password === confirmPassword;
  }, [confirmPassword, password]);

  useEffect(() => {
    if (params.mode === 'create') {
      const timer = setTimeout(() => {
        createPasswordSheetRef.current?.present();
      }, 120);
      return () => clearTimeout(timer);
    }

    return () => {};
  }, [params.mode]);

  useEffect(() => {
    if (!seedSheetOpen || !seedVisible) {
      void ScreenCapture.allowScreenCaptureAsync();
      return;
    }

    void ScreenCapture.preventScreenCaptureAsync();

    return () => {
      void ScreenCapture.allowScreenCaptureAsync();
    };
  }, [seedSheetOpen, seedVisible]);

  useEffect(() => {
    return () => {
      if (clipboardClearTimerRef.current) {
        clearTimeout(clipboardClearTimerRef.current);
      }
      void ScreenCapture.allowScreenCaptureAsync();
    };
  }, []);

  const startCreateWallet = async () => {
    if (!canContinuePassword) {
      setCreateError('Password must be at least 8 characters and both fields must match.');
      return;
    }

    setBusy(true);
    setCreateError('');

    try {
      await appPasswordService.setPassword(password);

      const account = algosdk.generateAccount();
      const mnemonic = algosdk.secretKeyToMnemonic(account.sk);
      const words = mnemonic.trim().split(/\s+/).slice(0, 12);

      setGeneratedMnemonic(mnemonic);
      setSeedWords(words);
      setSeedVisible(false);

      await Keychain.setGenericPassword('cresca', mnemonic, {
        service: 'cresca_wallet_mnemonic',
      });
      await Keychain.setGenericPassword('cresca', mnemonic, {
        service: 'cresca_seed_phrase',
      });

      createPasswordSheetRef.current?.dismiss();
      setTimeout(() => {
        setSeedSheetOpen(true);
        seedRevealSheetRef.current?.present();
      }, 180);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start wallet creation.';
      setCreateError(message);
    } finally {
      setBusy(false);
    }
  };

  const copySeedToClipboard = async () => {
    if (!generatedMnemonic.trim()) {
      return;
    }

    Clipboard.setString(generatedMnemonic);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (clipboardClearTimerRef.current) {
      clearTimeout(clipboardClearTimerRef.current);
    }

    clipboardClearTimerRef.current = setTimeout(() => {
      Clipboard.setString('');
    }, 30_000);
  };

  const finishOnboarding = async () => {
    if (!generatedMnemonic.trim()) {
      setSeedError('Missing generated seed phrase. Please restart wallet creation.');
      return;
    }

    setBusy(true);
    setSeedError('');

    try {
      await algorandService.importFromMnemonic(generatedMnemonic);
      await AsyncStorage.setItem(WALLET_EXISTS_KEY, '1');
      await AsyncStorage.setItem(ONBOARDING_DONE_KEY, '1');
      onboardingEmitter.emit();
      seedRevealSheetRef.current?.dismiss();
      router.replace('/index');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not complete onboarding.';
      setSeedError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenContainer style={styles.container} bottomInset={false}>
      <View style={styles.topLogoWrap}>
        <View style={styles.logoSquare}>
          <Text style={styles.logoText}>C</Text>
        </View>
      </View>

      <View style={styles.middleWrap}>
        <Text style={styles.title}>Let's get started</Text>
        <Text style={styles.subtitle}>
          Sign up or recover your wallet by entering your email below
        </Text>
      </View>

      <View style={styles.bottomWrap}>
        <PrimaryButton
          label="Create you a new wallet"
          onPress={() => {
            setCreateError('');
            createPasswordSheetRef.current?.present();
          }}
        />
        <PrimaryButton
          label="I already have a wallet"
          variant="outline"
          style={styles.importBtn}
          onPress={() => router.push('/onboarding/import')}
        />
      </View>

      <CrescaSheet sheetRef={createPasswordSheetRef} snapPoints={['60%']} title="Create your password">
        <View style={styles.sheetBody}>
          <Text style={styles.sheetSubtext}>You will use this to unlock your wallet.</Text>

          <CrescaInput
            label="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Enter password"
          />

          <CrescaInput
            label="Confirm your password"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm password"
          />

          {createError ? <Text style={styles.errorText}>{createError}</Text> : null}

          <PrimaryButton
            label="Continue"
            onPress={() => void startCreateWallet()}
            disabled={!canContinuePassword || busy}
            loading={busy}
          />
        </View>
      </CrescaSheet>

      <CrescaSheet
        sheetRef={seedRevealSheetRef}
        snapPoints={['75%']}
        title="Secret recovery phase"
        onClose={() => {
          setSeedSheetOpen(false);
          setSeedVisible(false);
        }}
      >
        <View style={styles.sheetBody}>
          <Text style={styles.sheetSubtext}>This phrase is the only way to recover your wallet.</Text>

          <View style={styles.seedGridWrap}>
            <View style={styles.seedGrid}>
              {seedWords.map((word, index) => (
                <View key={`seed-${index + 1}`} style={styles.seedChip}>
                  <Text style={styles.seedChipText}>
                    {index + 1}. {seedVisible ? word : '••••'}
                  </Text>
                </View>
              ))}
            </View>

            {!seedVisible ? (
              <TouchableOpacity style={styles.seedBlurOverlay} onPress={() => setSeedVisible(true)}>
                <Ionicons name="eye-off-outline" size={22} color={C.text.tInv} />
                <Text style={styles.seedBlurText}>Tap to reveal phrase</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <TouchableOpacity style={styles.copyLinkWrap} onPress={() => void copySeedToClipboard()}>
            <Text style={styles.copyLink}>Copy to Clipboard</Text>
          </TouchableOpacity>

          {seedError ? <Text style={styles.errorText}>{seedError}</Text> : null}

          <PrimaryButton
            label="Continue"
            onPress={() => void finishOnboarding()}
            disabled={!seedVisible || busy}
            loading={busy}
          />
        </View>
      </CrescaSheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.surfaces.bgBase,
    paddingHorizontal: H_PAD,
  },
  topLogoWrap: {
    alignItems: 'center',
    marginTop: 56,
  },
  logoSquare: {
    width: 64,
    height: 64,
    borderRadius: R.md,
    backgroundColor: C.brand.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    ...T.h1,
    color: C.text.tInv,
  },
  middleWrap: {
    marginTop: 52,
    alignItems: 'center',
  },
  title: {
    ...T.h1,
    color: C.text.t1,
    textAlign: 'center',
  },
  subtitle: {
    ...T.body,
    color: C.text.t2,
    textAlign: 'center',
    marginTop: S.sm,
    maxWidth: 310,
  },
  bottomWrap: {
    marginTop: 'auto',
    marginBottom: 40,
    gap: 10,
  },
  importBtn: {
    marginTop: 2,
  },
  sheetBody: {
    gap: 12,
  },
  sheetSubtext: {
    ...T.sm,
    color: C.text.t2,
  },
  errorText: {
    ...T.sm,
    color: C.semantic.danger,
  },
  seedGridWrap: {
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.borders.bVerified,
    backgroundColor: 'rgba(0,212,170,0.05)',
    padding: 10,
    overflow: 'hidden',
  },
  seedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  seedChip: {
    width: '31%',
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: C.borders.bVerified,
    backgroundColor: C.surfaces.bgBase,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  seedChipText: {
    ...T.sm,
    color: C.text.t1,
  },
  seedBlurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  seedBlurText: {
    ...T.smBold,
    color: C.text.tInv,
  },
  copyLinkWrap: {
    alignItems: 'flex-start',
  },
  copyLink: {
    ...T.bodyMd,
    color: C.brand.teal,
  },
});
