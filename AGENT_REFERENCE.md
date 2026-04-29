# Backend — agent reference

Single place to see **what owns what**. Update when **routes, env, or meaningful exports** change — **not** for minor bugfixes or internal refactors.

## How to use

- **Add** a row (or bullet) when you introduce a **new route**, **service entrypoint**, or **shared util** that other code should know about.
- **Delete** the matching row when that behavior is **removed** from the codebase.
- Keep **Environment** in sync when `src/env.ts` changes.
- Never paste secrets; document variable **names** only.

## Run / check (from `backend/`)

| Command        | Purpose                                      |
|----------------|----------------------------------------------|
| `npm run typecheck` | TypeScript only (`tsc --noEmit`) — run after edits |
| `npm run build`   | Full compile to `dist/`                      |
| `npm run dev`     | Dev server (nodemon + tsx)                   |
| `npm start`       | Run compiled `dist/` (after `build`)         |

## Environment

| Variable       | Purpose        |
|----------------|----------------|
| `MONGODB_URI`  | Mongo connection string                      |
| `PORT`         | HTTP port (default in code if unset)       |
| `NODE_ENV`     | `production` → JSON logs; dev → pretty pino  |
| `JWT_SECRET`   | Required for `POST /auth/login` (JWT signing) |
| `FE_LINK`      | Frontend origin for CORS (optional in dev; set in prod for credentialed requests) |
| `BE_LINK`      | **Required** for public asset URLs — public API base (no trailing slash), e.g. `http://localhost:4000`; used by `lib/publicAssetFiles.ts` for `/public-files/:id` links |
| `BREVO_API_KEY` | Brevo API key — transactional email (`lib/mail.ts`) |
| `MAIL_FROM_EMAIL` | Verified sender email in Brevo |
| `MAIL_FROM_NAME`  | Sender display name (optional; default `App`) |

(Add rows here when new vars appear in `src/env.ts`.)

## Stack (fixed)

- **Entry:** `src/index.ts` — `setRbacHttpMounts` (before connect), `app.set("etag", false)`, middleware, `mongoose.connect` → **`ensureAppConfig`** → **`ensureRbacPermissionRows`** → **`ensureAuthRoutePermissionSources`** (`ensureAppConfig.ts`: auth `auto` → `all_guest` / `all_user`) → `app.listen`. **`/public-files` is mounted before `helmet()`** so image responses are not blocked when embedded from another origin (e.g. Vite); mounts `/auth`, `/branding`, `/admin`, **`errorHandler`** last.
- **Config:** `src/env.ts` — loads `.env` from `backend/` or repo root.
- **Logging:** `src/lib/logger.ts` — Pino; `logger` app-wide, `req.log` per request.
- **Mail:** `src/lib/mail.ts` — `sendEmail` (Brevo), `sendOtpEmail` (OTP body + `sendEmail`).
- **Layers:** route → DTO + `validateOrThrow` / `registerFromBody` → async controller → service → model. Express **5** forwards rejected promises to `errorHandler`.

## Surface & responsibilities

| Route / export | Responsibility |
|----------------|----------------|
| `POST /auth/send-otp` | Body `{ email }` **or** `{ userId }` (not both) → **200** `{ expiresAt }`; plain OTP in DB + TTL index (wire email/SMS in prod) |
| `POST /auth/register` | `{ email, password, otp }` → **201** `{ id, email }`; **400** bad OTP; **409** duplicate |
| `POST /auth/login` | Login: `{ email, password }` → **200** `{ token, user }`; **400** / **401** / **503** if no `JWT_SECRET` |
| `auth.controller.sendOtp` | `SendOtpDto` → `auth.service.sendOtp` |
| `auth.controller.register` | `RegisterDto` + `validateOrThrow` → `auth.service.register` |
| `auth.controller.login` | `LoginDto` + `validateOrThrow` → `auth.service.login` |
| `auth.service.sendOtp` | `createOtp({ email })` or `createOtp({ userId })` — plain `code`, 10‑min `expiresAt` |
| `auth.service.register` | `verifyAndConsumeOtp` then duplicate check, bcrypt hash, create `User` |
| `auth.service.login` | Load user + `passwordHash`, bcrypt compare, JWT (`jsonwebtoken`) |
| `RegisterDto` / `registerFromBody` | Register body validation |
| `LoginDto` | Login body validation |
| `validateOrThrow` | `class-validator` on a DTO instance |
| `errorHandler` | **400** validation, **4xx/5xx** `HttpError`, else **500** |
| `createOtp` / `verifyAndConsumeOtp` | `lib/otp.ts` — 6‑digit code, **email XOR userId**, plain `code`, one‑time verify |
| `OtpModel` | `email` **or** `userId` (mutually exclusive), plain `code`, `expiresAt` (**TTL index** auto‑delete) |
| `UserModel` | `email` (unique), `passwordHash` (`select: false`) |
| `AppModel` | Singleton-style app metadata: `appName`, `appLogo` |
| `ensureAppConfig` | After DB connect: if no `App` doc, creates default; same module exports **`ensureAuthRoutePermissionSources`** |
| `ensureRbacPermissionRows` | Seeds missing **auto** `Permission` rows per discovered route |
| `ensureAuthRoutePermissionSources` (`ensureAppConfig.ts`) | After seed: `POST /auth/send-otp`, `/register`, `/login` → **`all_guest`**; `GET /auth/me`, `/validate` → **`all_user`** (only rows still **`auto`**) |
| `rbacAdmin.service` | Admin RBAC HTTP: routes, problems, permission CRUD, role CRUD |
| `adminApp.service` | Singleton app settings: `GET` / `PATCH` `appName`, `appLogo`, `openRegister`, `openLogin` |
| `GET|PATCH /admin/app` | Bearer + permission; read/update `AppModel` (same fields as public branding) |
| `POST /admin/app/logo` | Bearer + permission; multipart field `file` (jpg/jpeg/png, max 10 MiB). Upload uses shared public-asset service with transaction-safe single-use update semantics, then updates `AppModel.appLogo` to `/public-files/:id` URL |
| `adminLogoUpload` | `lib/adminLogoUpload.ts` — multer memory storage for logo `POST` |
| `publicAssetFiles` (`lib/publicAssetFiles.ts`) | Shared asset lifecycle over GridFS `publicAssets` + `PublicAssetModel`: `createPublicAsset`, `linkPublicAssetReference`, `unlinkPublicAssetReference`, `updatePublicAssetFile(mode=global|single-use)`, ACL updates (`updatePublicAssetAccess`, add/remove `availableTo`), and helpers for URL/id conversion |
| `GET /public-files/:fileId` | ACL-aware stream: if `isPublic=true` serve directly; if `isPublic=false` require Bearer JWT and `sub` in `availableTo`; router sets `Cross-Origin-Resource-Policy: cross-origin` |
| `frontend` dev proxy | `vite.config.js` proxies `/public-files` → `VITE_API_BASE_URL` or `http://localhost:4000`; `publicAssetUrlForDisplay()` rewrites stored absolute URLs to same-origin paths in dev so logos load without cross-origin blocks |
| `GET /admin/rbac/routes` | Discovered HTTP routes `{ path, method, suggestedName }[]` |
| `GET /admin/rbac/problems` | `routesWithoutPermission`, `permissionsNotInApp` |
| `GET|GET:id|POST|PATCH|DELETE /admin/rbac/permissions` | Permission catalog CRUD (PATCH: `name`, `description`, `source` only) |
| `GET|GET:id|POST|PATCH|DELETE /admin/rbac/roles` | Roles + `permissionIds` (paginated list: `page`, `limit`) |
| `routePermissionGuard` / `rbac.ts` | DB route check; `getEffectivePermissionKeys`, `userHasAnyPermission` |

## Shared asset quick reference

- **Storage split**
  - Bytes in GridFS bucket: `publicAssets.files` + `publicAssets.chunks`
  - Metadata in `PublicAssetModel` (`fileId`, `isPublic`, `availableTo`, `referenceCount`, optional `createdBy`)
- **Reference counting**
  - New upload starts with `referenceCount = 1`
  - Reuse in another entity: call `linkPublicAssetReference(fileId)` (increments count)
  - Unlink: call `unlinkPublicAssetReference(fileId)` (decrements count)
  - When count reaches `0`, service deletes GridFS bytes and metadata
- **Update modes**
  - `global`: replace bytes for same logical asset; all references see update
  - `single-use`: if shared (`referenceCount > 1`), fork into new asset with count `1` and decrement old
- **Documentation**
  - Full behavior doc: `backend/docs/shared-asset-refcount.md`
