import * as path from "path";

import { selectors, types, util } from "@nexusmods/vortex-api";
import * as Redux from "redux";

interface IGameSupport {
  // folder within "My Games"
  settingsFolder: string;
  // folder within the local app data folder
  appDataFolder: string;
}

const localAppData: () => string = (() => {
  let cached: string;
  return () => {
    if (cached === undefined) {
      cached =
        process.env.LOCALAPPDATA || path.resolve(util.getVortexPath("appData"), "..", "Local");
    }
    return cached;
  };
})();

const gameSupport = util.makeOverlayableDictionary<string, IGameSupport>(
  {
    fallout3: {
      settingsFolder: "Fallout3",
      appDataFolder: "Fallout3",
    },
    falloutnv: {
      settingsFolder: "FalloutNV",
      appDataFolder: "FalloutNV",
    },
    fallout4: {
      settingsFolder: "Fallout4",
      appDataFolder: "Fallout4",
    },
    fallout4vr: {
      settingsFolder: "Fallout4VR",
      appDataFolder: "Fallout4VR",
    },
    starfield: {
      settingsFolder: "Starfield",
      appDataFolder: "Starfield",
    },
    oblivion: {
      settingsFolder: "Oblivion",
      appDataFolder: "Oblivion",
    },
    skyrim: {
      settingsFolder: "Skyrim",
      appDataFolder: "Skyrim",
    },
    skyrimse: {
      settingsFolder: "Skyrim Special Edition",
      appDataFolder: "Skyrim Special Edition",
    },
    skyrimvr: {
      settingsFolder: "SkyrimVR",
      appDataFolder: "SkyrimVR",
    },
  },
  {
    xbox: {
      skyrimse: {
        settingsFolder: "Skyrim Special Edition MS",
        appDataFolder: "Skyrim Special Edition MS",
      },
      fallout4: {
        settingsFolder: "Fallout4 MS",
        appDataFolder: "Fallout4 MS",
      },
    },
    gog: {
      skyrimse: {
        settingsFolder: "Skyrim Special Edition GOG",
        appDataFolder: "Skyrim Special Edition GOG",
      },
      enderalspecialedition: {
        settingsFolder: "Enderal Special Edition GOG",
        appDataFolder: "Enderal Special Edition GOG",
      },
    },
    epic: {
      skyrimse: {
        settingsFolder: "Skyrim Special Edition EPIC",
        appDataFolder: "Skyrim Special Edition EPIC",
      },
      fallout4: {
        settingsFolder: "Fallout4 EPIC",
        appDataFolder: "Fallout4 EPIC",
      },
    },
  },
  (gameId) => discoveryForGame(gameId)?.store,
);

let discoveryForGame: (gameId: string) => types.IDiscoveryResult = () => undefined;

export function initGameSupport(api: types.IExtensionApi) {
  discoveryForGame = (gameId: string) => selectors.discoveryByGame(api.store.getState(), gameId);
}

export function settingsPath(game: types.IGame): string {
  const folder = gameSupport.get(game.id, "settingsFolder");
  if (folder === undefined) {
    return game.details?.settingsPath?.();
  }
  const documents =
    util.protonUserFolder(discoveryForGame(game.id)?.path, "documents") ??
    util.getVortexPath("documents");
  return path.join(documents, "My Games", folder);
}

export function appDataPath(game: types.IGame): string {
  const folder = gameSupport.get(game.id, "appDataFolder");
  if (folder === undefined) {
    return game.details?.appDataPath?.();
  }
  const appData =
    util.protonUserFolder(discoveryForGame(game.id)?.path, "localAppData") ?? localAppData();
  return path.join(appData, folder);
}
