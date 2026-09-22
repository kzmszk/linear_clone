export function apiPathSegments(pathname: string): string[] | null {
  const prefix = '/api/v1';
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return null;
  return pathname.slice(prefix.length).split('/').filter(Boolean);
}
