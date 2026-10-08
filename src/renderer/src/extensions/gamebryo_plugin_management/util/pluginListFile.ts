import { readdirSync } from "node:fs";
import * as path from "path";

/**
 * Path of a plugin list file (plugins.txt, loadorder.txt) in `dir`.
 *
 * The games create "Plugins.txt" themselves. Windows ignores the case, but under
 * Proton on a case-sensitive filesystem Wine opens that exact name first, so
 * writing "plugins.txt" next to it would leave the game reading a stale file.
 * Reuse whichever spelling already exists.
 */
export function pluginListFile(dir: string, fileName: string): string {
  if (process.platform === "win32") {
    return path.join(dir, fileName);
  }
  try {
    const wanted = fileName.toLowerCase();
    const existing = readdirSync(dir).find((name) => name.toLowerCase() === wanted);
    return path.join(dir, existing ?? fileName);
  } catch {
    return path.join(dir, fileName);
  }
}
