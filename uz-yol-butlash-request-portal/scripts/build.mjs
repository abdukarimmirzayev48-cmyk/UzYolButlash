import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function loadDotEnv() {
  try {
    const source = await readFile(".env", "utf8");
    source.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
      const [key, ...rest] = trimmed.split("=");
      if (!process.env[key]) process.env[key] = rest.join("=").replace(/^["']|["']$/g, "");
    });
  } catch {
    // .env is optional.
  }
}

await loadDotEnv();

const apiBaseUrl = JSON.stringify(process.env.VITE_API_BASE_URL || "http://127.0.0.1:8000");
const erpLoginUrl = JSON.stringify(process.env.VITE_ERP_LOGIN_URL || "http://127.0.0.1:8000/dashboard");

async function postProcessJs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await postProcessJs(path);
      return;
    }
    if (!entry.name.endsWith(".js")) return;
    let source = await readFile(path, "utf8");
    source = source
      .replace(/import\s+["']\.\/styles\/global\.css["'];?\n?/, "")
      .replaceAll("import.meta.env.VITE_API_BASE_URL", apiBaseUrl)
      .replaceAll("import.meta.env.VITE_ERP_LOGIN_URL", erpLoginUrl)
      .replace(/(from\s+["'])(\.\.?\/[^"']+?)(["'])/g, (_match, start, specifier, end) => {
        if (/\.(js|css|json|svg|png|jpg|jpeg|webp)$/.test(specifier)) return `${start}${specifier}${end}`;
        return `${start}${specifier}.js${end}`;
      });
    await writeFile(path, source);
  }));
}

await mkdir("dist/styles", { recursive: true });
await cp("src/styles/global.css", "dist/styles/global.css");
await postProcessJs("dist/src");

await writeFile(
  "dist/index.html",
  `<!doctype html>
<html lang="uz">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>UzYolButlash | Talabnoma yuborish</title>
    <script type="importmap">
      {
        "imports": {
          "react": "https://esm.sh/react@19.0.0",
          "react/jsx-runtime": "https://esm.sh/react@19.0.0/jsx-runtime",
          "react-dom/client": "https://esm.sh/react-dom@19.0.0/client?external=react"
        }
      }
    </script>
    <link rel="stylesheet" href="/styles/global.css">
    <script type="module" src="/src/main.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`,
);
