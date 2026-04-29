import expressListEndpoints from "express-list-endpoints";
import type { Router } from "express";

type Mount = { prefix: string; router: Router };

/**
 * Do **not** import route modules here — `auth.route` / guards →
 * this file creates a cycle and `ReferenceError: Cannot access … before initialization`.
 * Mounts come only from **`setRbacHttpMounts`** in `index.ts` after all routers load.
 */
let registeredMounts: Mount[] | null = null;

export function setRbacHttpMounts(mounts: Mount[]): void {
  registeredMounts = mounts;
}

function mountsForRbac(override?: Mount[]): Mount[] {
  if (override != null) {
    return override;
  }
  return registeredMounts ?? [];
}

export function normalizeHttpPath(p: string | undefined | null): string {
  let s = String(p ?? "").trim();
  if (!s) s = "/";
  if (!s.startsWith("/")) s = `/${s}`;
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

/** Uppercase verb; missing/invalid values become `UNKNOWN` so they do not silently match real routes. */
export function normalizeHttpMethod(m: string | undefined | null): string {
  const u = String(m ?? "").trim().toUpperCase();
  return u || "UNKNOWN";
}

export function routeKey(path: string, method: string): string {
  return `${normalizeHttpMethod(method)} ${normalizeHttpPath(path)}`;
}

/** `baseUrl` + `path` from Express (mounted router) → absolute path like `/auth/me`. */
export function joinMountedPath(baseUrl: string | undefined, path: string | undefined): string {
  const b = (baseUrl ?? "").replace(/\/$/, "");
  let p = path ?? "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (!b) return normalizeHttpPath(p);
  return normalizeHttpPath(`${b}${p === "/" ? "" : p}`);
}

/** Map real request paths to permission patterns (Mongo ObjectId segments → `:id`). */
export function normalizePathPatternForLookup(absPath: string): string {
  const p = normalizeHttpPath(absPath);
  const parts = p.split("/").filter(Boolean);
  const mapped = parts.map((seg) => (/^[a-f\d]{24}$/i.test(seg) ? ":id" : seg));
  return normalizeHttpPath(`/${mapped.join("/")}`);
}

function joinPrefixes(prefix: string, routePath: string): string {
  const p = prefix.replace(/\/$/, "");
  const r = routePath.startsWith("/") ? routePath : `/${routePath}`;
  if (r === "/") return p || "/";
  return `${p}${r}`;
}

export type DiscoveredRoute = {
  path: string;
  methods: string[];
};

export function getDiscoveredHttpRoutes(mounts?: Mount[]): DiscoveredRoute[] {
  const out: DiscoveredRoute[] = [];
  for (const { prefix, router } of mountsForRbac(mounts)) {
    const endpoints = expressListEndpoints(router as Parameters<typeof expressListEndpoints>[0]);
    for (const ep of endpoints) {
      let methods = (ep.methods ?? [])
        .filter((verb): verb is string => typeof verb === "string" && verb.trim() !== "")
        .map((m) => normalizeHttpMethod(m));
      if (methods.length === 0) {
        methods = ["GET"];
      }
      out.push({
        path: normalizeHttpPath(joinPrefixes(prefix, ep.path ?? "")),
        methods,
      });
    }
  }
  return out;
}

/** One row per HTTP verb + path (for RBAC coverage). */
export function flattenDiscoveredRoutes(mounts?: Mount[]): { path: string; method: string }[] {
  const rows: { path: string; method: string }[] = [];
  for (const r of getDiscoveredHttpRoutes(mounts)) {
    for (const method of r.methods) {
      rows.push({
        path: r.path,
        method: normalizeHttpMethod(method),
      });
    }
  }
  return rows;
}

export function suggestPermissionName(path: string, method: string): string {
  const slug = normalizeHttpPath(path)
    .replace(/^\//, "")
    .replace(/\//g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "");
  const base = `${normalizeHttpMethod(method).toLowerCase()}_${slug}`.replace(/^_+/, "");
  return base || `perm_${normalizeHttpMethod(method).toLowerCase()}`;
}

/** Stable unique permission name for `source: "all"` (any logged-in user). */
export function allPermissionNameForRoute(path: string, method: string): string {
  return `__all__:${suggestPermissionName(path, method)}`;
}

export function autoPermissionDescription(path: string, method: string): string {
  return `Auto-generated for ${normalizeHttpMethod(method)} ${normalizeHttpPath(path)}`;
}
