/**
 * Shared type scale for the UI-refresh surfaces (readability pass).
 *
 * The Stage 1+2 mocks specified 9-13px regular-weight text that doesn't survive real displays.
 * Every refresh component takes its text sizes from this scale instead of orphan px literals
 * (decorative geometry — bar heights, border widths, glyph-only dots — stays local).
 *
 * Sizes scale linearly with Settings.styles.fontSize (default 14, the same value MUI consumes as
 * typography.fontSize in src/Themes/ui/Theme.tsx), but never drop below the per-role base: the
 * bases double as raised readability floors, so lowering the setting below the default cannot
 * shrink refresh text back into illegibility.
 *
 * Weight rules that go with this scale (applied at the usage sites):
 *  - text below ~13px never renders at weight 400; minimum 500,
 *  - eyebrows / section labels / chip text render at 600.
 */
import { Settings } from "../../Settings/Settings";

/** The Settings.styles.fontSize default the role bases are calibrated against. */
export const TYPE_SCALE_BASE_SETTING = 14;

/** Role base px sizes at the default fontSize setting — also the raised readability floors. */
export const typeScaleBases = {
  /** Mono section headers, letter-spaced (mock: 9-10.5px). */
  eyebrow: 11,
  /** Muted sublines, column headers, timestamps, hints, legends, chips (mock: 9.5-11px). */
  caption: 12,
  /** Row text, descriptions, inputs, buttons (mock: 10.5-12.5px). */
  body: 13,
  /** Mono numbers in rows / the HUD (mock: 11-13px). */
  value: 13,
  /** Card and group titles (mock: 12.5-14px). */
  cardTitle: 14,
  /** Prominent single lines: target hostname, palette search glyph (mock: 15-16px). */
  subheading: 16,
  /** Panel/map headers and the HUD money figure (mock: 18px). */
  heading: 18,
  /** Page titles (mock: 20px). */
  title: 20,
} as const;

export type TypeRole = keyof typeof typeScaleBases;

/** CSS px strings for every role, e.g. typeScale.body === "13px" at the default setting. */
export type TypeScale = Record<TypeRole, string>;

/**
 * Px size for a role at the given fontSize setting. Scales linearly
 * (base * setting / 14, rounded) and is floored at the role base.
 */
export function scaledTypeSize(role: TypeRole, fontSizeSetting: number = Settings.styles.fontSize): number {
  const base = typeScaleBases[role];
  // Defensive: a broken persisted setting must not collapse the UI type.
  if (!Number.isFinite(fontSizeSetting) || fontSizeSetting <= 0) return base;
  return Math.max(base, Math.round((base * fontSizeSetting) / TYPE_SCALE_BASE_SETTING));
}

/**
 * The full role → CSS px-string map. Call inside a makeStyles callback (alongside the existing
 * Settings.styles.monoFontFamily reads) so a theme refresh re-evaluates it, or in a component
 * body for inline styles.
 */
export function getTypeScale(fontSizeSetting: number = Settings.styles.fontSize): TypeScale {
  const scale = {} as Record<TypeRole, string>;
  for (const role of Object.keys(typeScaleBases) as TypeRole[]) {
    scale[role] = `${scaledTypeSize(role, fontSizeSetting)}px`;
  }
  return scale;
}
