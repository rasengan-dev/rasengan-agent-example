import { resolve } from "node:path";

/** The repository root: relative paths in the environment resolve from here. */
const ROOT = resolve(import.meta.dirname, "../..");

const list = (value: string | undefined, fallback: string[]) =>
  value ? value.split(",").map((item) => item.trim()).filter(Boolean) : fallback;

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",

  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  models: list(process.env.AGENT_MODELS, ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]),

  /** The Rasengan site the agent edits. Created from the template on first start. */
  siteDir: resolve(ROOT, process.env.SITE_DIR ?? "workspace/site"),
  templateDir: resolve(ROOT, process.env.TEMPLATE_DIR ?? "template"),
  /** The built dashboard, served by this server in Docker. In dev the dashboard runs on its own port. */
  dashboardDir: resolve(ROOT, process.env.DASHBOARD_DIR ?? "dashboard/dist"),

  /** Where the browser reaches the site's dev server (the dashboard's preview iframe). */
  previewUrl: process.env.PREVIEW_URL ?? "http://localhost:5320",
  previewPort: 5320,

  /** Origins allowed to call the API cross-origin: the dashboard's dev server. */
  corsOrigins: list(process.env.CORS_ORIGINS, ["http://localhost:5300", "http://127.0.0.1:5300"]),
};
