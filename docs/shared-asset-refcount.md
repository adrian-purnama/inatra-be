# Shared Asset Storage with Reference Count

This project uses GridFS for file bytes and `PublicAsset` documents for metadata, access control, and lifecycle management.

## Where files are stored

- **Binary file bytes**: MongoDB GridFS bucket `publicAssets`
  - collections: `publicAssets.files`, `publicAssets.chunks`
- **Metadata and ACL**: `PublicAsset` model/document
  - `fileId`, `size`, `contentType`, `extension`, `filename`
  - `isPublic`, `availableTo`
  - `referenceCount`
  - `createdBy` (optional)

## Core lifecycle behavior

Implemented in `backend/src/lib/publicAssetFiles.ts`.

### 1) Create new file

`createPublicAsset(input)`:

1. Upload bytes to GridFS
2. Create one `PublicAsset` metadata row
3. Initialize `referenceCount = 1`

All multi-step DB operations are wrapped with Mongo transactions (`mongoose.startSession()` + `withTransaction()`).

### 2) Reuse existing file

`linkPublicAssetReference(fileId)`:

- Increments `referenceCount` by 1 using atomic `$inc`.
- Used when another entity references the same file without re-uploading.

### 3) Unlink / delete usage

`unlinkPublicAssetReference(fileId)`:

- Decrements `referenceCount` by 1.
- If count is still `> 0`: keep file and metadata.
- If count reaches `0`: delete from GridFS and delete metadata.

`deletePublicAsset(fileId)` uses unlink semantics so shared files are not removed too early.

### 4) Update behavior

`updatePublicAssetFile(fileId, mode, input)` supports:

- `mode = "global"`
  - Replace underlying file bytes/metadata.
  - Keep same logical asset record and preserve `referenceCount`.
  - All consumers see the new file.

- `mode = "single-use"`
  - If `referenceCount <= 1`: overwrite same asset.
  - If `referenceCount > 1`: **fork**:
    1. decrement old asset count
    2. create a new asset with `referenceCount = 1`
    3. return the new file id/url so only this usage changes

This prevents unintended changes to other entities sharing the same file.

## Access control when serving files

Implemented in `backend/src/controllers/publicFiles.controller.ts` for route:

- `GET /public-files/:fileId`

Rules:

- If `isPublic === true`: file is served without auth checks.
- If `isPublic === false`:
  - Requires Bearer JWT
  - JWT `sub` must exist in `availableTo`
  - Otherwise returns `401/403`

## App logo example (current behavior)

Upload flow is in `backend/src/services/adminApp.service.ts`:

1. `POST /admin/app/logo` uploads image (jpg/jpeg/png)
2. Service calls `updatePublicAssetFile(previousId, "single-use", ...)` when a prior logo exists
3. New logo bytes are stored in GridFS (`publicAssets` bucket)
4. `AppModel.appLogo` stores URL string:
   - `http(s)://<BE_LINK>/public-files/<fileId>`
5. Frontend loads logo via that URL through `GET /public-files/:fileId`

So the app logo is **not stored directly in `App` as bytes**. `App.appLogo` stores a file URL, while actual bytes live in GridFS.

## Size/type validation notes

- Global public asset size limit: 10 MiB in `publicAssetFiles`.
- Route-specific MIME checks can be stricter (example: admin logo only jpeg/png).
