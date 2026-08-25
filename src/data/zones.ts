/**
 * Zone layout of the map.
 *
 * The map is three concentric zones separated by walls that nothing crosses -
 * ground, naval or air alike. The only way through is a gate, and gates open on
 * a fixed day, which is what gives a nine-day match its shape:
 *
 *   days 1-2  sealed in your own outer sector: pure economy, no contact
 *   days 3-5  zone 2 gates open: three contested sectors, the first fighting
 *   days 6-9  zone 3 gates open: the race for the core and the final objective
 */

export type ZoneId = 1 | 2 | 3;

export interface ZoneDefinition {
  id: ZoneId;
  name: string;
  /** Inclusive ring range from the map centre. */
  innerRing: number;
  outerRing: number;
  /** How many walled sectors the ring is divided into. */
  sectors: number;
  /** Day on which the gates leading INTO this zone open. 0 == open from start. */
  gatesOpenOnDay: number;
  /** Strong brown base colour of the zone's hexes. */
  color: number;
  /**
   * Colour of the wall prisms on this zone's boundary. Walls are deliberately
   * a light concrete against the brown ground: a dark wall disappears into the
   * shadow gap between hexes and reads as no wall at all.
   */
  wallColor: number;
  blurb: string;
}

export const ZONES: Record<ZoneId, ZoneDefinition> = {
  1: {
    id: 1,
    name: 'Zona 1 - Periferia',
    innerRing: 6,
    outerRing: 8,
    sectors: 5,
    gatesOpenOnDay: 0,
    color: 0x9c6b3d,
    wallColor: 0xcdbba0,
    blurb:
      'Tu sector de despliegue, sellado hasta el dia 3. Recursos comunes abundantes y nadie que te moleste.',
  },
  2: {
    id: 2,
    name: 'Zona 2 - Cinturon',
    innerRing: 3,
    outerRing: 5,
    sectors: 3,
    gatesOpenOnDay: 3,
    color: 0x764726,
    wallColor: 0xb8a184,
    blurb:
      'Tres sectores disputados. Recursos comunes muy abundantes, los primeros raros y los objetivos secundarios.',
  },
  3: {
    id: 3,
    name: 'Zona 3 - Nucleo',
    innerRing: 0,
    outerRing: 2,
    sectors: 1,
    gatesOpenOnDay: 6,
    color: 0x502a10,
    wallColor: 0x9e8467,
    blurb:
      'El nucleo. Recursos raros abundantes y el Mando Central: quien lo conquista se lleva el item mas raro.',
  },
};

export const ZONE_IDS: ZoneId[] = [1, 2, 3];

export function zoneDef(id: ZoneId): ZoneDefinition {
  return ZONES[id];
}

/** Which zone a ring distance from the centre belongs to. */
export function zoneForRing(ring: number): ZoneId {
  if (ring <= ZONES[3].outerRing) return 3;
  if (ring <= ZONES[2].outerRing) return 2;
  return 1;
}

/**
 * Gates per boundary. Zone 2 gets two entrances per sector so a sector is never
 * a dead end; zone 3 gets one per sector so all three funnel into the core.
 */
export const GATES_PER_ZONE2_SECTOR = 2;
export const GATES_PER_ZONE3_ENTRANCE = 1;
