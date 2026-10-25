export type JwtPayload = {
  sub: string;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export type AuthResult = {
  user: PublicUser;
  token: string;
};
