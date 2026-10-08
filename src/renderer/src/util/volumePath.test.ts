import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { suggestionRootOnVolume, volumePathName } from "./volumePath";

describe.skipIf(process.platform === "win32")("volumePath", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "vortex-volume-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("finds the mount point holding a folder that doesn't exist yet", () => {
    const missing = path.join(dir, "not", "there");
    const root = volumePathName(missing);

    expect(dir.startsWith(root)).toBe(true);
    expect(fs.statSync(root).dev).toBe(fs.statSync(dir).dev);
    const parent = path.dirname(root);
    expect(parent === root || fs.statSync(parent).dev !== fs.statSync(root).dev).toBe(true);
  });

  it("suggests a writable folder on the same volume", () => {
    const root = suggestionRootOnVolume(path.join(dir, "mods"));

    expect(dir.startsWith(root)).toBe(true);
    expect(fs.statSync(root).dev).toBe(fs.statSync(dir).dev);
    expect(() => fs.accessSync(root, fs.constants.W_OK)).not.toThrow();
  });
});
