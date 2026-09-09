/**
 * Auflösung für `@/…`-Importe im Node-Test-Runner.
 *
 * Next kennt den Alias aus `tsconfig.json`, Node nicht. Damit die Tests
 * dieselben Dateien laden wie die App — und nicht Kopien — bildet dieser Hook
 * `@/x` auf `<projekt>/x` ab und ergänzt die Endung, die ESM sonst verlangt.
 */
import { access } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = pathToFileURL(`${process.cwd()}/`);
const CANDIDATES = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts"];

async function firstExisting(base) {
  for (const suffix of CANDIDATES) {
    const url = new URL(base + suffix, root);
    try {
      await access(fileURLToPath(url));
      return url.href;
    } catch {
      // nächster Kandidat
    }
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = await firstExisting(specifier.slice(2));
    if (target) return nextResolve(target, context);
  }
  return nextResolve(specifier, context);
}
