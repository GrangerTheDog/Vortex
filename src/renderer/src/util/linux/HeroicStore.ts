import type { IExtensionApi } from "../../types/IExtensionContext";
import type { IGameStore, IGameStoreSnapshot } from "../../types/IGameStore";
import { GameEntryNotFound } from "../../types/IGameStore";
import type { IGameStoreEntry } from "../../types/IGameStoreEntry";
import { log } from "../log";
import opn from "../opn";
import { heroicConfigDirs, heroicGames, heroicLaunchUrl, type HeroicRunner } from "./heroic";

/**
 * Epic or GOG games installed through Heroic Games Launcher. Uses the store
 * ids of Vortex's Windows Epic/GOG integrations, so game extensions find these
 * games with their existing Epic/GOG ids.
 */
export class HeroicStore implements IGameStore {
  public id: string;
  public name: string;
  public priority: number;
  #runner: HeroicRunner;
  #snapshot: IGameStoreSnapshot;

  constructor(id: string, name: string, runner: HeroicRunner, priority: number) {
    this.id = id;
    this.name = name;
    this.#runner = runner;
    this.priority = priority;
    this.#snapshot = { entries: [], isInstalled: heroicConfigDirs().length > 0 };
  }

  public allGames(): Promise<IGameStoreEntry[]> {
    return Promise.resolve(this.#snapshot.entries);
  }

  public snapshot(): IGameStoreSnapshot {
    return this.#snapshot;
  }

  public async reloadGames(): Promise<void> {
    const entries = heroicGames()
      .filter((game) => game.runner === this.#runner)
      .map(
        (game): IGameStoreEntry => ({
          appid: game.appName,
          name: game.title,
          gamePath: game.installPath,
          gameStoreId: this.id,
        }),
      );
    log("debug", "heroic games", { store: this.id, count: entries.length });
    this.#snapshot = { entries, isInstalled: this.#snapshot.isInstalled };
  }

  public async findByAppId(appId: string | string[]): Promise<IGameStoreEntry> {
    const ids = Array.isArray(appId) ? appId : [appId];
    const entry = this.#snapshot.entries.find((game) => ids.includes(game.appid));
    if (entry === undefined) {
      throw new GameEntryNotFound(ids.join(", "), this.id);
    }
    return entry;
  }

  public async findByName(appName: string): Promise<IGameStoreEntry> {
    const re = new RegExp("^" + appName + "$");
    const entry = this.#snapshot.entries.find((game) => re.test(game.name));
    if (entry === undefined) {
      throw new GameEntryNotFound(appName, this.id);
    }
    return entry;
  }

  public async isGameInstalled(name: string): Promise<boolean> {
    return this.#snapshot.entries.some((game) => game.appid === name || game.name === name);
  }

  public async isGameStoreInstalled(): Promise<boolean> {
    return this.#snapshot.isInstalled;
  }

  public getGameStorePath(): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }

  /** Have Heroic start the game, with the Wine/Proton setup the user chose there. */
  public async launchGame(appInfo: any, _api?: IExtensionApi): Promise<void> {
    const appId: string =
      typeof appInfo === "string" ? appInfo : (appInfo?.appId ?? appInfo?.appid ?? appInfo?.id);
    if (appId === undefined) {
      throw new GameEntryNotFound(JSON.stringify(appInfo), this.id);
    }
    await opn(heroicLaunchUrl(this.#runner, appId));
  }

  public async launchGameStore(): Promise<void> {
    await opn("heroic://");
  }
}

/** Heroic-backed Epic and GOG stores, if Heroic is installed. Linux only. */
export function createHeroicStores(): IGameStore[] {
  if (process.platform !== "linux" || heroicConfigDirs().length === 0) {
    return [];
  }
  return [
    new HeroicStore("epic", "Epic Games (Heroic)", "legendary", 60),
    new HeroicStore("gog", "GOG (Heroic)", "gog", 15),
  ];
}
