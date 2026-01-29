import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw?.trim()) {
    throw new Error(
      'ENCRYPTION_KEY is required (32-byte key as hex or base64). Generate with: openssl rand -hex 32'
    );
  }
  const trimmed = raw.trim();
  if (trimmed.length === 64 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  const buf = Buffer.from(trimmed, 'base64');
  if (buf.length !== KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must be 32 bytes (got ${buf.length} from base64). Use hex (64 chars) or base64.`
    );
  }
  return buf;
}

export class EncryptionService {
  private readonly key: Buffer;

  constructor(key?: Buffer) {
    this.key = key ?? getKey();
    if (this.key.length !== KEY_LENGTH) {
      throw new Error(`Encryption key must be ${KEY_LENGTH} bytes`);
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const enc = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, enc, tag]).toString('base64');
  }

  decrypt(ciphertextBase64: string): string {
    const raw = Buffer.from(ciphertextBase64, 'base64');
    if (raw.length < IV_LENGTH + TAG_LENGTH) {
      throw new Error('Invalid ciphertext: too short');
    }
    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(raw.length - TAG_LENGTH);
    const enc = raw.subarray(IV_LENGTH, raw.length - TAG_LENGTH);
    const decipher = createDecipheriv(ALGO, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
      'utf8'
    );
  }
}

let defaultInstance: EncryptionService | null = null;

export function getEncryptionService(): EncryptionService {
  if (!defaultInstance) {
    defaultInstance = new EncryptionService();
  }
  return defaultInstance;
}
