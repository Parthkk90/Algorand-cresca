import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import algosdk from 'algosdk';
import bip39 from 'bip39';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Keychain from 'react-native-keychain';
import nacl from 'tweetnacl';
import { ScreenContainer } from '../../components/ScreenContainer';
import { CrescaInput, PrimaryButton } from '../../src/components/ui';
import { C, H_PAD, R, S, T } from '../../src/theme';
import { algorandService } from '../../services/algorandService';
import { onboardingEmitter } from '../../utils/onboardingEmitter';

const ONBOARDING_DONE_KEY = 'cresca_onboarding_completed';
const WALLET_EXISTS_KEY = 'cresca_wallet_exists';

type ValidationState = 'idle' | 'invalid' | 'verified';

function parseWords(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
}

function validateImportPhrase(words: string[]): ValidationState {
  if (words.length === 0) return 'idle';

  const phrase = words.join(' ');

  if (words.length === 25) {
    try {
      algosdk.mnemonicToSecretKey(phrase);
      return 'verified';
    } catch {
      return 'invalid';
    }
  }

  if (words.length !== 12 && words.length !== 24) {
    return 'invalid';
  }

  const allWordsExist = words.every((word) => bip39.wordlists.english.includes(word));
  if (!allWordsExist) return 'invalid';

  return bip39.validateMnemonic(phrase) ? 'verified' : 'invalid';
}

export default function ImportOnboardingScreen() {
  const router = useRouter();

  const [rawPhrase, setRawPhrase] = useState('');
  const [chipWords, setChipWords] = useState<string[]>([]);
  const [mode, setMode] = useState<'text' | 'chips'>('text');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const activeWords = useMemo(() => {
    return mode === 'chips' ? chipWords : parseWords(rawPhrase);
  }, [chipWords, mode, rawPhrase]);

  const validationState = useMemo(() => validateImportPhrase(activeWords), [activeWords]);

  const setPhraseText = (text: string) => {
    setRawPhrase(text);
    const words = parseWords(text);

    if (words.length >= 2 && mode !== 'chips') {
      setChipWords(words);
      setMode('chips');
      return;
    }

    if (mode === 'chips') {
      setChipWords(words);
    }
  };

  const pasteFromClipboard = async () => {
    const clip = await Clipboard.getStringAsync();
    setRawPhrase(clip);
    const words = parseWords(clip);
    if (words.length > 0) {
      setChipWords(words);
      setMode('chips');
    }
  };

  const clearAll = () => {
    setRawPhrase('');
    setChipWords([]);
    setMode('text');
    setError('');
  };

  const deriveAlgorandMnemonic = (words: string[]): string => {
    const phrase = words.join(' ');

    try {
      algosdk.mnemonicToSecretKey(phrase);
      return phrase;
    } catch {
      const seedBytes = bip39.mnemonicToSeedSync(phrase).subarray(0, 32);
      const keyPair = nacl.sign.keyPair.fromSeed(new Uint8Array(seedBytes));
      const derivedMnemonic = algosdk.secretKeyToMnemonic(new Uint8Array(keyPair.secretKey));

      // Required derivation path in prompt: use algosdk.mnemonicToSecretKey before storing.
      algosdk.mnemonicToSecretKey(derivedMnemonic);
      return derivedMnemonic;
    }
  };

  const continueImport = async () => {
    if (validationState !== 'verified') {
      return;
    }

    setBusy(true);
    setError('');

    try {
      const algoMnemonic = deriveAlgorandMnemonic(activeWords);

      await Keychain.setGenericPassword('cresca', algoMnemonic, {
        service: 'cresca_wallet_mnemonic',
      });
      await Keychain.setGenericPassword('cresca', algoMnemonic, {
        service: 'cresca_seed_phrase',
      });

      await algorandService.importFromMnemonic(algoMnemonic);
      await AsyncStorage.setItem(WALLET_EXISTS_KEY, '1');
      await AsyncStorage.setItem(ONBOARDING_DONE_KEY, '1');

      onboardingEmitter.emit();
      router.replace('/index');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Failed to import seed phrase.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const statusLabel =
    validationState === 'verified'
      ? '✔ Verified'
      : validationState === 'invalid'
        ? '✕ Not valid'
        : 'Enter 12, 24, or 25 words';

  const statusColor =
    validationState === 'verified'
      ? C.semantic.success
      : validationState === 'invalid'
        ? C.semantic.danger
        : C.text.t2;

  const chipBorderColor =
    validationState === 'verified'
      ? C.borders.bVerified
      : validationState === 'invalid'
        ? C.borders.bError
        : C.borders.bDefault;

  return (
    <ScreenContainer style={styles.container} bottomInset={false}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.logoSmall} onPress={() => router.back()}>
          <Text style={styles.logoText}>C</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.title}>Import through Seed phrase 🤫</Text>

      <Text style={styles.seedTitle}>Seed phrase</Text>
      <Text style={styles.subtitle}>
        Enter your 12 or 24 words Seed Phrase below to import your wallet
      </Text>

      {mode === 'text' ? (
        <View style={styles.textModeWrap}>
          <CrescaInput
            value={rawPhrase}
            onChangeText={setPhraseText}
            placeholder="Enter Seed Phrase here"
            multiline
            inputStyle={styles.seedTextArea}
            containerStyle={styles.seedTextContainer}
          />
          <PrimaryButton label="Paste from Clipboard" onPress={() => void pasteFromClipboard()} />
        </View>
      ) : (
        <View style={[styles.chipGridWrap, { borderColor: chipBorderColor }]}> 
          <View style={styles.chipGrid}>
            {chipWords.map((word, index) => (
              <View key={`chip-${index + 1}`} style={[styles.chip, { borderColor: chipBorderColor }]}> 
                <Text style={styles.chipText}>{word}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <Text style={[styles.statusBadge, { color: statusColor }]}>{statusLabel}</Text>

      <TouchableOpacity onPress={clearAll} style={styles.clearWrap}>
        <Text style={styles.clearText}>Clear all</Text>
      </TouchableOpacity>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <PrimaryButton
        label="Continue"
        onPress={() => void continueImport()}
        disabled={validationState !== 'verified' || busy}
        loading={busy}
      />

      {busy ? (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="small" color={C.brand.teal} />
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.surfaces.bgBase,
    paddingHorizontal: H_PAD,
  },
  headerRow: {
    marginTop: 20,
    marginBottom: 20,
  },
  logoSmall: {
    width: 32,
    height: 32,
    borderRadius: R.sm,
    backgroundColor: C.brand.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    ...T.bodyMd,
    color: C.text.tInv,
  },
  title: {
    ...T.h1,
    color: C.text.t1,
  },
  seedTitle: {
    ...T.h3,
    color: C.text.t1,
    marginTop: S.md,
  },
  subtitle: {
    ...T.body,
    color: C.text.t2,
    marginTop: S.xs,
    marginBottom: S.md,
  },
  textModeWrap: {
    gap: S.sm,
    marginBottom: S.md,
  },
  seedTextContainer: {
    backgroundColor: C.surfaces.bgSurface,
    borderRadius: R.sm,
  },
  seedTextArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  chipGridWrap: {
    backgroundColor: C.surfaces.bgBase,
    borderRadius: R.md,
    borderWidth: 1,
    padding: 10,
    marginBottom: S.sm,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: R.sm,
    backgroundColor: C.surfaces.bgSurface,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipText: {
    ...T.sm,
    color: C.text.t1,
  },
  statusBadge: {
    ...T.smBold,
    marginBottom: S.sm,
  },
  clearWrap: {
    alignItems: 'flex-start',
    marginBottom: S.sm,
  },
  clearText: {
    ...T.bodyMd,
    color: C.brand.teal,
  },
  errorText: {
    ...T.sm,
    color: C.semantic.danger,
    marginBottom: S.sm,
  },
  busyOverlay: {
    marginTop: S.sm,
    alignItems: 'center',
  },
});
