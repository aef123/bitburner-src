/**
 * Faction category tags for the Factions screen (UI refresh, design-notes-1A).
 *
 * This is NOT invented lore: the grouping mirrors the section comments that already organize
 * `src/Faction/FactionInfo.tsx` (the canonical faction data file):
 *   - "// Endgame"                       → ENDGAME (Illuminati, Daedalus, The Covenant)
 *   - "// Megacorporations, each forms its own faction" + "// Other Corporations" → CORP
 *   - "// Hacker groups"                 → HACK
 *   - "// City factions, essentially governments" → CITY
 *   - "// Criminal Organizations/Gangs"  → CRIME
 *   - "// Early game factions - ..."     → EARLY
 *   - "// Special Factions"              → SPECIAL
 *
 * If a faction is ever added to FactionInfo without a category here, the record type breaks the
 * build (Record over the full FactionName enum), so the mapping cannot silently drift.
 */
import { FactionName } from "../Enums";

export enum FactionCategory {
  Endgame = "ENDGAME",
  Corp = "CORP",
  Hack = "HACK",
  City = "CITY",
  Crime = "CRIME",
  Early = "EARLY",
  Special = "SPECIAL",
}

export const FactionCategories: Record<FactionName, FactionCategory> = {
  // Endgame
  [FactionName.Illuminati]: FactionCategory.Endgame,
  [FactionName.Daedalus]: FactionCategory.Endgame,
  [FactionName.TheCovenant]: FactionCategory.Endgame,
  // Megacorporations
  [FactionName.ECorp]: FactionCategory.Corp,
  [FactionName.MegaCorp]: FactionCategory.Corp,
  [FactionName.BachmanAndAssociates]: FactionCategory.Corp,
  [FactionName.BladeIndustries]: FactionCategory.Corp,
  [FactionName.NWO]: FactionCategory.Corp,
  [FactionName.ClarkeIncorporated]: FactionCategory.Corp,
  [FactionName.OmniTekIncorporated]: FactionCategory.Corp,
  [FactionName.FourSigma]: FactionCategory.Corp,
  [FactionName.KuaiGongInternational]: FactionCategory.Corp,
  // Other Corporations
  [FactionName.FulcrumSecretTechnologies]: FactionCategory.Corp,
  // Hacker groups
  [FactionName.BitRunners]: FactionCategory.Hack,
  [FactionName.TheBlackHand]: FactionCategory.Hack,
  [FactionName.NiteSec]: FactionCategory.Hack,
  [FactionName.CyberSec]: FactionCategory.Hack,
  // City factions
  [FactionName.Aevum]: FactionCategory.City,
  [FactionName.Chongqing]: FactionCategory.City,
  [FactionName.Ishima]: FactionCategory.City,
  [FactionName.NewTokyo]: FactionCategory.City,
  [FactionName.Sector12]: FactionCategory.City,
  [FactionName.Volhaven]: FactionCategory.City,
  // Criminal Organizations/Gangs
  [FactionName.SpeakersForTheDead]: FactionCategory.Crime,
  [FactionName.TheDarkArmy]: FactionCategory.Crime,
  [FactionName.TheSyndicate]: FactionCategory.Crime,
  [FactionName.Silhouette]: FactionCategory.Crime,
  [FactionName.Tetrads]: FactionCategory.Crime,
  [FactionName.SlumSnakes]: FactionCategory.Crime,
  // Early game factions
  [FactionName.Netburners]: FactionCategory.Early,
  [FactionName.TianDiHui]: FactionCategory.Early,
  // Special Factions
  [FactionName.Bladeburners]: FactionCategory.Special,
  [FactionName.ChurchOfTheMachineGod]: FactionCategory.Special,
  [FactionName.ShadowsOfAnarchy]: FactionCategory.Special,
};
