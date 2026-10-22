import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const SOURCE = /\.(m?[jt]sx?|json)$/;

// The project's TypeScript sources are ES modules. Saying so here keeps Node from guessing (and warning)
// now that package.json no longer sets "type": "module" (which broke Next.js functions on Vercel).
const asModule = (result) =>
  result.url.startsWith(root.href) && !result.url.includes("/node_modules/") && /\.tsx?$/.test(result.url) && !result.format
    ? { ...result, format: "module-typescript" }
    : result;

export async function resolve(specifier, context, nextResolve) {
  return asModule(await resolveSource(specifier, context, nextResolve));
}

async function resolveSource(specifier, context, nextResolve) {
  const parent = context.parentURL ?? "";
  const fromProject = parent.startsWith(root.href) && !parent.includes("/node_modules/");
  let base = null;
  if (specifier.startsWith("@/")) base = new URL(specifier.slice(2), root);
  else if (fromProject && /^\.\.?\//.test(specifier)) base = new URL(specifier, parent);

  if (base) {
    for (const suffix of ["", ".ts", ".tsx", "/index.ts"]) {
      const path = fileURLToPath(base.href + suffix);
      if (existsSync(path) && statSync(path).isFile() && SOURCE.test(path)) {
        return nextResolve(new URL(base.href + suffix).href, context);
      }
    }
  }
  // Next.js subpath imports ("next/headers") resolve through its bundler; plain Node needs ".js".
  if (/^next\/[a-z-]+$/.test(specifier)) return nextResolve(`${specifier}.js`, context);
  return nextResolve(specifier, context);
}
