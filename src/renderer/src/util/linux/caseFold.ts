import { readdirSync } from "node:fs";
import { readdir, rename, rmdir, stat } from "node:fs/promises";
import * as path from "path";

import { log } from "../log";

/** Uppercase letters in a name; game folders are PascalCase ("Data", "Plugins"). */
function upperCount(name: string): number {
  return name.replace(/[^A-Z]/g, "").length;
}

/**
 * Decides one spelling for every folder and file of a deployment, because
 * Windows games under Wine treat "Plugins" and "plugins" as the same folder but
 * a Linux filesystem keeps both, and the game only reads one of them.
 *
 * A name that already exists in the destination wins (preferring the more
 * capitalised one if several variants exist there), otherwise the first mod
 * to use a name decides it.
 */
export class CaseFolder {
  // lowercased relative folder -> (lowercased child name -> chosen spelling)
  private mChildren = new Map<string, Map<string, string>>();

  constructor(private mDestination: string) {}

  /** The chosen spelling of a path relative to the destination. */
  public canonical(relPath: string): string {
    let current = "";
    for (const segment of relPath.split(/[\\/]/).filter((seg) => seg.length > 0)) {
      const names = this.childNames(current);
      const lower = segment.toLowerCase();
      let name = names.get(lower);
      if (name === undefined) {
        name = segment;
        names.set(lower, name);
      }
      current = current.length === 0 ? name : path.join(current, name);
    }
    return current;
  }

  private childNames(relDir: string): Map<string, string> {
    const key = relDir.toLowerCase();
    let names = this.mChildren.get(key);
    if (names === undefined) {
      names = new Map();
      try {
        for (const entry of readdirSync(path.join(this.mDestination, relDir))) {
          const lower = entry.toLowerCase();
          const existing = names.get(lower);
          if (existing === undefined || upperCount(entry) > upperCount(existing)) {
            names.set(lower, entry);
          }
        }
      } catch {
        // folder doesn't exist in the destination yet
      }
      this.mChildren.set(key, names);
    }
    return names;
  }
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

/** Move the contents of `from` into the existing folder `to`, then remove `from`. */
async function mergeInto(from: string, to: string): Promise<void> {
  for (const entry of await readdir(from)) {
    const source = path.join(from, entry);
    const target = path.join(to, entry);
    if ((await isDirectory(source)) && (await isDirectory(target))) {
      await mergeInto(source, target);
    } else if (
      await stat(target)
        .then(() => true)
        .catch(() => false)
    ) {
      log("warn", "case fold: keeping existing file over a differently cased one", {
        kept: target,
        skipped: source,
      });
    } else {
      await rename(source, target);
    }
  }
  await rmdir(from).catch(() => undefined);
}

/**
 * Rename a mod's staged files and folders to the spelling `folder` chose, so
 * they deploy into one folder with the game's own and other mods' files.
 * Staging is Vortex's private copy and on Windows case doesn't matter, so this
 * only changes what's deployed on case-sensitive systems.
 *
 * @param deployPath where inside the destination this mod deploys
 * @returns staged files (relative to `stagingPath`) to leave out because the
 *   mod ships the same file in another spelling
 */
export async function foldStagedCase(
  folder: CaseFolder,
  stagingPath: string,
  deployPath: string,
): Promise<Set<string>> {
  const deployCanonical = folder.canonical(deployPath);
  const duplicates = new Set<string>();

  const visit = async (relDir: string): Promise<void> => {
    let entries: string[];
    try {
      entries = await readdir(path.join(stagingPath, relDir));
    } catch {
      return;
    }
    for (const entry of entries) {
      const relPath = path.join(relDir, entry);
      const canonical = folder.canonical(path.join(deployCanonical, relPath));
      const wantedName = path.basename(canonical);
      let current = path.join(stagingPath, relPath);
      if (wantedName !== entry) {
        const target = path.join(stagingPath, relDir, wantedName);
        if (
          await stat(target)
            .then(() => true)
            .catch(() => false)
        ) {
          // the mod itself ships both spellings
          if ((await isDirectory(current)) && (await isDirectory(target))) {
            await mergeInto(current, target);
            await visit(path.join(relDir, wantedName));
          } else {
            // a differently cased duplicate file: deploy the one already named right
            duplicates.add(relPath);
          }
          continue;
        }
        await rename(current, target);
        current = target;
      }
      if (await isDirectory(current)) {
        await visit(path.join(relDir, wantedName));
      }
    }
  };

  await visit("");
  return duplicates;
}
