import * as fs from "fs";
import * as path from "path";

import * as winapi from "winapi-bindings";

/** The nearest existing ancestor of a path, so a not-yet-created folder can be placed. */
function existingAncestor(filePath: string): string {
  let current = path.resolve(filePath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return current;
}

/** Mount point of the filesystem holding `filePath`, found by walking up until the device changes. */
function mountPoint(filePath: string): string {
  let current = existingAncestor(filePath);
  const dev = fs.statSync(current).dev;
  for (;;) {
    const parent = path.dirname(current);
    if (parent === current || fs.statSync(parent).dev !== dev) {
      return current;
    }
    current = parent;
  }
}

/**
 * Root of the volume a path lives on: "D:\" on Windows, the mount point elsewhere.
 * The path doesn't have to exist yet.
 */
export function volumePathName(filePath: string): string {
  if (process.platform === "win32") {
    return winapi.GetVolumePathName(filePath);
  }
  return mountPoint(filePath);
}

/**
 * Folder on the same volume as `filePath` to suggest new Vortex folders in.
 * On Windows that's the volume root. Elsewhere the mount point is often owned by
 * root, so this is the highest folder between it and `filePath` the user can write to.
 */
export function suggestionRootOnVolume(filePath: string): string {
  if (process.platform === "win32") {
    return winapi.GetVolumePathName(filePath);
  }
  const target = existingAncestor(filePath);
  let current = mountPoint(target);
  const rest = path
    .relative(current, target)
    .split(path.sep)
    .filter((seg) => seg.length > 0);
  for (;;) {
    try {
      fs.accessSync(current, fs.constants.W_OK);
      return current;
    } catch {
      if (rest.length === 0) {
        return current;
      }
      current = path.join(current, rest.shift());
    }
  }
}
