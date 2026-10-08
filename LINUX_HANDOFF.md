# Linux support: handoff notes (TEMPORARY, delete before merging)

Handoff from a cloud Claude session to a local one, now continued locally on
CachyOS with a real Steam + Fallout 4 (Proton) install.

## Status (2026-10-08)

Done and checked against the real FO4 install:

- Finding 1 (Proton prefix): `src/renderer/src/util/linux/protonPrefix.ts`
  (`protonUserFolder`, exported as `util.protonUserFolder`) maps documents and
  local app data into `compatdata/<appid>/pfx/drive_c/users/steamuser`. The appid
  comes from the library's `appmanifest_*.acf` files. Wired into plugins.txt/LOOT,
  ini_prep, FOMOD INI conditions, local-gamesettings, savegames, archive
  invalidation, test settings and open-directory. Verified: Vortex writes
  `loadorder.txt` into the prefix and sees the game's own edits.
- The games create `Plugins.txt` (capital P). Under Wine on a case-sensitive
  filesystem, a lowercase `plugins.txt` next to it is ignored, so
  `gamebryo_plugin_management/util/pluginListFile.ts` reuses the existing spelling.
- Staging folder suggestion: `util/volumePath.ts` replaces the Windows-only
  `winapi.GetVolumePathName` for the suggestion (auto and the Settings "Suggest"
  button) and the drive shown by the hardlink/move activators. On Linux it now
  suggests `<game drive>/Vortex Mods/{game}`, so hardlink deployment can work
  when the game is on another drive.
- AppImage: `linux.target` includes `AppImage`; `.github/workflows/package-linux.yml`
  builds it on ubuntu-22.04. Not yet run locally.

- Finding 2 (Proton picking): `resolveProtonPath` also searches system-wide
  `compatibilitytools.d` folders (`/usr/share/steam/...`, where CachyOS installs
  proton-cachyos) and `STEAM_EXTRA_COMPAT_TOOLS_PATHS`, matching the name in
  `compatibilitytool.vdf`. Games without their own setting use Steam's default
  (mapping `"0"`). Only folders with a `proton` script count, and the fallback
  sorts numerically.
- `launchGameStore` no longer throws on Linux: `isStoreRunning` uses ps-list and
  matches `steam.sh` against the running `steam` binary.
- The dashboard's low-disk-space warning uses `fs.statfsSync` instead of the
  Windows-only `GetDiskFreeSpaceEx`.
- The .NET check on Linux names the distro package (`dotnet-runtime-9.0`).

- Moving the staging/download folder: `testPathTransfer` resolves volumes without
  winapi, so it no longer fails with "Unsupported operating system".
- INI baking: `vortex-parse-ini`'s `WinapiFormat` is patched
  (`patches/vortex-parse-ini@0.4.0.patch`) to read and write INIs without the
  Windows API, and ini_prep bakes on Linux. Archive invalidation, mod INI tweaks
  and FOMOD INI conditions work; verified on FO4 (MCM translations load).
- Case folding (`util/linux/caseFold.ts`): before deploying on case-sensitive
  systems, staged files and folders are renamed to the spelling the game folder
  or an earlier mod uses (`f4se/plugins` → `F4SE/Plugins`). Verified with MCM,
  F4SE, Address Library, PrismaUI.
- Fallout 4 file selection: Vortex sets `[Launcher] bEnableFileSelection=1` in
  Fallout4Prefs.ini when managing plugins. Without it the game loads no mod
  plugins and rewrites plugins.txt with them disabled (not Linux-specific).
- Releases: a `linux-v*` tag publishes a full "latest" release with the
  AppImage; pushes to master refresh the `linux-nightly` pre-release.

Verified end to end on CachyOS: discovery, login, nxm links, mod install,
hardlink deploy across drives, F4SE 0.7.9 through Proton, MCM, Commonwealth
Online connecting to a local server.

Checked and fine on Linux already:

- Savegame parsing is pure JS now. The AUR `vortex-linux-fix` package's BA2/BSA
  and GamebryoSave.node patches target the old v2.0.0 layout and are obsolete.
- Download-finished shutdown uses `systemctl poweroff`.
- Most game extensions only use `winapi.RegGetValue` as a fallback after the
  Steam lookup.

Open:

- Nexus login on Linux: being tested.
- F4SE / FO4Edit through Proton: needs a run on the real machine.
- Findings 3-4 below.

## Goal and scope (decided by the user)

- **Steam only for now.** Every other store is explicitly marked unsupported on
  Linux. One store at a time.
- **Target: Fallout 4 on Steam (Proton)** must be fully moddable.
- Branch: `claude/determined-gates-klad6l`.

## What already exists upstream (don't redo it)

- Steam discovery on Linux: `src/renderer/src/util/linux/steamPaths.ts` covers
  native, Debian, Flatpak and Snap Steam.
- Proton detection and launching: `src/renderer/src/util/linux/proton.ts`, plus
  `Steam.ts` (`parseManifest` adds `usesProton`, `compatDataPath` and
  `protonPath`; `runToolWithProton`).
- `StarterInfo.ts` → `shouldRunWithProton` runs Windows `.exe` tools (F4SE,
  FO4Edit) through the game's Proton prefix when `info.store === "steam"`.
- Flatpak packaging (`flatpak/`), the Nix dev shell (`flake.nix`) and install docs
  (`docs/install-instructions/`).
- Many per-game Linux fixes from SPTApyo (`git log -i --grep=linux`).

## Findings

### 1. BLOCKER for Fallout 4: game user folders are not mapped into the Proton prefix

On Linux, Vortex reads and writes the game's user files in the **Linux home**,
while the game under Proton uses
`<library>/steamapps/compatdata/<appid>/pfx/drive_c/users/steamuser/...`.

- `getVortexPath("documents")` is `~/Documents`, so Vortex uses
  `~/Documents/My Games/Fallout4/*.ini`.
  The game uses `pfx/drive_c/users/steamuser/Documents/My Games/Fallout4`.
- `LOCALAPPDATA` is unset, so `appDataPath()` in
  `src/renderer/src/extensions/gamebryo_plugin_management/util/gameSupport.ts:376`
  falls back to `path.resolve(appData, "..", "Local", ...)`. That is
  **`~/Local/Fallout4/plugins.txt`**, a path nothing ever reads.
  The game reads `pfx/drive_c/users/steamuser/AppData/Local/Fallout4/plugins.txt`.
  **Result: load order and plugin enable/disable never reach the game.**
- `grep -rn "drive_c\|steamuser"` finds nothing in the repo, so no mapping exists anywhere.

Consumers to fix, most important first:

| Consumer                                  | File                                                                                         | Uses         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- | ------------ |
| plugins.txt / load order (critical)       | `src/renderer/src/extensions/gamebryo_plugin_management/util/gameSupport.ts` (`appDataPath`) | LOCALAPPDATA |
| INI tweaks                                | `src/renderer/src/extensions/ini_prep/gameSupport.ts:176`, `ini_prep/index.ts:304`           | documents    |
| FOMOD INI conditions                      | `src/renderer/src/extensions/installer_fomod_shared/utils/gameSupport.ts:10`                 | documents    |
| profile-local INIs                        | `extensions/local-gamesettings/src/util/gameSupport.ts` (`mygamesPath`)                      | documents    |
| save games                                | `extensions/gamebryo-savegame-management/src/util/gameSupport.ts`                            | documents    |
| archive invalidation (Fallout4Custom.ini) | `extensions/gamebryo-archive-invalidation/src/util/gameSupport.ts`                           | documents    |
| test settings                             | `extensions/gamebryo-test-settings/src/util/gameSupport.ts`                                  | documents    |
| "Open folder" menu                        | `extensions/open-directory/src/gameSupport.ts`                                               | both         |
| LOOT local data path                      | check how `gamebryo_plugin_management` passes the local path to loot                         | LOCALAPPDATA |

Planned design (not written yet):

- New `src/renderer/src/util/linux/protonPrefix.ts` with a **synchronous**
  resolver (the call sites above are synchronous):
  `protonUserFolder(gamePath, steamAppId, folder: "documents" | "localAppData" | "appData"): string | undefined`.
    - Return `undefined` on non-Linux or when no prefix exists, so callers keep
      today's behaviour.
    - Find compatdata from the Steam snapshot entry (`Steam.snapshot()` entries
      carry `compatDataPath`). Fall back to deriving it from the discovery path:
      `<lib>/steamapps/common/<dir>` becomes `<lib>/steamapps/compatdata/<appid>`,
      using `game.details.steamAppId`. (Fallout 4 has `steamAppId: 377160`.) The
      snapshot may be empty right after startup, before a discovery scan, so the
      fallback matters.
    - Folders: `pfx/drive_c/users/steamuser/{Documents, AppData/Local, AppData/Roaming}`.
    - Check existence with `fs.existsSync` (`steamPaths.ts` already uses
      synchronous Node fs in the renderer).
- In `gamebryo_plugin_management/util/gameSupport.ts`, `discoveryForGame` is
  already wired at `initGameSupport`. Use it with `gameById(...).details.steamAppId`
  inside `appDataPath`. Note the `process.type === "renderer"` comment there:
  parts of gameSupport also run in main.
- Bundled extensions (`extensions/*`) can only reach `vortex-api`'s `util`.
  Exposing the resolver means adding an export to `src/renderer/src/util/api.ts`
  and **regenerating `etc/vortex.api.md`** with
  `pnpm --filter @nexusmods/vortex-api api:report`.
- Unit-test the resolver with temp directories, or by mocking `fs`.

### 2. Bug: Proton fallback picks the wrong folder

In `src/renderer/src/util/linux/proton.ts`, `findLatestProton` does
`.filter(startsWith("proton")).sort().reverse()`, which is a lexical sort:

- `"Proton 9.0"` sorts above `"Proton 10.0"`, so an older Proton is picked.
- `"Proton EasyAntiCheat Runtime"` and `"Proton BattlEye Runtime"` sort above both.
  Those folders have **no `proton` script**, so launching tools fails.

Fix: keep only directories that contain a `proton` file, then sort with
`localeCompare(..., undefined, { numeric: true })`. Prefer
`Proton - Experimental` only if that is the intended policy. The fuzzy match in
`resolveProtonPath` should get the same "has a `proton` file" check.

### 3. Mark non-Steam stores unsupported on Linux

`GameModeManager.ts:78` registers the stores. On Linux:

- GOG returns `undefined` from `GoGLauncher.create()`.
- The Epic default instance is `undefined`.
- Origin, Uplay and Xbox `create()` should be checked.

They are silently absent today. Make this explicit:

- one clear log line per store,
- possibly a UI hint when the user tries to manage a game that was discovered
  through, or only has queryArgs for, a non-Steam store,
- a short "Linux: Steam only for now" note in `docs/install-instructions/`.

### 4. Unverified, needs checking: Epic manifest parsing on Windows

`src/renderer/src/util/EpicGamesLauncher.ts` calls `manifestSchema.safeParse(data)`
where `data` is the raw file **string**, not `JSON.parse(data)`. If that is
right, every Epic manifest is rejected. Verify before touching it, because it is
Windows-only and out of the Linux scope.

## Fallout 4 checklist to verify on a real machine

1. Discovery finds FO4 from Steam, and `usesProton`/`compatDataPath` are set.
2. Deployment works (symlink or hardlink deployment into `Fallout 4/Data`).
3. plugins.txt is written into the **prefix** (finding 1), and enable/disable
   shows up in-game.
4. Fallout4Custom.ini archive invalidation lands in the prefix's My Games.
5. F4SE (`f4se_loader.exe`) launches through Proton (`shouldRunWithProton`).
6. FO4Edit runs through Proton.
7. LOOT sorting works (`libloot` ships for Linux as of `1368506a`).
8. FOMOD installers work (dotnet / `installer_fomod_ipc`).

## Verification (from AGENTS.md)

- `pnpm run verify` runs from the repo root. Don't run it while `pnpm run dev` is live.
- To run a single test: `cd src/renderer && pnpm exec vitest run src/util/linux/<file>.test.ts`.
- Use `src/renderer/src/util/Steam.test.ts` as the pattern for fs-backed tests
  (`installInMemoryFS`, `vi.hoisted` for the import-time singleton).
- Don't commit or push unless the user asks. Delete this file before merging.
