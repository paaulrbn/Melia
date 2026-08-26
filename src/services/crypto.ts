import { Config } from '../types';

function safeAtob(base64: string): string {
  let b64 = base64;
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }
  return atob(b64);
}

/**
 * Déchiffre une charge utile de configuration Melia (format salt:iv:authTag:encrypted)
 * chiffrée avec PBKDF2 (SHA-256, 100 000 itérations) et AES-GCM (256 bits).
 */
export async function decryptConfigPayload(payload: string, password: string): Promise<Config> {
  const [saltB64, ivB64, authTagB64, encryptedB64] = payload.split(':');
  if (!saltB64 || !ivB64 || !authTagB64 || !encryptedB64) {
    throw new Error('Format de configuration invalide.');
  }

  const salt = Uint8Array.from(safeAtob(saltB64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(safeAtob(ivB64), c => c.charCodeAt(0));
  const authTag = Uint8Array.from(safeAtob(authTagB64), c => c.charCodeAt(0));
  const encrypted = Uint8Array.from(safeAtob(encryptedB64), c => c.charCodeAt(0));

  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const key = await window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const ciphertext = new Uint8Array(encrypted.length + authTag.length);
  ciphertext.set(encrypted);
  ciphertext.set(authTag, encrypted.length);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  const dec = new TextDecoder();
  const decryptedString = dec.decode(decryptedBuffer);
  return JSON.parse(decryptedString) as Config;
}
