/**
 * The original ASCII world map, extracted to a shared module so that BOTH the
 * classic text map (src/ui/React/WorldMap.tsx) and the vector Travel Agency map
 * (src/ui/Maps/worldMapData.ts) consume ONE source. 22 rows, 69 columns at the
 * widest. Each city appears as the first letter of its display name (V/C/S/N/A/I)
 * at its exact position in the art — CITY_LETTER_TO_NAME maps letters back to
 * CityName. Every other non-space character is coastline texture.
 *
 * The strings are byte-exact copies of what the original JSX rendered,
 * including the double-backslash runs (JSX text treats backslashes literally).
 * Do not "fix" the escaping or reflow the art — the classic map must render
 * character-for-character identically, and the vector map's continents are
 * generated from these glyphs.
 */
import { CityName } from "@enums";

export const WORLD_MAP_ART: readonly string[] = [
  "               ,_   .  ._. _.  .",
  "           , _-\\','|~\\~      ~/      ;-'_   _-'     ,;_;_,    ~~-",
  "  /~~-\\_/-'~'--' \\~~| ',    ,'      /  / ~|-_\\_/~/~      ~~--~~~~'--_",
  "  /              ,/'-/~ '\\ ,' _  , 'V,'|~                   ._/-, /~",
  "  ~/-'~\\_,       '-,| '|. '   ~  ,\\ /'~                /    /_  /~",
  ".-~      '|        '',\\~|\\       _\\~     ,_  ,     C         /,",
  "          '\\     S  /'~          |_/~\\\\,-,~  \\ \"         ,_,/ |",
  "           |       /            ._-~'\\_ _~|              \\ ) N",
  "            \\   __-\\           '/      ~ |\\  \\_          /  ~",
  "  .,         '\\ |,  ~-_      - |          \\\\_' ~|  /\\  \\~ ,",
  "               ~-_'  _;       '\\           '-,   \\,' /\\/  |",
  "                 '\\_,~'\\_       \\_ _,       /'    '  |, /|'",
  "                   /     \\_       ~ |      /         \\  ~'; -,_.",
  "                   |       ~\\        |    |  ,        '-_, ,; ~ ~\\",
  "                    \\,   A  /        \\    / /|            ,-, ,   -,",
  "                     |    ,/          |  |' |/          ,-   ~ \\   '.",
  "                    ,|   ,/           \\ ,/              \\   I   |",
  "                    /    |             ~                 -~~-, /   _",
  "                    | ,-'                                    ~    /",
  "                    / ,'                                      ~",
  "                    ',|  ~",
  "                      ~'",
] as const;

/**
 * City letter → CityName. Letters are `CityName[0]` — the same single character
 * the classic map's <City/> element renders. The art contains no other
 * alphabetic characters, so the letters are unambiguous.
 */
export const CITY_LETTER_TO_NAME: Readonly<Partial<Record<string, CityName>>> = {
  V: CityName.Volhaven,
  C: CityName.Chongqing,
  S: CityName.Sector12,
  N: CityName.NewTokyo,
  A: CityName.Aevum,
  I: CityName.Ishima,
};
