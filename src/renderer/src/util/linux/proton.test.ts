import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  findLatestProton,
  getConfiguredProtonName,
  parseCompatToolManifest,
  resolveProtonPath,
} from "./proton";

const manifest = (name: string, installPath = ".") =>
  [
    '"compatibilitytools"',
    "{",
    '  "compat_tools"',
    "  {",
    `    "${name}" // Internal name of this tool`,
    "    {",
    `      "install_path" "${installPath}"`,
    '      "display_name" "Some Proton"',
    "    }",
    "  }",
    "}",
  ].join("\n");

describe("proton", () => {
  let steam: string;
  let extraTools: string;
  const originalExtra = process.env.STEAM_EXTRA_COMPAT_TOOLS_PATHS;

  const makeTool = (dir: string, withScript = true) => {
    fs.mkdirSync(dir, { recursive: true });
    if (withScript) {
      fs.writeFileSync(path.join(dir, "proton"), "");
    }
    return dir;
  };

  beforeEach(() => {
    steam = fs.mkdtempSync(path.join(os.tmpdir(), "vortex-steam-"));
    extraTools = fs.mkdtempSync(path.join(os.tmpdir(), "vortex-compat-"));
    process.env.STEAM_EXTRA_COMPAT_TOOLS_PATHS = extraTools;
  });

  afterEach(() => {
    if (originalExtra === undefined) {
      delete process.env.STEAM_EXTRA_COMPAT_TOOLS_PATHS;
    } else {
      process.env.STEAM_EXTRA_COMPAT_TOOLS_PATHS = originalExtra;
    }
    fs.rmSync(steam, { recursive: true, force: true });
    fs.rmSync(extraTools, { recursive: true, force: true });
  });

  describe("parseCompatToolManifest", () => {
    it("reads the internal name despite // comments", () => {
      expect(parseCompatToolManifest(manifest("Proton-GE-RTSP"), "/tools/ge")).toEqual([
        { name: "Proton-GE-RTSP", installPath: "/tools/ge" },
      ]);
    });

    it("returns nothing for a broken manifest", () => {
      expect(parseCompatToolManifest("{ not vdf", "/tools/x")).toEqual([]);
    });
  });

  describe("resolveProtonPath", () => {
    it("finds a tool by the name its manifest declares, not its folder", async () => {
      const dir = makeTool(path.join(extraTools, "proton-ge-custom-rtsp"));
      fs.writeFileSync(path.join(dir, "compatibilitytool.vdf"), manifest("Proton-GE-RTSP"));

      expect(await resolveProtonPath(steam, "Proton-GE-RTSP")).toBe(dir);
    });

    it("finds a tool in Steam's own compatibilitytools.d", async () => {
      const dir = makeTool(path.join(steam, "compatibilitytools.d", "GE-Proton10-34"));
      fs.writeFileSync(path.join(dir, "compatibilitytool.vdf"), manifest("GE-Proton10-34"));

      expect(await resolveProtonPath(steam, "GE-Proton10-34")).toBe(dir);
    });

    it("ignores folders without a proton script", async () => {
      const dir = makeTool(path.join(extraTools, "broken"), false);
      fs.writeFileSync(path.join(dir, "compatibilitytool.vdf"), manifest("broken"));

      expect(await resolveProtonPath(steam, "broken")).toBeUndefined();
    });

    it("maps official config names onto steamapps/common folders", async () => {
      const common = path.join(steam, "steamapps", "common");
      makeTool(path.join(common, "Proton EasyAntiCheat Runtime"), false);
      const experimental = makeTool(path.join(common, "Proton - Experimental"));

      expect(await resolveProtonPath(steam, "proton_experimental")).toBe(experimental);
    });
  });

  describe("findLatestProton", () => {
    it("picks the highest version that has a proton script", async () => {
      const common = path.join(steam, "steamapps", "common");
      makeTool(path.join(common, "Proton 9.0"));
      const latest = makeTool(path.join(common, "Proton 10.0"));
      makeTool(path.join(common, "Proton EasyAntiCheat Runtime"), false);
      makeTool(path.join(common, "Proton BattlEye Runtime"), false);

      expect(await findLatestProton(steam)).toBe(latest);
    });
  });

  describe("getConfiguredProtonName", () => {
    const writeConfig = (mapping: string) => {
      fs.mkdirSync(path.join(steam, "config"), { recursive: true });
      fs.writeFileSync(
        path.join(steam, "config", "config.vdf"),
        [
          '"InstallConfigStore"',
          "{",
          '"Software"',
          "{",
          '"Valve"',
          "{",
          '"Steam"',
          "{",
          '"CompatToolMapping"',
          "{",
          mapping,
          "}",
          "}",
          "}",
          "}",
          "}",
        ].join("\n"),
      );
    };

    it("uses the game's own setting", async () => {
      writeConfig(['"377160"', "{", '"name" "proton-cachyos-slr"', "}"].join("\n"));
      expect(await getConfiguredProtonName(steam, "377160")).toBe("proton-cachyos-slr");
    });

    it("falls back to Steam's default for games without one", async () => {
      writeConfig(['"0"', "{", '"name" "proton_experimental"', "}"].join("\n"));
      expect(await getConfiguredProtonName(steam, "377160")).toBe("proton_experimental");
    });
  });
});
