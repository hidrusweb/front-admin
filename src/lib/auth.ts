export interface JwtPayload {
  sub: string;
  email?: string;
  unique_name?: string;
  given_name?: string;
  family_name?: string;
  role: string | string[];
  nbf: number;
  exp: number;
  iat: number;
}

const TOKEN_STORAGE_KEY = 'user_token';
const LEGACY_TOKEN_KEYS = ['token', 'access_token', 'accessToken'] as const;

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  for (const key of LEGACY_TOKEN_KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}

export function getToken(): string | null {
  const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (stored) return stored;

  const legacy = LEGACY_TOKEN_KEYS.map((k) => localStorage.getItem(k)).find((v) => !!v);
  if (legacy) {
    localStorage.setItem(TOKEN_STORAGE_KEY, legacy);
    return legacy;
  }

  const fromSession = [TOKEN_STORAGE_KEY, ...LEGACY_TOKEN_KEYS]
    .map((k) => sessionStorage.getItem(k))
    .find((v) => !!v);
  if (fromSession) {
    localStorage.setItem(TOKEN_STORAGE_KEY, fromSession);
    return fromSession;
  }
  return null;
}

/** Nome para exibição a partir das claims do JWT (Nome/Sobrenome, e-mail ou login). */
export function getUserDisplayName(u: JwtPayload | null | undefined): string {
  if (!u) return 'Usuário';
  const gn = (u.given_name ?? '').trim();
  const fn = (u.family_name ?? '').trim();
  if (gn && fn) return `${gn} ${fn}`;
  if (gn) return gn;
  const login = (u.unique_name ?? '').trim();
  if (login) return login;
  const em = (u.email ?? '').trim();
  if (em) return em;
  return 'Usuário';
}

export function parseJwt(token: string): JwtPayload | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getUser(): JwtPayload | null {
  const token = getToken();
  if (!token) return null;
  const payload = parseJwt(token);
  if (!payload) return null;
  if (Date.now() / 1000 > payload.exp) {
    clearToken();
    return null;
  }
  return payload;
}

export function getRole(): string {
  const user = getUser();
  if (!user) return '';
  return Array.isArray(user.role) ? user.role[0] : user.role;
}

export function hasRole(...roles: string[]): boolean {
  const role = getRole();
  return roles.includes(role);
}

export function logout(): void {
  clearToken();
}
