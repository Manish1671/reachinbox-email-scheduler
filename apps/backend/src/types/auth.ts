export type JwtPayload = {
  sub: string;
};

export type AuthenticatedUser = {
  id: string;
  email: string;
};

export type PublicUser = {
  id: string;
  email: string;
};

export type AuthResult = {
  user: PublicUser;
  token: string;
};
