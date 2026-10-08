import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** Heroic's backends: Legendary for Epic, gogdl for GOG. */
export type HeroicRunner = "legendary" | "gog";

export interface IHeroicGame {
  runner: HeroicRunner;
  /** Epic app name or GOG product id, the same ids Vortex's game extensions use */
  appName: string;
  title: string;
  installPath: string;
}

export interface IHeroicWine {
  /** the prefix folder; Heroic keeps drive_c directly in it */
  prefix: string;
  type: "proton" | "wine" | string;
  /** the proton script or wine binary Heroic runs the game with */
  bin: string;
}

const CACHE_MS = 5000;

/** Heroic's config folders, native install first, then Flatpak. */
export function heroicConfigDirs(): string[] {
  const home = os.homedir();
  return [
    path.join(home, ".config", "heroic"),
    path.join(home, ".var", "app", "com.heroicgameslauncher.hgl", "config", "heroic"),
  ].filter((dir) => fs.existsSync(dir));
}

function readJson(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function legendaryGames(configDir: string): IHeroicGame[] {
  const installed = readJson(
    path.join(configDir, "legendaryConfig", "legendary", "installed.json"),
  );
  if (installed === undefined || typeof installed !== "object") {
    return [];
  }
  return Object.values<any>(installed)
    .filter((game) => game?.app_name && game.install_path && !game.is_dlc)
    .map((game) => ({
      runner: "legendary" as const,
      appName: String(game.app_name),
      title: String(game.title ?? game.app_name),
      installPath: String(game.install_path),
    }));
}

function gogTitles(configDir: string): Map<string, string> {
  const titles = new Map<string, string>();
  for (const file of [
    path.join(configDir, "store_cache", "gog_library.json"),
    path.join(configDir, "gog_store", "library.json"),
  ]) {
    const library = readJson(file);
    for (const game of library?.games ?? []) {
      if (game?.app_name && game?.title) {
        titles.set(String(game.app_name), String(game.title));
      }
    }
  }
  return titles;
}

function gogGames(configDir: string): IHeroicGame[] {
  const installed = readJson(path.join(configDir, "gog_store", "installed.json"));
  const list: any[] = installed?.installed ?? [];
  if (list.length === 0) {
    return [];
  }
  const titles = gogTitles(configDir);
  return list
    .filter((game) => game?.appName && game.install_path && !game.is_dlc)
    .map((game) => ({
      runner: "gog" as const,
      appName: String(game.appName),
      title: titles.get(String(game.appName)) ?? String(game.title ?? game.appName),
      installPath: String(game.install_path),
    }));
}

let gamesCache: { time: number; games: IHeroicGame[] } | undefined;

/** Every game Heroic has installed, from all its config folders. */
export function heroicGames(): IHeroicGame[] {
  if (gamesCache !== undefined && Date.now() - gamesCache.time < CACHE_MS) {
    return gamesCache.games;
  }
  const games = heroicConfigDirs().flatMap((dir) => [...legendaryGames(dir), ...gogGames(dir)]);
  gamesCache = { time: Date.now(), games };
  return games;
}

/** The Wine/Proton setup Heroic uses for a game. */
export function heroicWine(appName: string): IHeroicWine | undefined {
  for (const dir of heroicConfigDirs()) {
    const config = readJson(path.join(dir, "GamesConfig", `${appName}.json`))?.[appName];
    if (config?.winePrefix) {
      return {
        prefix: String(config.winePrefix),
        type: String(config.wineVersion?.type ?? "wine"),
        bin: String(config.wineVersion?.bin ?? ""),
      };
    }
  }
  return undefined;
}

/** The Heroic game installed at `gamePath`, if any. */
export function heroicGameAt(gamePath: string): IHeroicGame | undefined {
  const wanted = path.resolve(gamePath);
  return heroicGames().find((game) => path.resolve(game.installPath) === wanted);
}

/**
 * The Windows user folder a Heroic game sees inside its prefix. Proton runs as
 * "steamuser", plain Wine as the Linux user.
 */
export function heroicUserPath(gamePath: string): string | undefined {
  const game = heroicGameAt(gamePath);
  const wine = game === undefined ? undefined : heroicWine(game.appName);
  if (wine === undefined) {
    return undefined;
  }
  const users = ["pfx", ""]
    .map((sub) => path.join(wine.prefix, sub, "drive_c", "users"))
    .find((dir) => fs.existsSync(dir));
  if (users === undefined) {
    return undefined;
  }
  const candidates =
    wine.type === "proton"
      ? ["steamuser", os.userInfo().username]
      : [os.userInfo().username, "steamuser"];
  return candidates.map((user) => path.join(users, user)).find((dir) => fs.existsSync(dir));
}

/** URL that makes Heroic launch a game with its own settings. */
export function heroicLaunchUrl(runner: HeroicRunner, appName: string): string {
  return `heroic://launch?appName=${encodeURIComponent(appName)}&runner=${runner}`;
}

/** Test hook: forget cached game lists. */
export function resetHeroicCache(): void {
  gamesCache = undefined;
}

/** Proton builds on this machine: Heroic's own, then Steam's and the system's compat tools. */
function installedProtons(): string[] {
  const home = os.homedir();
  const roots = [
    ...heroicConfigDirs().map((dir) => path.join(dir, "tools", "proton")),
    path.join(home, ".local", "share", "Steam", "compatibilitytools.d"),
    path.join(home, ".steam", "steam", "compatibilitytools.d"),
    "/usr/share/steam/compatibilitytools.d",
    path.join(home, ".local", "share", "Steam", "steamapps", "common"),
  ];
  const found: string[] = [];
  for (const root of roots) {
    let entries: string[];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const script = path.join(root, entry, "proton");
      if (fs.existsSync(script) && !found.includes(script)) {
        found.push(script);
      }
    }
  }
  return found;
}

/**
 * The Wine/Proton binary to use, falling back when the one in Heroic's settings
 * was removed (e.g. "proton-cachyos" replaced by "proton-cachyos-slr"): first a
 * build whose folder starts with the configured name, then the newest Proton.
 */
function usableBin(wine: IHeroicWine): string | undefined {
  if (wine.bin && fs.existsSync(wine.bin)) {
    return wine.bin;
  }
  if (wine.type !== "proton") {
    return ["/usr/bin/wine", "/usr/local/bin/wine"].find((bin) => fs.existsSync(bin));
  }
  const protons = installedProtons();
  const configured = path.basename(path.dirname(wine.bin)).toLowerCase();
  const similar = protons.find(
    (script) =>
      configured.length > 0 &&
      path.basename(path.dirname(script)).toLowerCase().startsWith(configured),
  );
  if (similar !== undefined) {
    return similar;
  }
  return protons
    .slice()
    .sort((lhs, rhs) =>
      path
        .basename(path.dirname(rhs))
        .localeCompare(path.basename(path.dirname(lhs)), undefined, { numeric: true }),
    )[0];
}

export interface IHeroicToolCommand {
  executable: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * Command running a Windows tool (F4SE, xEdit, ...) inside the prefix of the
 * Heroic game it belongs to, with the same Wine/Proton Heroic uses for it.
 *
 * @param steamPath Steam's folder; Proton wants it but runs without Steam too
 */
export function heroicToolCommand(
  exePath: string,
  args: string[],
  env: Record<string, string> | undefined,
  steamPath: string | undefined,
): IHeroicToolCommand | undefined {
  const exe = path.resolve(exePath);
  const game = heroicGames().find((candidate) => {
    const root = path.resolve(candidate.installPath);
    return exe === root || exe.startsWith(root + path.sep);
  });
  const wine = game === undefined ? undefined : heroicWine(game.appName);
  const bin = wine === undefined ? undefined : usableBin(wine);
  if (wine === undefined || bin === undefined) {
    return undefined;
  }
  const appIdEnv: Record<string, string> =
    game.runner === "gog" ? { GOG_GAME_ID: game.appName } : {};
  if (wine.type === "proton") {
    return {
      executable: bin,
      args: ["run", exePath, ...args],
      env: {
        ...env,
        ...appIdEnv,
        STEAM_COMPAT_DATA_PATH: wine.prefix,
        STEAM_COMPAT_CLIENT_INSTALL_PATH: steamPath ?? "",
        WINEPREFIX: wine.prefix,
      },
    };
  }
  return {
    executable: bin,
    args: [exePath, ...args],
    env: { ...env, ...appIdEnv, WINEPREFIX: wine.prefix },
  };
}
