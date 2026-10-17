import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function getKey() {
  const secret = process.env.MELI_TOKEN_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('MELI_TOKEN_ENCRYPTION_KEY or AUTH_SECRET must be set');
  }
  return createHash('sha256').update(secret).digest();
}

// Format: base64(iv).base64(authTag).base64(ciphertext)
export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString('base64'))
    .join('.');
}

export function decryptToken(payload: string): string {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
