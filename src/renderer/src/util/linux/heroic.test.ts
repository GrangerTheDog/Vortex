import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  heroicGames,
  heroicLaunchUrl,
  heroicToolCommand,
  heroicUserPath,
  resetHeroicCache,
} from "./heroic";
import { createHeroicStores } from "./HeroicStore";
import { protonUserFolder } from "./protonPrefix";

const writeJson = (filePath: string, data: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data));
};

describe.skipIf(process.platform !== "linux")("heroic", () => {
  const originalHome = process.env.HOME;
  let home: string;
  let config: string;
  let epicGame: string;
  let gogGame: string;
  let protonPrefix: string;
  let winePrefix: string;
  let protonBin: string;
  let wineBin: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "vortex-heroic-"));
    process.env.HOME = home;
    resetHeroicCache();
    config = path.join(home, ".config", "heroic");
    epicGame = path.join(home, "Games", "Heroic", "Fallout 4 GOTY");
    gogGame = path.join(home, "Games", "Heroic", "Fallout 4 GOG");
    protonPrefix = path.join(home, "Games", "Heroic", "Prefixes", "default", "Fallout 4 GOTY");
    winePrefix = path.join(home, "Games", "Heroic", "Prefixes", "default", "Fallout 4 GOG");
    protonBin = path.join(config, "tools", "proton", "GE-Proton10-34", "proton");
    wineBin = path.join(home, "wine", "bin", "wine");
    for (const bin of [protonBin, wineBin]) {
      fs.mkdirSync(path.dirname(bin), { recursive: true });
      fs.writeFileSync(bin, "");
    }

    writeJson(path.join(config, "legendaryConfig", "legendary", "installed.json"), {
      "61d52ce4d09d41e48800c22784d13ae8": {
        app_name: "61d52ce4d09d41e48800c22784d13ae8",
        title: "Fallout 4: Game of the Year Edition",
        install_path: epicGame,
        is_dlc: false,
      },
      dlc0001: { app_name: "dlc0001", title: "Some DLC", install_path: epicGame, is_dlc: true },
    });
    writeJson(path.join(config, "gog_store", "installed.json"), {
      installed: [{ appName: "1998527297", install_path: gogGame, platform: "windows" }],
    });
    writeJson(path.join(config, "store_cache", "gog_library.json"), {
      games: [{ app_name: "1998527297", title: "Fallout 4 GOTY" }],
    });
    writeJson(path.join(config, "GamesConfig", "61d52ce4d09d41e48800c22784d13ae8.json"), {
      "61d52ce4d09d41e48800c22784d13ae8": {
        winePrefix: protonPrefix,
        wineVersion: { bin: protonBin, type: "proton" },
      },
    });
    writeJson(path.join(config, "GamesConfig", "1998527297.json"), {
      "1998527297": { winePrefix, wineVersion: { bin: wineBin, type: "wine" } },
    });
    fs.mkdirSync(path.join(protonPrefix, "drive_c", "users", "steamuser", "Documents"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(winePrefix, "drive_c", "users", os.userInfo().username), {
      recursive: true,
    });
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    resetHeroicCache();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("lists installed Epic and GOG games, without DLC", () => {
    expect(heroicGames()).toEqual([
      {
        runner: "legendary",
        appName: "61d52ce4d09d41e48800c22784d13ae8",
        title: "Fallout 4: Game of the Year Edition",
        installPath: epicGame,
      },
      { runner: "gog", appName: "1998527297", title: "Fallout 4 GOTY", installPath: gogGame },
    ]);
  });

  it("finds the user folder Proton uses", () => {
    expect(heroicUserPath(epicGame)).toBe(path.join(protonPrefix, "drive_c", "users", "steamuser"));
    expect(protonUserFolder(epicGame, "documents")).toBe(
      path.join(protonPrefix, "drive_c", "users", "steamuser", "Documents"),
    );
  });

  it("finds the Linux user's folder under plain Wine", () => {
    expect(heroicUserPath(gogGame)).toBe(
      path.join(winePrefix, "drive_c", "users", os.userInfo().username),
    );
  });

  it("returns nothing for games Heroic doesn't know", () => {
    expect(heroicUserPath(path.join(home, "elsewhere"))).toBeUndefined();
  });

  it("runs tools through Proton in the game's prefix", () => {
    const command = heroicToolCommand(path.join(epicGame, "f4se_loader.exe"), ["-x"], {}, "/steam");
    expect(command).toEqual({
      executable: protonBin,
      args: ["run", path.join(epicGame, "f4se_loader.exe"), "-x"],
      env: {
        STEAM_COMPAT_DATA_PATH: protonPrefix,
        STEAM_COMPAT_CLIENT_INSTALL_PATH: "/steam",
        WINEPREFIX: protonPrefix,
      },
    });
  });

  it("runs tools through plain Wine in the game's prefix", () => {
    const command = heroicToolCommand(path.join(gogGame, "f4se_loader.exe"), [], {}, undefined);
    expect(command).toEqual({
      executable: wineBin,
      args: [path.join(gogGame, "f4se_loader.exe")],
      env: { GOG_GAME_ID: "1998527297", WINEPREFIX: winePrefix },
    });
  });

  it("falls back to an installed Proton when the configured one is gone", () => {
    writeJson(path.join(config, "GamesConfig", "61d52ce4d09d41e48800c22784d13ae8.json"), {
      "61d52ce4d09d41e48800c22784d13ae8": {
        winePrefix: protonPrefix,
        wineVersion: { bin: "/removed/GE-Proton10/proton", type: "proton" },
      },
    });
    const command = heroicToolCommand(path.join(epicGame, "a.exe"), [], {}, undefined);
    expect(command?.executable).toBe(protonBin);
  });

  it("builds Heroic's launch URL", () => {
    expect(heroicLaunchUrl("gog", "1998527297")).toBe(
      "heroic://launch?appName=1998527297&runner=gog",
    );
  });

  it("exposes the games as Vortex's epic and gog stores", async () => {
    const [epic, gog] = createHeroicStores();
    await epic.reloadGames();
    await gog.reloadGames();

    expect(epic.id).toBe("epic");
    expect((await epic.findByAppId("61d52ce4d09d41e48800c22784d13ae8")).gamePath).toBe(epicGame);
    expect(gog.id).toBe("gog");
    expect((await gog.findByAppId(["nope", "1998527297"])).gamePath).toBe(gogGame);
    await expect(gog.findByAppId("61d52ce4d09d41e48800c22784d13ae8")).rejects.toThrow();
  });
});
