import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDotenv } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// cwd is often `backend/` while `.env` may live at repo root — try both.
const envPaths = [
  path.join(__dirname, "../.env"),
  path.join(__dirname, "../../.env"),
];
const envFile = envPaths.find((p) => existsSync(p));
if (envFile) {
  configDotenv({ path: envFile });
} else {
  configDotenv();
}

export const env = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV ?? "development",
  jwtSecret: process.env.JWT_SECRET ?? "",
  mongodbUri: process.env.MONGODB_URI?.trim() ?? "",
  feLink: process.env.FE_LINK?.trim() ?? "",
  /** Public base URL for this API (no trailing slash) — e.g. absolute links to `/public-files/:id`. */
  beLink: process.env.BE_LINK?.trim() ?? "",
  /** Brevo (https://app.brevo.com) — transactional email API key */
  brevoApiKey: process.env.BREVO_API_KEY?.trim() ?? "",
  mailFromEmail: process.env.MAIL_FROM_EMAIL?.trim() ?? "",
  mailFromName: process.env.MAIL_FROM_NAME?.trim() ?? "App",
};