import crypto from 'crypto';

const password = '12345678';
const configData = { hello: "world" };

// 1. Génération du salt (16 bytes)
const salt = crypto.randomBytes(16);
// 2. Dérivation de la clé (PBKDF2)
const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
// 3. Génération de l'IV (12 bytes pour AES-GCM)
const iv = crypto.randomBytes(12);

// 4. Chiffrement
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const jsonString = JSON.stringify(configData);
let encrypted = cipher.update(jsonString, 'utf8', 'base64');
encrypted += cipher.final('base64');
const authTag = cipher.getAuthTag().toString('base64');

// Concaténation des données chiffrées
const payload = encodeURIComponent(
  salt.toString('base64') + ':' +
  iv.toString('base64') + ':' +
  authTag + ':' +
  encrypted
);

console.log("PAYLOAD:", payload);

const decoded = decodeURIComponent(payload);
const [saltB64, ivB64, authTagB64, encryptedB64] = decoded.split(':');

// WebCrypto simulation using WebCrypto API from Node 19+
const webcrypto = crypto.webcrypto;

async function testWebCrypto() {
  const saltArr = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const ivArr = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const authTagArr = Uint8Array.from(atob(authTagB64), c => c.charCodeAt(0));
  const encryptedArr = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0));

  const enc = new TextEncoder();
  const keyMaterial = await webcrypto.subtle.importKey("raw", enc.encode(password), {name: "PBKDF2"}, false, ["deriveKey"]);
  
  const keyWeb = await webcrypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltArr, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const ciphertext = new Uint8Array(encryptedArr.length + authTagArr.length);
  ciphertext.set(encryptedArr);
  ciphertext.set(authTagArr, encryptedArr.length);

  try {
    const decryptedBuffer = await webcrypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivArr },
      keyWeb,
      ciphertext
    );
    const dec = new TextDecoder();
    console.log("SUCCESS:", dec.decode(decryptedBuffer));
  } catch(e) {
    console.error("DECRYPT FAIL", e);
  }
}

testWebCrypto();
