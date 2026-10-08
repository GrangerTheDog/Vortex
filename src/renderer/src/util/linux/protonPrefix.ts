import * as fs from "fs";
import * as path from "path";

/**
 * Per-user Windows folders a game reads inside its Proton prefix.
 * "documents" holds "My Games", "localAppData" holds plugins.txt.
 */
export type ProtonUserFolder = "documents" | "localAppData" | "appData";

const USER_FOLDERS: { [folder in ProtonUserFolder]: string[] } = {
  documents: ["Documents"],
  localAppData: ["AppData", "Local"],
  appData: ["AppData", "Roaming"],
};

// Install folder to appid. Only hits are cached: a game installed after the
// first lookup must still be found.
const appIdCache = new Map<string, string>();

function findAppId(steamAppsPath: string, installDir: string): string | undefined {
  const cacheKey = path.join(steamAppsPath, installDir);
  const cached = appIdCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let manifests: string[];
  try {
    manifests = fs
      .readdirSync(steamAppsPath)
      .filter((name) => /^appmanifest_\d+\.acf$/i.test(name));
  } catch {
    return undefined;
  }

  const wanted = installDir.toLowerCase();
  for (const manifest of manifests) {
    try {
      const data = fs.readFileSync(path.join(steamAppsPath, manifest), "utf8");
      const match = /"installdir"\s+"([^"]*)"/i.exec(data);
      if (match?.[1].toLowerCase() === wanted) {
        const appId = /^appmanifest_(\d+)\.acf$/i.exec(manifest)[1];
        appIdCache.set(cacheKey, appId);
        return appId;
      }
    } catch {
      // unreadable manifest, try the next one
    }
  }
  return undefined;
}

/**
 * Locate the compatdata folder of a Steam game from its install path.
 * Steam keeps compatdata in the same library as the game:
 * `<lib>/steamapps/common/<dir>` maps to `<lib>/steamapps/compatdata/<appid>`.
 *
 * @param appId the game's Steam appid if known, otherwise it's looked up
 *   from the library's appmanifest files
 */
export function compatDataPathForGame(gamePath: string, appId?: string): string | undefined {
  const resolved = path.resolve(gamePath);
  const commonPath = path.dirname(resolved);
  const steamAppsPath = path.dirname(commonPath);
  if (
    path.basename(commonPath).toLowerCase() !== "common" ||
    path.basename(steamAppsPath).toLowerCase() !== "steamapps"
  ) {
    return undefined;
  }

  const id = appId ?? findAppId(steamAppsPath, path.basename(resolved));
  if (id === undefined) {
    return undefined;
  }
  return path.join(steamAppsPath, "compatdata", id);
}

/**
 * The path a Steam game running under Proton sees as one of the user's
 * Windows folders, e.g. `.../compatdata/377160/pfx/drive_c/users/steamuser/Documents`.
 *
 * Returns undefined on anything but Linux, when the game isn't installed in a
 * Steam library, or when it has no Proton prefix (yet), so callers can fall
 * back to the native folder.
 */
export function protonUserFolder(
  gamePath: string | undefined,
  folder: ProtonUserFolder,
  appId?: string,
): string | undefined {
  if (process.platform !== "linux" || !gamePath) {
    return undefined;
  }
  const compatDataPath = compatDataPathForGame(gamePath, appId);
  if (compatDataPath === undefined) {
    return undefined;
  }
  const userPath = path.join(compatDataPath, "pfx", "drive_c", "users", "steamuser");
  if (!fs.existsSync(userPath)) {
    return undefined;
  }
  return path.join(userPath, ...USER_FOLDERS[folder]);
}
