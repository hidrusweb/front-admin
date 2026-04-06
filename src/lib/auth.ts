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
  const token = localStorage.getItem('user_token');
  if (!token) return null;
  const payload = parseJwt(token);
  if (!payload) return null;
  if (Date.now() / 1000 > payload.exp) {
    localStorage.removeItem('user_token');
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
  localStorage.removeItem('user_token');
}
