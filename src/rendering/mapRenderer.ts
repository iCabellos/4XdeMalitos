import * as THREE from 'three';
import { createSceneKit, createTapDetector, type SceneKit } from './sceneKit';
import { PALETTE } from './palette';
import { hexToWorld, neighborIds, HEX_SIZE, type HexId } from '../map/hex';
import { TERRAINS, nodeDef } from '../data/terrain';
import { mapBuildingDef } from '../data/buildings.map';
import { ZONES } from '../data/zones';
import { troopDef } from '../data/troops';
import { UnitModelFactory, dominantRole } from './unitModels';
import type { MatchState, PlayerId, Tile } from '../core/types';

export interface MapViewSelection {
  hex: HexId | null;
  armyId: string | null;
  /** Hexes to highlight as reachable this day. */
  reachable: Set<HexId>;
  /** Hexes to highlight as valid attack targets. */
  targets: Set<HexId>;
}

const EMPTY_SELECTION: MapViewSelection = {
  hex: null,
  armyId: null,
  reachable: new Set(),
  targets: new Set(),
};

const TILE_RADIUS = HEX_SIZE * 0.94;

/** True when `tile` carries a gate joining its region with `other`'s. */
function gateJoins(tile: Tile, other: Tile): boolean {
  const gate = tile.feature.gate;
  if (!gate) return false;
  return (
    (gate.regionA === tile.regionId && gate.regionB === other.regionId) ||
    (gate.regionB === tile.regionId && gate.regionA === other.regionId)
  );
}

/** Reused so the per-tile loop never allocates a Color per hex. */
const ROAD_TINT = new THREE.Color(0x2b2118);
const MEMORY_TINT = new THREE.Color(0x2f2a26);
const WATER_TINT = new THREE.Color(0x2c5f86);

/**
 * Zone colour is the ground truth of the map: the three rings must read as
 * three strong browns. Terrain only modulates that brown, so a forest is a
 * darker, greener brown rather than a different palette - except water, which
 * has to stay blue or naval movement becomes unreadable.
 */
const TERRAIN_TINT: Record<string, { color: number; amount: number }> = {
  plains: { color: 0xa87c46, amount: 0.1 },
  forest: { color: 0x53602f, amount: 0.34 },
  hills: { color: 0xb08a52, amount: 0.2 },
  mountain: { color: 0x7a6857, amount: 0.32 },
  urban: { color: 0x94897c, amount: 0.3 },
  ruins: { color: 0x7f6a58, amount: 0.24 },
  wasteland: { color: 0xbd9a60, amount: 0.22 },
  water: { color: 0x2c5f86, amount: 1 },
};

/**
 * Renders a match. It reads MatchState and never writes to it: the simulation
 * is fully playable with this class absent, which is what keeps a headless
 * server or a test run possible.
 */
export class MapRenderer {
  private kit: SceneKit;
  private tiles: THREE.InstancedMesh;
  private collars: THREE.InstancedMesh;
  private overlay: THREE.InstancedMesh;
  private markerGroup = new THREE.Group();
  private armyGroup = new THREE.Group();
  private wallGroup = new THREE.Group();
  private units = new UnitModelFactory();
  private selectionRing: THREE.Mesh;
  private hexOrder: HexId[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private frame = 0;
  private detachTap: () => void;
  private running = true;
  private disposables: (THREE.BufferGeometry | THREE.Material)[] = [];

  constructor(
    container: HTMLElement,
    private onPickHex: (hex: HexId | null) => void,
  ) {
    this.kit = createSceneKit({
      container,
      minDistance: 8,
      maxDistance: 46,
      panLimit: 18,
      initialDistance: 26,
    });

    const tileGeometry = new THREE.CylinderGeometry(TILE_RADIUS, TILE_RADIUS, 1, 6);
    tileGeometry.translate(0, 0.5, 0); // base sits on y = 0 so scaling grows upward
    // No `vertexColors` here on purpose. For an InstancedMesh, three.js defines
    // USE_COLOR in the vertex shader only from material.vertexColors, and that
    // path does `vColor *= color` against a per-vertex attribute this geometry
    // does not have, which zeroes every instance to black. Leaving it off lets
    // USE_INSTANCING_COLOR drive vColor on its own.
    const tileMaterial = new THREE.MeshLambertMaterial({});
    this.tiles = new THREE.InstancedMesh(tileGeometry, tileMaterial, 1);
    this.tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.kit.scene.add(this.tiles);

    // Ownership collar: an open hexagonal band drawn around a controlled tile.
    const collarGeometry = new THREE.CylinderGeometry(
      TILE_RADIUS * 1.02,
      TILE_RADIUS * 1.02,
      0.14,
      6,
      1,
      true,
    );
    const collarMaterial = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    this.collars = new THREE.InstancedMesh(collarGeometry, collarMaterial, 1);
    this.kit.scene.add(this.collars);

    // Flat overlay used for reachable / attackable highlights.
    const overlayGeometry = new THREE.CylinderGeometry(TILE_RADIUS * 0.9, TILE_RADIUS * 0.9, 0.04, 6);
    const overlayMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.42,
    });
    this.overlay = new THREE.InstancedMesh(overlayGeometry, overlayMaterial, 1);
    this.kit.scene.add(this.overlay);

    this.kit.scene.add(this.wallGroup);
    this.kit.scene.add(this.markerGroup);
    this.kit.scene.add(this.armyGroup);

    const ringGeometry = new THREE.TorusGeometry(TILE_RADIUS * 0.98, 0.055, 8, 6);
    ringGeometry.rotateX(Math.PI / 2);
    ringGeometry.rotateY(Math.PI / 6);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.selection });
    this.selectionRing = new THREE.Mesh(ringGeometry, ringMaterial);
    this.selectionRing.visible = false;
    this.kit.scene.add(this.selectionRing);

    this.disposables.push(
      tileGeometry,
      tileMaterial,
      collarGeometry,
      collarMaterial,
      overlayGeometry,
      overlayMaterial,
      ringGeometry,
      ringMaterial,
    );

    this.detachTap = createTapDetector(this.kit.renderer.domElement, (x, y) => this.pick(x, y));
    this.loop();
  }

  private loop = () => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.loop);
    // Gentle pulse so the selected hex reads on a small screen without hover.
    if (this.selectionRing.visible) {
      const t = performance.now() * 0.004;
      this.selectionRing.scale.setScalar(1 + Math.sin(t) * 0.045);
    }
    this.kit.render();
  };

  private pick(clientX: number, clientY: number): void {
    this.kit.toNdc(clientX, clientY, this.pointer);
    this.raycaster.setFromCamera(this.pointer, this.kit.camera);
    const hits = this.raycaster.intersectObject(this.tiles, false);
    if (hits.length === 0 || hits[0].instanceId === undefined) {
      this.onPickHex(null);
      return;
    }
    this.onPickHex(this.hexOrder[hits[0].instanceId] ?? null);
  }

  /** Rebuilds the whole view from state. Called on any change, not per frame. */
  update(state: MatchState, viewerId: PlayerId, selection: MapViewSelection = EMPTY_SELECTION): void {
    const viewer = state.players.find((p) => p.id === viewerId);
    if (!viewer) return;

    this.hexOrder = state.tileOrder;
    this.rebuildTiles(state, viewerId);
    this.rebuildWalls(state, viewerId);
    this.rebuildCollars(state, viewerId);
    this.rebuildOverlay(selection);
    this.rebuildMarkers(state, viewerId);
    this.rebuildArmies(state, viewerId);

    if (selection.hex && state.tiles[selection.hex]) {
      const tile = state.tiles[selection.hex];
      const { x, z } = hexToWorld(tile.q, tile.r);
      const height = TERRAINS[tile.terrain].height;
      this.selectionRing.position.set(x, height + 0.09, z);
      this.selectionRing.visible = true;
    } else {
      this.selectionRing.visible = false;
    }
  }

  private rebuildTiles(state: MatchState, viewerId: PlayerId): void {
    const viewer = state.players.find((p) => p.id === viewerId)!;
    const count = state.tileOrder.length;
    this.ensureCapacity('tiles', count);

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    state.tileOrder.forEach((id, index) => {
      const tile = state.tiles[id];
      const fog = viewer.fog[id] ?? 0;
      const terrain = TERRAINS[tile.terrain];
      const { x, z } = hexToWorld(tile.q, tile.r);

      // Unknown ground is a flat, cold slab: the shape of the map is legible,
      // its contents are not.
      const height = fog === 0 ? 0.1 : terrain.height;
      position.set(x, 0, z);
      scale.set(1, height, 1);
      matrix.compose(position, quaternion, scale);
      this.tiles.setMatrixAt(index, matrix);

      if (fog === 0) {
        // Unknown ground: a flat slate slab. Clearly a hex, clearly not read yet.
        color.setHex(PALETTE.fogHidden);
      } else if (tile.terrain === 'water') {
        color.copy(WATER_TINT);
        if (fog === 1) color.lerp(MEMORY_TINT, 0.45).multiplyScalar(0.8);
      } else {
        // Start from the zone's brown, then let terrain shade it.
        color.setHex(ZONES[tile.zone].color);
        const tint = TERRAIN_TINT[tile.terrain];
        if (tint) color.lerp(new THREE.Color(tint.color), tint.amount);
        if (tile.road) color.lerp(ROAD_TINT, 0.5);
        // Remembered but unseen: cooled and dimmed, still recognisable terrain.
        if (fog === 1) color.lerp(MEMORY_TINT, 0.45).multiplyScalar(0.8);
      }
      this.tiles.setColorAt(index, color);
    });

    this.tiles.count = count;
    this.tiles.instanceMatrix.needsUpdate = true;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    this.tiles.computeBoundingSphere();
  }

  /**
   * Draws a wall segment on every boundary between two regions, except where a
   * gate joins them: the gap in the wall IS the doorway, which is what makes
   * the map legible without reading a single label.
   */
  private rebuildWalls(state: MatchState, viewerId: PlayerId): void {
    const viewer = state.players.find((p) => p.id === viewerId)!;
    this.clearGroup(this.wallGroup);

    const geometry = new THREE.BoxGeometry(HEX_SIZE * 1.02, 0.8, 0.14);
    const materials = new Map<number, THREE.MeshLambertMaterial>();
    const seen = new Set<string>();

    for (const id of state.tileOrder) {
      const tile = state.tiles[id];
      // Only draw walls the player could plausibly know about.
      if ((viewer.fog[id] ?? 0) === 0) continue;

      for (const nId of neighborIds(tile.q, tile.r)) {
        const other = state.tiles[nId];
        if (!other || other.regionId === tile.regionId) continue;

        const key = id < nId ? `${id}|${nId}` : `${nId}|${id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // A gate joining these two regions leaves this stretch open.
        if (gateJoins(tile, other) || gateJoins(other, tile)) continue;

        const a = hexToWorld(tile.q, tile.r);
        const b = hexToWorld(other.q, other.r);
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const topA = TERRAINS[tile.terrain].height;
        const topB = TERRAINS[other.terrain].height;
        const top = Math.max(topA, topB);

        // The wall belongs to the inner of the two zones, so the colour steps
        // inward with the rings.
        const zone = Math.max(tile.zone, other.zone) as 1 | 2 | 3;
        const colorHex = ZONES[zone].wallColor;
        let material = materials.get(colorHex);
        if (!material) {
          material = new THREE.MeshLambertMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.06 });
          materials.set(colorHex, material);
        }

        const wall = new THREE.Mesh(geometry, material);
        wall.position.set(a.x + dx / 2, top + 0.36, a.z + dz / 2);
        // Turn the slab so its long axis runs along the shared hex edge.
        wall.rotation.y = Math.atan2(-dx, -dz);
        this.wallGroup.add(wall);
      }
    }
  }

  private rebuildCollars(state: MatchState, viewerId: PlayerId): void {
    const viewer = state.players.find((p) => p.id === viewerId)!;
    const owned = state.tileOrder.filter((id) => {
      const tile = state.tiles[id];
      return tile.controlledBy !== null && (viewer.fog[id] ?? 0) >= 1;
    });
    this.ensureCapacity('collars', Math.max(1, owned.length));

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);

    owned.forEach((id, index) => {
      const tile = state.tiles[id];
      const owner = state.players.find((p) => p.id === tile.controlledBy);
      const { x, z } = hexToWorld(tile.q, tile.r);
      position.set(x, TERRAINS[tile.terrain].height, z);
      matrix.compose(position, quaternion, scale);
      this.collars.setMatrixAt(index, matrix);
      color.setHex(owner?.color ?? 0x888888);
      this.collars.setColorAt(index, color);
    });

    this.collars.count = owned.length;
    this.collars.instanceMatrix.needsUpdate = true;
    if (this.collars.instanceColor) this.collars.instanceColor.needsUpdate = true;
  }

  private rebuildOverlay(selection: MapViewSelection): void {
    const entries: { hex: HexId; color: number }[] = [];
    for (const hex of selection.reachable) entries.push({ hex, color: PALETTE.reachable });
    for (const hex of selection.targets) entries.push({ hex, color: PALETTE.attack });
    this.ensureCapacity('overlay', Math.max(1, entries.length));

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);

    entries.forEach((entry, index) => {
      const [q, r] = entry.hex.split(',').map(Number);
      const { x, z } = hexToWorld(q, r);
      position.set(x, 1.0, z);
      matrix.compose(position, quaternion, scale);
      this.overlay.setMatrixAt(index, matrix);
      color.setHex(entry.color);
      this.overlay.setColorAt(index, color);
    });

    this.overlay.count = entries.length;
    this.overlay.instanceMatrix.needsUpdate = true;
    if (this.overlay.instanceColor) this.overlay.instanceColor.needsUpdate = true;
    this.overlay.visible = entries.length > 0;
  }

  /** Resource nodes, gates, facilities and finished structures. */
  private rebuildMarkers(state: MatchState, viewerId: PlayerId): void {
    const viewer = state.players.find((p) => p.id === viewerId)!;
    this.clearGroup(this.markerGroup);

    for (const id of state.tileOrder) {
      const tile = state.tiles[id];
      const fog = viewer.fog[id] ?? 0;
      if (fog === 0) continue;
      const { x, z } = hexToWorld(tile.q, tile.r);
      const top = TERRAINS[tile.terrain].height;

      if (tile.node && tile.node.remaining > 0 && !tile.buildingId) {
        const def = nodeDef(tile.node.nodeId);
        // Richness drives the size, so "very abundant" is visible from the air
        // rather than something you have to click each hex to discover.
        const richness = tile.node.richness;
        const radius = 0.15 + Math.min(0.14, richness * 0.09);
        const marker = new THREE.Mesh(
          new THREE.OctahedronGeometry(radius, 0),
          new THREE.MeshLambertMaterial({
            color: def.color,
            emissive: def.color,
            emissiveIntensity: richness >= 1.5 ? 0.6 : 0.25,
          }),
        );
        marker.position.set(x, top + 0.3, z);
        this.markerGroup.add(marker);
      }

      if (tile.buildingId) {
        const building = state.buildings[tile.buildingId];
        if (building) {
          const def = mapBuildingDef(building.buildingId);
          const owner = state.players.find((p) => p.id === building.owner);
          const height = 0.24 + building.level * 0.12;
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.46, height, 0.46),
            new THREE.MeshLambertMaterial({
              color: def.color,
              // A structure still under construction reads as a translucent shell.
              transparent: building.daysRemaining > 0,
              opacity: building.daysRemaining > 0 ? 0.45 : 1,
            }),
          );
          mesh.position.set(x, top + height / 2, z);
          this.markerGroup.add(mesh);

          const flag = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.06, 0.5),
            new THREE.MeshBasicMaterial({ color: owner?.color ?? 0x999999 }),
          );
          flag.position.set(x, top + height + 0.06, z);
          this.markerGroup.add(flag);
        }
      }

      const gate = tile.feature.gate;
      if (gate) {
        // Two posts and a lintel: an open gate loses its lintel, so open and
        // sealed read apart at a glance and not only by colour.
        const color = gate.open ? PALETTE.buildGhost : PALETTE.gate;
        const postGeometry = new THREE.BoxGeometry(0.1, 0.66, 0.1);
        const material = new THREE.MeshLambertMaterial({
          color,
          emissive: color,
          emissiveIntensity: gate.open ? 0.45 : 0.2,
        });
        for (const side of [-0.34, 0.34]) {
          const post = new THREE.Mesh(postGeometry, material);
          post.position.set(x + side, top + 0.33, z);
          this.markerGroup.add(post);
        }
        if (!gate.open) {
          const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.12, 0.12), material);
          lintel.position.set(x, top + 0.6, z);
          this.markerGroup.add(lintel);
        }
      }

      // Purple pylon: a garrisoned objective worth an item.
      const secondary = tile.feature.secondaryObjective;
      if (secondary) {
        const cleared = !!secondary.defeatedBy;
        const pylon = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.26, 0),
          new THREE.MeshLambertMaterial({
            color: 0x9a5fd0,
            emissive: 0x9a5fd0,
            emissiveIntensity: cleared ? 0.05 : 0.6,
            transparent: cleared,
            opacity: cleared ? 0.35 : 1,
          }),
        );
        pylon.position.set(x, top + 0.42, z);
        this.markerGroup.add(pylon);
      }

      if (tile.feature.facility) {
        const isMain = !!tile.feature.mainObjective;
        const active = tile.feature.facility.state === 'active';
        const color = isMain ? PALETTE.gate : PALETTE.facility;
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.2, isMain ? 1.0 : 0.62, 6),
          new THREE.MeshLambertMaterial({
            color,
            emissive: color,
            emissiveIntensity: active ? 0.7 : 0.18,
          }),
        );
        pillar.position.set(x, top + (isMain ? 0.5 : 0.31), z);
        this.markerGroup.add(pillar);

        // The core carries a crown so the prize is unmistakable from any zoom.
        if (isMain) {
          const crown = new THREE.Mesh(
            new THREE.TorusGeometry(0.3, 0.06, 6, 5),
            new THREE.MeshLambertMaterial({
              color: PALETTE.gate,
              emissive: PALETTE.gate,
              emissiveIntensity: 0.8,
            }),
          );
          crown.rotation.x = Math.PI / 2;
          crown.position.set(x, top + 1.06, z);
          this.markerGroup.add(crown);
        }
      }

      // A player's capital is their city: it gets a real silhouette, because
      // it is where they recruit and deploy from all match long.
      if (tile.feature.startFor) {
        const owner = state.players.find((p) => p.id === tile.feature.startFor);
        const cityColor = owner?.color ?? 0xffffff;
        const blockMaterial = new THREE.MeshLambertMaterial({ color: 0xbdb2a1 });
        // Offset towards the back of the hex: an army standing in the city
        // otherwise sits inside the buildings and neither reads.
        const cx = x;
        const cz = z - 0.2;
        const towers: [number, number, number][] = [
          [0, 0.72, 0],
          [-0.3, 0.46, 0.16],
          [0.28, 0.52, -0.14],
          [0.16, 0.34, 0.24],
          [-0.18, 0.38, -0.24],
        ];
        for (const [ox, height, oz] of towers) {
          const block = new THREE.Mesh(new THREE.BoxGeometry(0.26, height, 0.26), blockMaterial);
          block.position.set(cx + ox, top + height / 2, cz + oz);
          this.markerGroup.add(block);
        }
        // Owner-coloured banner over the keep.
        const banner = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 0.1, 0.38),
          new THREE.MeshBasicMaterial({ color: cityColor }),
        );
        banner.position.set(cx, top + 0.78, cz);
        this.markerGroup.add(banner);
        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 0.3, 5),
          new THREE.MeshBasicMaterial({ color: cityColor }),
        );
        mast.position.set(cx, top + 0.95, cz);
        this.markerGroup.add(mast);
      }

      if (tile.feature.cache && !tile.feature.cache.taken) {
        const crate = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.2, 0.2),
          new THREE.MeshLambertMaterial({ color: PALETTE.cache }),
        );
        crate.position.set(x, top + 0.16, z);
        crate.rotation.y = Math.PI / 5;
        this.markerGroup.add(crate);
      }
    }
  }

  private rebuildArmies(state: MatchState, viewerId: PlayerId): void {
    const viewer = state.players.find((p) => p.id === viewerId)!;
    this.clearGroup(this.armyGroup, false);

    // More than one formation on a hex needs spreading, or they occupy the same
    // point and the stack reads as a single unit.
    const perHex = new Map<string, number>();
    for (const army of Object.values(state.armies)) {
      perHex.set(army.hex, (perHex.get(army.hex) ?? 0) + 1);
    }
    const placed = new Map<string, number>();

    for (const army of Object.values(state.armies)) {
      // Enemy formations are only drawn where the viewer currently has eyes.
      const visible = army.owner === viewerId || (viewer.fog[army.hex] ?? 0) === 2;
      if (!visible) continue;
      const tile = state.tiles[army.hex];
      if (!tile) continue;
      const owner = state.players.find((p) => p.id === army.owner);
      const { x, z } = hexToWorld(tile.q, tile.r);
      const top = TERRAINS[tile.terrain].height;
      const size = Object.values(army.composition).reduce((a, b) => a + b, 0);
      if (size <= 0) continue;

      const role = dominantRole(army.composition, (troopId) => troopDef(troopId).role);
      const scale = THREE.MathUtils.clamp(0.62 + Math.log10(Math.max(1, size)) * 0.34, 0.62, 1.35);
      const model = this.units.build({
        role,
        color: owner?.color ?? 0xffffff,
        scale,
      });

      // Fan multiple stacks around the hex centre.
      const count = perHex.get(army.hex) ?? 1;
      const index = placed.get(army.hex) ?? 0;
      placed.set(army.hex, index + 1);
      // A city occupies the back of its hex, so troops garrisoned there muster
      // in front of it instead of disappearing inside the buildings.
      const cityOffset = tile.feature.startFor ? 0.34 : 0;
      if (count > 1) {
        const angle = (index / count) * Math.PI * 2;
        model.position.set(x + Math.cos(angle) * 0.3, top, z + cityOffset + Math.sin(angle) * 0.3);
      } else {
        model.position.set(x, top, z + cityOffset);
      }
      // Face roughly towards the map centre: armies read as heading inward.
      model.rotation.y = Math.atan2(-x, -z);
      this.armyGroup.add(model);
    }
  }

  /**
   * Empties a group. Unit models share geometry and materials owned by the
   * factory, so those are skipped here and freed once on dispose.
   */
  private clearGroup(group: THREE.Group, disposeResources = true): void {
    for (const child of [...group.children]) {
      group.remove(child);
      if (!disposeResources) continue;
      child.traverse((node) => {
        const mesh = node as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
    }
  }

  /** InstancedMesh capacity is fixed at construction, so grow by replacing. */
  private ensureCapacity(which: 'tiles' | 'collars' | 'overlay', needed: number): void {
    const mesh = which === 'tiles' ? this.tiles : which === 'collars' ? this.collars : this.overlay;
    if (mesh.instanceMatrix.count >= needed && mesh.instanceColor) return;
    const replacement = new THREE.InstancedMesh(mesh.geometry, mesh.material, needed);
    replacement.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    replacement.setColorAt(0, new THREE.Color(0xffffff));
    this.kit.scene.remove(mesh);
    this.kit.scene.add(replacement);
    if (which === 'tiles') this.tiles = replacement;
    else if (which === 'collars') this.collars = replacement;
    else this.overlay = replacement;
    mesh.dispose();
  }

  /**
   * Centres the camera on a hex without changing zoom.
   *
   * On a wide screen the HUD rails float over the canvas, so a hex centred in
   * the viewport is not centred in the part of it the player can actually see.
   * Nudging the look-at point to the right slides the map out from under the
   * context panel; on narrow screens the rails stack instead and no nudge is
   * wanted.
   */
  focus(state: MatchState, hex: HexId): void {
    const tile = state.tiles[hex];
    if (!tile) return;
    const { x, z } = hexToWorld(tile.q, tile.r);
    const width = this.kit.renderer.domElement.clientWidth;
    const railCompensation = width > 1080 ? 2.6 : 0;
    const targetX = x + railCompensation;
    const offsetX = this.kit.camera.position.x - this.kit.controls.target.x;
    const offsetZ = this.kit.camera.position.z - this.kit.controls.target.z;
    this.kit.controls.target.set(targetX, 0, z);
    this.kit.camera.position.set(targetX + offsetX, this.kit.camera.position.y, z + offsetZ);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.detachTap();
    this.clearGroup(this.markerGroup);
    this.clearGroup(this.wallGroup);
    this.clearGroup(this.armyGroup, false);
    this.units.dispose();
    for (const item of this.disposables) item.dispose();
    this.tiles.dispose();
    this.collars.dispose();
    this.overlay.dispose();
    this.kit.dispose();
  }
}
