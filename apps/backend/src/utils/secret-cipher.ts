import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function deriveKey(): Buffer {
  return createHash('sha256').update(env.CREDENTIALS_ENCRYPTION_KEY).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSecret(ciphertext: string): string {
  const buffer = Buffer.from(ciphertext, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = buffer.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function redactSecrets(message: string, secrets: string[]): string {
  let result = message;
  for (const secret of secrets) {
    if (secret.length > 0) {
      result = result.split(secret).join('[redacted]');
    }
  }
  return result;
}
