import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '../config/constants';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    return false;
  }
  return bcrypt.compare(plain, hash);
}
