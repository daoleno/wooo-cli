import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH) as Buffer;
}

function safeFilename(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_") + ".enc";
}

export class Keystore {
  private dir: string;
  private password: string;

  constructor(dir: string, password: string) {
    this.dir = dir;
    this.password = password;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  async set(key: string, value: string): Promise<void> {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const derivedKey = deriveKey(this.password, salt);
    const cipher = createCipheriv(ALGORITHM, derivedKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(value, "utf-8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Format: salt(16) + iv(12) + tag(16) + encrypted
    const data = Buffer.concat([salt, iv, tag, encrypted]);
    writeFileSync(join(this.dir, safeFilename(key)), data.toString("base64"));
  }

  async get(key: string): Promise<string | null> {
    const filePath = join(this.dir, safeFilename(key));
    if (!existsSync(filePath)) return null;

    const raw = Buffer.from(readFileSync(filePath, "utf-8"), "base64");
    const salt = raw.subarray(0, SALT_LENGTH);
    const iv = raw.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = raw.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + TAG_LENGTH,
    );
    const encrypted = raw.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const derivedKey = deriveKey(this.password, salt);
    const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString("utf-8");
  }

  async delete(key: string): Promise<void> {
    const filePath = join(this.dir, safeFilename(key));
    if (existsSync(filePath)) unlinkSync(filePath);
  }

  async list(): Promise<string[]> {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".enc"))
      .map((f) => f.replace(/\.enc$/, "").replace(/_/g, ":"));
  }
}
