/** Caminho público da logo horizontal (respeita `base` do Vite, ex. /admin/). */
export function logoHydrusHorizontalSrc(): string {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}images/logo-hydrus-horizontal.png`;
}

/** URL absoluta — melhora impressão no navegador e fetch para PDF. */
export function logoHydrusHorizontalAbsoluteUrl(): string {
  if (typeof window === 'undefined') return logoHydrusHorizontalSrc();
  return new URL(logoHydrusHorizontalSrc(), window.location.origin).href;
}
