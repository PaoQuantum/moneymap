/**
 * Copia de seguridad cifrada. Usa la criptografía del propio navegador (Web Crypto):
 * AES-GCM de 256 bits con una clave derivada de tu contraseña (PBKDF2, 250.000 vueltas).
 * Sin la contraseña, el archivo no se puede leer, ni siquiera por nosotros.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();
const ITER = 250000;

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));

async function keyFrom(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptBackup(data, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt);
  // Las claves de los PDF nunca van en la copia
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
  // Se codifica por partes para no reventar la pila con copias grandes
  const bytes = new Uint8Array(cipher);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return JSON.stringify({ app: 'moneymap', v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), data: btoa(bin) });
}

export async function decryptBackup(text, password) {
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('Este archivo no es una copia de MoneyMap.'); }
  if (file.app !== 'moneymap') throw new Error('Este archivo no es una copia de MoneyMap.');
  const key = await keyFrom(password, unb64(file.salt));
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, key, unb64(file.data));
    return JSON.parse(dec.decode(plain));
  } catch {
    throw new Error('La contraseña no es correcta.');
  }
}
