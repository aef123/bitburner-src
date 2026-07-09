/**
 * Shared type scale for the UI-refresh surfaces (readability pass):
 *  - role bases are raised readability floors — at (and below) the default fontSize setting,
 *    every role renders at its base px,
 *  - raising Settings.styles.fontSize scales every role linearly,
 *  - getTypeScale() covers every role with a CSS px string and follows Settings by default.
 */
import { Settings } from "../../../src/Settings/Settings";
import { defaultStyles } from "../../../src/Themes/Styles";
import {
  getTypeScale,
  scaledTypeSize,
  TYPE_SCALE_BASE_SETTING,
  typeScaleBases,
  type TypeRole,
} from "../../../src/Themes/tokens/typeScale";

const roles = Object.keys(typeScaleBases) as TypeRole[];

describe("typeScale — calibration", () => {
  test("the scale is calibrated against the default fontSize setting", () => {
    expect(TYPE_SCALE_BASE_SETTING).toBe(defaultStyles.fontSize);
  });

  test("role bases hit the readability floors from the readability pass", () => {
    expect(typeScaleBases.eyebrow).toBe(11);
    expect(typeScaleBases.caption).toBe(12);
    expect(typeScaleBases.body).toBe(13);
    expect(typeScaleBases.value).toBe(13);
    expect(typeScaleBases.cardTitle).toBe(14);
    expect(typeScaleBases.title).toBe(20);
  });
});

describe("typeScale — floors", () => {
  test.each(roles)("role %s renders at its base at the default setting", (role) => {
    expect(scaledTypeSize(role, TYPE_SCALE_BASE_SETTING)).toBe(typeScaleBases[role]);
  });

  test.each(roles)("role %s never drops below its base when the setting is lowered", (role) => {
    for (const setting of [4, 8, 10, 13]) {
      expect(scaledTypeSize(role, setting)).toBe(typeScaleBases[role]);
    }
  });

  test.each(roles)("role %s falls back to its base for broken settings", (role) => {
    expect(scaledTypeSize(role, NaN)).toBe(typeScaleBases[role]);
    expect(scaledTypeSize(role, 0)).toBe(typeScaleBases[role]);
    expect(scaledTypeSize(role, -14)).toBe(typeScaleBases[role]);
    expect(scaledTypeSize(role, Infinity)).toBe(typeScaleBases[role]);
  });
});

describe("typeScale — scaling up", () => {
  test.each(roles)("role %s scales linearly with a larger setting", (role) => {
    const setting = TYPE_SCALE_BASE_SETTING * 1.5;
    const scaled = scaledTypeSize(role, setting);
    expect(scaled).toBe(Math.round(typeScaleBases[role] * 1.5));
    expect(scaled).toBeGreaterThan(typeScaleBases[role]);
  });

  test("scaled sizes are monotonically non-decreasing in the setting", () => {
    for (const role of roles) {
      let previous = 0;
      for (let setting = 6; setting <= 40; setting++) {
        const size = scaledTypeSize(role, setting);
        expect(size).toBeGreaterThanOrEqual(previous);
        previous = size;
      }
    }
  });
});

describe("getTypeScale — role coverage", () => {
  test("returns a CSS px string for every role", () => {
    const scale = getTypeScale(TYPE_SCALE_BASE_SETTING);
    expect(Object.keys(scale).sort()).toEqual([...roles].sort());
    for (const role of roles) {
      expect(scale[role]).toBe(`${typeScaleBases[role]}px`);
      expect(scale[role]).toMatch(/^\d+px$/);
    }
  });

  test("follows Settings.styles.fontSize by default", () => {
    const saved = Settings.styles.fontSize;
    try {
      Settings.styles.fontSize = TYPE_SCALE_BASE_SETTING * 2;
      const scale = getTypeScale();
      for (const role of roles) {
        expect(scale[role]).toBe(`${typeScaleBases[role] * 2}px`);
      }
      expect(scaledTypeSize("body")).toBe(typeScaleBases.body * 2);
    } finally {
      Settings.styles.fontSize = saved;
    }
  });
});
