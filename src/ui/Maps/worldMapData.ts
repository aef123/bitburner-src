/**
 * Static geometry for the World Map (3A), taken verbatim from the design mockup
 * (see .superpowers/sdd/design-notes-3A-worldmap.md).
 *
 * The canvas is a fixed 1010×680 coordinate space. Node positions, graticule
 * ellipses/lines, landmass blobs and the five Volhaven flight arcs are copied
 * from the mock. The mock only shows arcs from Volhaven (the current city in
 * the mock); for any other current city we generate quadratic beziers between
 * node centers in the same visual language (see getFlightArc).
 */
import { CityName } from "@enums";

export const MAP_WIDTH = 1010;
export const MAP_HEIGHT = 680;

export interface Point {
  x: number;
  y: number;
}

/** Latitude ellipses of the graticule (opacity is applied to the theme's accentCyan). */
export const GRATICULE_ELLIPSES = [
  { cx: 505, cy: 340, rx: 460, ry: 290, opacity: 0.07 },
  { cx: 505, cy: 340, rx: 330, ry: 290, opacity: 0.05 },
  { cx: 505, cy: 340, rx: 160, ry: 290, opacity: 0.05 },
] as const;

/** Equator + tropic lines of the graticule. */
export const GRATICULE_LINES = [
  { x1: 45, y1: 340, x2: 965, y2: 340, opacity: 0.07 },
  { x1: 65, y1: 200, x2: 945, y2: 200, opacity: 0.05 },
  { x1: 65, y1: 480, x2: 945, y2: 480, opacity: 0.05 },
] as const;

/** Decorative landmass blobs (opacity applied to accentCyan). */
export const LANDMASS_BLOBS = [
  {
    left: 150,
    top: 200,
    width: 220,
    height: 190,
    borderRadius: "58% 42% 60% 40% / 50% 55% 45% 50%",
    opacity: 0.045,
  },
  {
    left: 470,
    top: 170,
    width: 300,
    height: 230,
    borderRadius: "45% 55% 40% 60% / 55% 45% 60% 40%",
    opacity: 0.045,
  },
  {
    left: 380,
    top: 410,
    width: 150,
    height: 140,
    borderRadius: "50% 50% 45% 55% / 45% 55% 50% 50%",
    opacity: 0.035,
  },
] as const;

export interface WorldMapCityDatum {
  /** Center of the city node (mock stores top-left of a 22px/30px box; centers derived). */
  center: Point;
  /** Top-left of the label, verbatim from the mock. */
  label: Point;
  /**
   * Static, public flavor line (companies / venues everyone can see in the city).
   * Deliberately mentions no rumor-gated factions.
   */
  flavor: string;
  /** Neutral index-card badge shown when the city has nothing actionable. */
  neutralBadge: string;
}

export const worldMapCities: Record<CityName, WorldMapCityDatum> = {
  [CityName.Sector12]: {
    center: { x: 249, y: 299 },
    label: { x: 214, y: 316 },
    flavor: "MegaCorp, Blade, Four Sigma · Rothman University · CIA/NSA",
    neutralBadge: "home city",
  },
  [CityName.Aevum]: {
    center: { x: 329, y: 239 },
    label: { x: 302, y: 256 },
    flavor: "ECorp, Bachman & Assoc. · Iker Molina Casino · best coding jobs",
    neutralBadge: "casino ♠",
  },
  [CityName.Volhaven]: {
    center: { x: 559, y: 259 },
    label: { x: 522, y: 280 },
    flavor: "Best university (ZB Institute) · Millenium Gym · OmniTek, NWO",
    neutralBadge: "visited",
  },
  [CityName.Chongqing]: {
    center: { x: 779, y: 249 },
    label: { x: 746, y: 266 },
    flavor: "KuaiGong International · Solaris Space Systems · few distractions",
    neutralBadge: "visited",
  },
  [CityName.NewTokyo]: {
    center: { x: 829, y: 329 },
    label: { x: 796, y: 346 },
    flavor: "DefComm · VitaLife · Noodle Bar",
    neutralBadge: "visited",
  },
  [CityName.Ishima]: {
    center: { x: 719, y: 399 },
    label: { x: 690, y: 416 },
    flavor: "Storm Technologies · Nova Medical · Omega Software",
    neutralBadge: "visited",
  },
};

interface Arc {
  start: Point;
  control: Point;
  end: Point;
}

/**
 * The five flight arcs shown in the mock, verbatim (all start at Volhaven's node,
 * (560, 260) in the mock's rounding).
 */
const VOLHAVEN_ARC_START: Point = { x: 560, y: 260 };
const VOLHAVEN_ARCS: Record<Exclude<CityName, CityName.Volhaven>, { control: Point; end: Point }> = {
  [CityName.Sector12]: { control: { x: 420, y: 120 }, end: { x: 250, y: 300 } },
  [CityName.Aevum]: { control: { x: 460, y: 180 }, end: { x: 330, y: 240 } },
  [CityName.Chongqing]: { control: { x: 680, y: 160 }, end: { x: 780, y: 250 } },
  [CityName.NewTokyo]: { control: { x: 720, y: 220 }, end: { x: 830, y: 330 } },
  [CityName.Ishima]: { control: { x: 660, y: 340 }, end: { x: 720, y: 400 } },
};

/**
 * Control point for arcs the mock does not define: bow the curve upward from the
 * midpoint, perpendicular to the route, mimicking the mock's great-circle look.
 */
function generatedControl(a: Point, b: Point): Point {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  // Perpendicular unit vector, sign chosen so the arc bows toward the top of the map.
  let px = dy / dist;
  let py = -dx / dist;
  if (py > 0 || (py === 0 && px < 0)) {
    px = -px;
    py = -py;
  }
  const k = Math.min(dist * 0.35, 120);
  return { x: mid.x + px * k, y: mid.y + py * k };
}

export interface FlightArc {
  /** SVG path ("M … Q …") for the dashed arc. */
  path: string;
  /** Point at t=0.5 on the curve — where the waypoint dot goes on highlighted arcs. */
  waypoint: Point;
}

/** Quadratic bezier point at t = 0.5. */
function quadraticMidpoint(a: Point, c: Point, b: Point): Point {
  return { x: (a.x + 2 * c.x + b.x) / 4, y: (a.y + 2 * c.y + b.y) / 4 };
}

function toFlightArc(arc: Arc): FlightArc {
  return {
    path: `M ${arc.start.x} ${arc.start.y} Q ${arc.control.x} ${arc.control.y} ${arc.end.x} ${arc.end.y}`,
    waypoint: quadraticMidpoint(arc.start, arc.control, arc.end),
  };
}

/**
 * Flight arc between two cities. Routes touching Volhaven use the mock's verbatim
 * geometry (reversed when Volhaven is the destination — a reversed quadratic bezier
 * is the same curve); all other routes are generated.
 */
export function getFlightArc(from: CityName, to: CityName): FlightArc {
  if (from === to) throw new Error(`No flight arc from ${from} to itself`);
  if (from === CityName.Volhaven) {
    const { control, end } = VOLHAVEN_ARCS[to as Exclude<CityName, CityName.Volhaven>];
    return toFlightArc({ start: VOLHAVEN_ARC_START, control, end });
  }
  if (to === CityName.Volhaven) {
    const { control, end } = VOLHAVEN_ARCS[from as Exclude<CityName, CityName.Volhaven>];
    return toFlightArc({ start: end, control, end: VOLHAVEN_ARC_START });
  }
  const a = worldMapCities[from].center;
  const b = worldMapCities[to].center;
  return toFlightArc({ start: a, control: generatedControl(a, b), end: b });
}
