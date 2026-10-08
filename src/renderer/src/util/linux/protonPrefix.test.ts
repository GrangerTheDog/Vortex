import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { compatDataPathForGame, protonUserFolder } from "./protonPrefix";

const FO4_APPID = "377160";
const manifest = (appId: string, installDir: string) =>
  `"AppState"\n{\n\t"appid"\t\t"${appId}"\n\t"installdir"\t\t"${installDir}"\n}\n`;

describe("protonPrefix", () => {
  const originalPlatform = process.platform;
  let library: string;
  let steamApps: string;
  let gamePath: string;

  const setPlatform = (platform: string) =>
    Object.defineProperty(process, "platform", { value: platform });

  const createPrefix = (appId: string) =>
    fs.mkdirSync(
      path.join(steamApps, "compatdata", appId, "pfx", "drive_c", "users", "steamuser"),
      {
        recursive: true,
      },
    );

  beforeEach(() => {
    setPlatform("linux");
    library = fs.mkdtempSync(path.join(os.tmpdir(), "vortex-proton-"));
    steamApps = path.join(library, "steamapps");
    gamePath = path.join(steamApps, "common", "Fallout 4");
    fs.mkdirSync(gamePath, { recursive: true });
    fs.writeFileSync(
      path.join(steamApps, "appmanifest_489830.acf"),
      manifest("489830", "Skyrim Special Edition"),
    );
    fs.writeFileSync(
      path.join(steamApps, `appmanifest_${FO4_APPID}.acf`),
      manifest(FO4_APPID, "Fallout 4"),
    );
  });

  afterEach(() => {
    setPlatform(originalPlatform);
    fs.rmSync(library, { recursive: true, force: true });
  });

  it("maps the game's install folder to its compatdata via the appmanifest", () => {
    expect(compatDataPathForGame(gamePath)).toBe(path.join(steamApps, "compatdata", FO4_APPID));
  });

  it("uses an explicit appid without reading manifests", () => {
    expect(compatDataPathForGame(gamePath, "42")).toBe(path.join(steamApps, "compatdata", "42"));
  });

  it("returns undefined outside a Steam library", () => {
    expect(compatDataPathForGame(path.join(library, "Games", "Fallout 4"), "1")).toBeUndefined();
  });

  it("returns undefined when no manifest matches the install folder", () => {
    expect(compatDataPathForGame(path.join(steamApps, "common", "Unknown"))).toBeUndefined();
  });

  it("resolves the user folders inside the prefix", () => {
    createPrefix(FO4_APPID);
    const user = path.join(
      steamApps,
      "compatdata",
      FO4_APPID,
      "pfx",
      "drive_c",
      "users",
      "steamuser",
    );
    expect(protonUserFolder(gamePath, "documents")).toBe(path.join(user, "Documents"));
    expect(protonUserFolder(gamePath, "localAppData")).toBe(path.join(user, "AppData", "Local"));
    expect(protonUserFolder(gamePath, "appData")).toBe(path.join(user, "AppData", "Roaming"));
  });

  it("returns undefined while the prefix doesn't exist", () => {
    expect(protonUserFolder(gamePath, "documents")).toBeUndefined();
  });

  it("returns undefined without a game path", () => {
    expect(protonUserFolder(undefined, "documents")).toBeUndefined();
  });

  it("returns undefined on other platforms", () => {
    createPrefix(FO4_APPID);
    setPlatform("win32");
    expect(protonUserFolder(gamePath, "documents")).toBeUndefined();
  });
});
