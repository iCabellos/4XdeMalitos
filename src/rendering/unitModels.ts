import * as THREE from 'three';
import type { TroopRole } from '../data/troops';

/**
 * Procedural 3D stand-ins for the units on the map.
 *
 * These are deliberately built from primitives rather than loaded from files:
 * a prototype should not carry an asset pipeline, and the read that matters is
 * "what kind of force is this and whose is it", which silhouette and colour
 * carry on their own. Geometry is shared across every instance; only the
 * material varies, and it is cached per owner colour.
 */

export interface UnitModelOptions {
  role: TroopRole;
  /** Owner colour, used for the hull. */
  color: number;
  /** Scales with stack size so a big army reads as a big army. */
  scale: number;
}

type GeometryKey =
  | 'body'
  | 'head'
  | 'rifle'
  | 'hull'
  | 'turret'
  | 'barrel'
  | 'longBarrel'
  | 'track'
  | 'wheel'
  | 'boatHull'
  | 'mast'
  | 'fuselage'
  | 'rotor'
  | 'wing'
  | 'base';

export class UnitModelFactory {
  private geometries = new Map<GeometryKey, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshLambertMaterial>();

  private geometry(key: GeometryKey): THREE.BufferGeometry {
    const existing = this.geometries.get(key);
    if (existing) return existing;
    const created = this.createGeometry(key);
    this.geometries.set(key, created);
    return created;
  }

  private createGeometry(key: GeometryKey): THREE.BufferGeometry {
    switch (key) {
      case 'body':
        return new THREE.CapsuleGeometry(0.075, 0.14, 3, 6);
      case 'head':
        return new THREE.SphereGeometry(0.055, 6, 5);
      case 'rifle':
        return new THREE.BoxGeometry(0.02, 0.02, 0.2);
      case 'hull':
        return new THREE.BoxGeometry(0.34, 0.11, 0.5);
      case 'turret':
        return new THREE.CylinderGeometry(0.11, 0.13, 0.09, 8);
      case 'barrel':
        return new THREE.CylinderGeometry(0.022, 0.022, 0.34, 6);
      case 'longBarrel':
        return new THREE.CylinderGeometry(0.022, 0.026, 0.52, 6);
      case 'track':
        return new THREE.BoxGeometry(0.07, 0.09, 0.52);
      case 'wheel':
        return new THREE.CylinderGeometry(0.055, 0.055, 0.04, 8);
      case 'boatHull':
        // A wedge reads as a bow far better than a box at this size.
        return new THREE.CylinderGeometry(0.09, 0.16, 0.56, 4);
      case 'mast':
        return new THREE.BoxGeometry(0.13, 0.13, 0.16);
      case 'fuselage':
        return new THREE.CapsuleGeometry(0.062, 0.28, 3, 6);
      case 'rotor':
        return new THREE.BoxGeometry(0.62, 0.012, 0.045);
      case 'wing':
        return new THREE.BoxGeometry(0.54, 0.016, 0.1);
      case 'base':
        return new THREE.CylinderGeometry(0.3, 0.32, 0.05, 12);
    }
  }

  private material(color: number, shade = 1): THREE.MeshLambertMaterial {
    const key = `${color}:${shade}`;
    const existing = this.materials.get(key);
    if (existing) return existing;
    const tinted = new THREE.Color(color).multiplyScalar(shade);
    const created = new THREE.MeshLambertMaterial({ color: tinted });
    this.materials.set(key, created);
    return created;
  }

  private mesh(key: GeometryKey, color: number, shade = 1): THREE.Mesh {
    return new THREE.Mesh(this.geometry(key), this.material(color, shade));
  }

  /** Builds the model for one army, centred on the origin, standing on y = 0. */
  build(options: UnitModelOptions): THREE.Group {
    const group = new THREE.Group();
    const { role, color } = options;

    // Owner-coloured pad: whose unit this is must read even when zoomed out.
    const base = this.mesh('base', color, 1.15);
    base.position.y = 0.025;
    group.add(base);

    switch (role) {
      case 'infantry':
        this.buildInfantry(group, color);
        break;
      case 'armor':
        this.buildTank(group, color);
        break;
      case 'artillery':
        this.buildArtillery(group, color);
        break;
      case 'recon':
        this.buildRecon(group, color);
        break;
      case 'naval':
        this.buildShip(group, color);
        break;
      case 'air':
        this.buildHelicopter(group, color);
        break;
    }

    group.scale.setScalar(options.scale);
    return group;
  }

  /** Two figures shoulder to shoulder: a squad, not a lone soldier. */
  private buildInfantry(group: THREE.Group, color: number): void {
    for (const offset of [-0.09, 0.09]) {
      const body = this.mesh('body', color);
      body.position.set(offset, 0.16, 0);
      group.add(body);

      const head = this.mesh('head', color, 0.72);
      head.position.set(offset, 0.28, 0);
      group.add(head);

      const rifle = this.mesh('rifle', color, 0.45);
      rifle.position.set(offset + 0.06, 0.19, 0.06);
      rifle.rotation.x = 0.35;
      group.add(rifle);
    }
  }

  private buildTank(group: THREE.Group, color: number): void {
    const hull = this.mesh('hull', color);
    hull.position.y = 0.12;
    group.add(hull);

    for (const side of [-0.15, 0.15]) {
      const track = this.mesh('track', color, 0.5);
      track.position.set(side, 0.09, 0);
      group.add(track);
    }

    const turret = this.mesh('turret', color, 0.85);
    turret.position.y = 0.22;
    group.add(turret);

    const barrel = this.mesh('barrel', color, 0.6);
    barrel.position.set(0, 0.23, 0.2);
    barrel.rotation.x = Math.PI / 2;
    group.add(barrel);
  }

  /** Same chassis as armour but with an unmistakably longer, raised gun. */
  private buildArtillery(group: THREE.Group, color: number): void {
    const hull = this.mesh('hull', color);
    hull.scale.set(0.9, 1, 0.85);
    hull.position.y = 0.11;
    group.add(hull);

    for (const side of [-0.14, 0.14]) {
      const track = this.mesh('track', color, 0.5);
      track.scale.set(1, 1, 0.85);
      track.position.set(side, 0.085, 0);
      group.add(track);
    }

    const mount = this.mesh('turret', color, 0.8);
    mount.scale.set(0.85, 1, 0.85);
    mount.position.y = 0.2;
    group.add(mount);

    const barrel = this.mesh('longBarrel', color, 0.55);
    barrel.position.set(0, 0.3, 0.2);
    barrel.rotation.x = Math.PI / 2 - 0.42; // raised: it lobs, it does not aim flat
    group.add(barrel);
  }

  private buildRecon(group: THREE.Group, color: number): void {
    const hull = this.mesh('hull', color);
    hull.scale.set(0.78, 0.8, 0.72);
    hull.position.y = 0.11;
    group.add(hull);

    for (const x of [-0.13, 0.13]) {
      for (const z of [-0.14, 0.14]) {
        const wheel = this.mesh('wheel', color, 0.42);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.06, z);
        group.add(wheel);
      }
    }

    // A whip antenna: the silhouette cue that this thing is here to look.
    const antenna = this.mesh('rifle', color, 0.5);
    antenna.scale.set(1, 1, 1.6);
    antenna.position.set(0.08, 0.26, -0.05);
    antenna.rotation.x = Math.PI / 2;
    group.add(antenna);
  }

  private buildShip(group: THREE.Group, color: number): void {
    const hull = this.mesh('boatHull', color);
    hull.rotation.x = Math.PI / 2;
    hull.rotation.z = Math.PI / 4; // square the wedge to the hex
    hull.position.y = 0.1;
    group.add(hull);

    const superstructure = this.mesh('mast', color, 0.8);
    superstructure.position.set(0, 0.19, -0.04);
    group.add(superstructure);

    const gun = this.mesh('barrel', color, 0.55);
    gun.scale.set(1, 0.6, 1);
    gun.position.set(0, 0.17, 0.16);
    gun.rotation.x = Math.PI / 2;
    group.add(gun);
  }

  private buildHelicopter(group: THREE.Group, color: number): void {
    // Air units hover: the gap under them is the read that they fly.
    const fuselage = this.mesh('fuselage', color);
    fuselage.rotation.x = Math.PI / 2;
    fuselage.position.y = 0.34;
    group.add(fuselage);

    const rotor = this.mesh('rotor', color, 0.45);
    rotor.position.y = 0.46;
    group.add(rotor);
    const rotorCross = this.mesh('rotor', color, 0.45);
    rotorCross.position.y = 0.46;
    rotorCross.rotation.y = Math.PI / 2;
    group.add(rotorCross);

    const tail = this.mesh('wing', color, 0.5);
    tail.scale.set(0.35, 1, 0.5);
    tail.position.set(0, 0.34, -0.22);
    group.add(tail);

    // Skids, so it reads as a helicopter rather than a floating capsule.
    for (const side of [-0.07, 0.07]) {
      const skid = this.mesh('rifle', color, 0.4);
      skid.scale.set(1, 1, 1.3);
      skid.position.set(side, 0.21, 0);
      skid.rotation.x = Math.PI / 2;
      group.add(skid);
    }
  }

  /** Frees every shared geometry and material. Call once, on teardown. */
  dispose(): void {
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.geometries.clear();
    this.materials.clear();
  }
}

/** The role that best characterises a composition, used to pick the model. */
export function dominantRole(
  composition: Record<string, number>,
  roleOf: (troopId: string) => TroopRole,
): TroopRole {
  // Weight by count, but let the heavier roles speak louder: an army with ten
  // tanks and twelve riflemen is an armoured force.
  const weight: Record<string, number> = {
    infantry: 1,
    recon: 1.2,
    artillery: 2,
    armor: 2.4,
    naval: 2.4,
    air: 2.6,
  };
  let best: TroopRole = 'infantry';
  let bestScore = -1;
  const totals: Partial<Record<TroopRole, number>> = {};
  for (const [troopId, count] of Object.entries(composition)) {
    if (count <= 0) continue;
    const role = roleOf(troopId);
    totals[role] = (totals[role] ?? 0) + count * (weight[role] ?? 1);
  }
  for (const [role, score] of Object.entries(totals) as [TroopRole, number][]) {
    if (score > bestScore) {
      bestScore = score;
      best = role;
    }
  }
  return best;
}
