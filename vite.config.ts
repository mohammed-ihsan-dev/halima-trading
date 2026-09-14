import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

function fixPunycodePlugin() {
  const fs = require("fs");
  const path = require("path");
  const punycodePath = path.join(process.cwd(), "node_modules/punycode/punycode.js");
  const punycodeSource = fs.readFileSync(punycodePath, "utf-8");
  const punycodeIIFE = `(function() { var module = { exports: {} }; ${punycodeSource}; return module.exports; })()`;

  return {
    name: "fix-punycode-alias",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      if (code.includes("punycode/") || code.includes("require(\"punycode\")") || code.includes("__require(\"punycode\")")) {
        const fixedCode = code
          .replace(/__require\(["']punycode\/["']\)/g, punycodeIIFE)
          .replace(/require\(["']punycode\/["']\)/g, punycodeIIFE)
          .replace(/__require\(["']punycode["']\)/g, punycodeIIFE)
          .replace(/require\(["']punycode["']\)/g, punycodeIIFE);
        return {
          code: fixedCode,
          map: null,
        };
      }
    },
  };
}

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  const path = await import("path");
  const punycodePath = path.join(process.cwd(), "node_modules/punycode/punycode.js");
  const punycodeAlias = {
    "punycode/": punycodePath,
    "punycode": punycodePath,
    "node:punycode": punycodePath,
  };

  return {
    resolve: {
      alias: punycodeAlias,
    },
    optimizeDeps: {
      include: ["tr46", "whatwg-url", "mongodb-connection-string-url"],
      rolldownOptions: {
        resolve: {
          alias: punycodeAlias,
        },
      },
    },
    environments: {
      rsc: {
        optimizeDeps: {
          include: ["tr46", "whatwg-url", "mongodb-connection-string-url"],
          rolldownOptions: {
            resolve: {
              alias: punycodeAlias,
            },
          },
        },
        resolve: {
          alias: punycodeAlias,
        },
      },
      ssr: {
        optimizeDeps: {
          include: ["tr46", "whatwg-url", "mongodb-connection-string-url"],
          rolldownOptions: {
            resolve: {
              alias: punycodeAlias,
            },
          },
        },
        resolve: {
          alias: punycodeAlias,
        },
      },
    },
    ssr: {
      noExternal: true,
    },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      fixPunycodePlugin(),
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
