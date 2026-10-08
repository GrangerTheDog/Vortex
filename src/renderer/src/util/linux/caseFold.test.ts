import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CaseFolder, foldStagedCase } from "./caseFold";

const write = (filePath: string, content = "") => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

/** All files below `root`, relative, sorted. */
const tree = (root: string): string[] =>
  (fs.readdirSync(root, { recursive: true }) as string[])
    .filter((rel) => fs.statSync(path.join(root, rel)).isFile())
    .sort();

describe.skipIf(process.platform === "win32")("caseFold", () => {
  let base: string;
  let game: string;
  let staging: string;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "vortex-casefold-"));
    game = path.join(base, "Data");
    staging = path.join(base, "staging");
    fs.mkdirSync(game);
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it("renames a mod's folder to the spelling the game already uses", async () => {
    fs.mkdirSync(path.join(game, "F4SE", "Plugins"), { recursive: true });
    const mod = path.join(staging, "modA");
    write(path.join(mod, "f4se", "plugins", "MCM.dll"));

    await foldStagedCase(new CaseFolder(game), mod, "");

    expect(tree(mod)).toEqual([path.join("F4SE", "Plugins", "MCM.dll")]);
  });

  it("prefers the capitalised spelling when the game has both", async () => {
    fs.mkdirSync(path.join(game, "F4SE", "plugins"), { recursive: true });
    fs.mkdirSync(path.join(game, "F4SE", "Plugins"), { recursive: true });
    const mod = path.join(staging, "modA");
    write(path.join(mod, "F4SE", "plugins", "a.dll"));

    await foldStagedCase(new CaseFolder(game), mod, "");

    expect(tree(mod)).toEqual([path.join("F4SE", "Plugins", "a.dll")]);
  });

  it("makes later mods follow the first mod's spelling", async () => {
    const folder = new CaseFolder(game);
    const first = path.join(staging, "first");
    const second = path.join(staging, "second");
    write(path.join(first, "Interface", "Translations", "a.txt"));
    write(path.join(second, "interface", "translations", "b.txt"));

    await foldStagedCase(folder, first, "");
    await foldStagedCase(folder, second, "");

    expect(tree(second)).toEqual([path.join("Interface", "Translations", "b.txt")]);
  });

  it("merges a mod's own folders that differ only in case", async () => {
    const mod = path.join(staging, "mod");
    write(path.join(mod, "Plugins", "a.dll"));
    write(path.join(mod, "plugins", "b.dll"));

    await foldStagedCase(new CaseFolder(game), mod, "");

    expect(tree(mod)).toEqual([path.join("Plugins", "a.dll"), path.join("Plugins", "b.dll")]);
  });

  it("reports a file the mod ships twice so only one gets deployed", async () => {
    const mod = path.join(staging, "mod");
    write(path.join(mod, "Readme.txt"), "upper");
    write(path.join(mod, "readme.txt"), "lower");

    const duplicates = await foldStagedCase(new CaseFolder(game), mod, "");

    expect(duplicates.size).toBe(1);
    expect(tree(mod).filter((rel) => !duplicates.has(rel))).toHaveLength(1);
  });

  it("respects a mod's deploy subfolder", async () => {
    fs.mkdirSync(path.join(game, "Data", "Scripts"), { recursive: true });
    const mod = path.join(staging, "mod");
    write(path.join(mod, "scripts", "a.pex"));

    await foldStagedCase(new CaseFolder(game), mod, "data");

    expect(tree(mod)).toEqual([path.join("Scripts", "a.pex")]);
  });
});
