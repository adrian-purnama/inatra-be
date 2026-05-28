# Foldering system reference (namespace + SKU)

This project uses a **generic folder tree** that is split by `namespace` so it can be reused (product today, warehouse later, etc.).

## Key concepts

- **Folder node**: one row in `FolderNode` with `namespace`, `parentId`, `name`, and `code3`.
- **Namespace**: isolates different “folder worlds” (e.g. `product`, `warehouse`). Never mix them.
- **`code3`**: stable 3-letter segment used for SKU. It’s generated on folder create and **does not change** on rename.

## Current namespaces

- `product`: product categories/folders used for SKU generation.

## APIs

### Folder nodes

- `GET /folders/product?parentId=<id|null>&includeInactive=true|false`
- `POST /folders/product` `{ parentId?, name, isActive? }`
- `PATCH /folders/product/:id` `{ name?, isActive? }`
- `DELETE /folders/product/:id` (blocked if it has children or products)

Legacy alias (still supported):

- `GET /folder-node?namespace=product&parentId=<id|null>&includeInactive=true|false`
- `POST /folder-node` `{ namespace, parentId?, name, isActive? }`
- `PATCH /folder-node/:id`
- `DELETE /folder-node/:id`

### Products

- `GET /data-entry/product`
- `POST /data-entry/product` `{ name, folderId }`
- `PATCH /data-entry/product/:id` `{ name?, folderId? }`
- `DELETE /data-entry/product/:id`

## SKU rules (product namespace)

SKU is generated from the full folder path:

- Prefix: join all folder `code3` from root → leaf with `-`
- Suffix: per-leaf-folder counter padded to 4 digits

Example:

- `Electronics > Motherboard > Asus` → `ELE-MOT-ASU-0001`

If you move a product to a different folder (`PATCH folderId`), SKU is regenerated and the old SKU is appended to `skuHistory`.

## How to add a new domain later (example: warehouse)

1. Reuse the same folder endpoints with `namespace=warehouse` (no code change required).
2. Add a new entity/service that references folder nodes in that namespace.
3. Add delete guards (like product) so folders cannot be deleted while referenced.

