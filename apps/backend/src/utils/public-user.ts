import type { PublicUser } from '../types/auth';

export function toPublicUser(user: { id: string; email: string }): PublicUser {
  return {
    id: user.id,
    email: user.email,
  };
}
