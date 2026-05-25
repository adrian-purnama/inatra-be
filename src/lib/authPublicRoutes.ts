import { normalizeHttpMethod, normalizeHttpPath } from "./listHttpRoutes.js";

/** Unauthenticated auth endpoints — must stay public for first-user bootstrap. */
export const GUEST_AUTH_ROUTES = [
  { path: "/auth/send-otp", method: "POST" },
  { path: "/auth/register", method: "POST" },
  { path: "/auth/login", method: "POST" },
] as const;

/** Session validation — any valid JWT, no role permission required. */
export const ALL_USER_AUTH_ROUTES = [
  { path: "/auth/me", method: "GET" },
  { path: "/auth/validate", method: "GET" },
] as const;

export function isGuestAuthRoute(path: string, method: string): boolean {
  const p = normalizeHttpPath(path);
  const m = normalizeHttpMethod(method);
  return GUEST_AUTH_ROUTES.some(
    (r) => r.path === p && normalizeHttpMethod(r.method) === m,
  );
}

export function isAllUserAuthRoute(path: string, method: string): boolean {
  const p = normalizeHttpPath(path);
  const m = normalizeHttpMethod(method);
  return ALL_USER_AUTH_ROUTES.some(
    (r) => r.path === p && normalizeHttpMethod(r.method) === m,
  );
}
