import type { PublicUser } from '../types/auth';

export function toPublicUser(user: {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}
