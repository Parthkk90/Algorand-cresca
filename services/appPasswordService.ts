import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { authEmitter } from '../utils/authEmitter';

const APP_PASSWORD_HASH_KEY = 'cresca_app_password_hash_v1';
const APP_PASSWORD_SALT_KEY = 'cresca_app_password_salt_v1';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

class AppPasswordService {
  private sessionUnlocked = false;

  private async hashWithSalt(password: string, salt: string): Promise<string> {
    return Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${salt}:${password}`,
      { encoding: Crypto.CryptoEncoding.HEX },
    );
  }

  async hasPassword(): Promise<boolean> {
    const hash = await SecureStore.getItemAsync(APP_PASSWORD_HASH_KEY);
    return Boolean(hash);
  }

  async setPassword(password: string): Promise<void> {
    const saltBytes = Crypto.getRandomBytes(16);
    const salt = bytesToHex(saltBytes);
    const hash = await this.hashWithSalt(password, salt);

    await SecureStore.setItemAsync(APP_PASSWORD_SALT_KEY, salt, {
      requireAuthentication: false,
    });
    await SecureStore.setItemAsync(APP_PASSWORD_HASH_KEY, hash, {
      requireAuthentication: false,
    });

    this.markUnlocked();
  }

  async verifyPassword(password: string): Promise<boolean> {
    const [storedSalt, storedHash] = await Promise.all([
      SecureStore.getItemAsync(APP_PASSWORD_SALT_KEY),
      SecureStore.getItemAsync(APP_PASSWORD_HASH_KEY),
    ]);

    if (!storedSalt || !storedHash) {
      return false;
    }

    const candidate = await this.hashWithSalt(password, storedSalt);
    const ok = candidate === storedHash;
    if (ok) {
      this.markUnlocked();
    }
    return ok;
  }

  isSessionUnlocked(): boolean {
    return this.sessionUnlocked;
  }

  markUnlocked(): void {
    this.sessionUnlocked = true;
    authEmitter.emit(true);
  }

  lockSession(): void {
    this.sessionUnlocked = false;
    authEmitter.emit(false);
  }
}

export const appPasswordService = new AppPasswordService();
