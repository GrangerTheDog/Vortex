import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pluginListFile } from "./pluginListFile";

describe.skipIf(process.platform === "win32")("pluginListFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vortex-plugins-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reuses the spelling the game created", () => {
    fs.writeFileSync(path.join(dir, "Plugins.txt"), "");
    expect(pluginListFile(dir, "plugins.txt")).toBe(path.join(dir, "Plugins.txt"));
  });

  it("keeps the given name when no file exists yet", () => {
    expect(pluginListFile(dir, "plugins.txt")).toBe(path.join(dir, "plugins.txt"));
  });

  it("keeps the given name when the folder doesn't exist", () => {
    const missing = path.join(dir, "missing");
    expect(pluginListFile(missing, "plugins.txt")).toBe(path.join(missing, "plugins.txt"));
  });
});
