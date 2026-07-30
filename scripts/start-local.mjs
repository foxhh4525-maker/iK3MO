// مشغّل محلي بسيط: يشغّل خادم الـ API المبنيّ من جذر المشروع مع الإعدادات الصحيحة.
// - NODE_ENV=production عشان الخادم يخدم الواجهة المبنيّة أيضاً على نفس المنفذ.
// - cwd = جذر المشروع عشان يلقى dev-admin.txt ويكتب local-data.json هناك.
// - ما يحتاج DATABASE_URL: بدونه يستخدم مخزّن محلي بملف تلقائياً.
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = path.join(root, "artifacts", "api-server", "dist", "index.mjs");

if (!fs.existsSync(serverPath)) {
  console.error("❌ ما لقيت الخادم المبنيّ. ابنِ أولاً:");
  console.error("   pnpm --filter @workspace/tournament run build");
  console.error("   pnpm --filter @workspace/api-server run build");
  process.exit(1);
}

const port = process.env.PORT || "10000";
const env = { ...process.env, NODE_ENV: "production", PORT: port };

console.log(`🚀 تشغيل الموقع على http://localhost:${port}  (الأدمن: http://localhost:${port}/admin)`);

const child = spawn(process.execPath, [serverPath], { stdio: "inherit", cwd: root, env });
child.on("exit", (code) => process.exit(code ?? 0));
