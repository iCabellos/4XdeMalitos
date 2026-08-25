import * as THREE from 'three';
import { createSceneKit, createTapDetector, type SceneKit } from './sceneKit';
import { PALETTE } from './palette';
import { hexToWorld, HEX_SIZE, type HexId } from '../map/hex';
import { TERRAINS, nodeDef } from '../data/terrain';
import { mapBuildingDef } from '../data/buildings.map';
import type { MatchState, PlayerId } from '../core/types';

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

/** Reused so the per-tile loop never allocates a Color per hex. */
const ROAD_TINT = new THREE.Color(0x6b6156);
const MEMORY_TINT = new THREE.Color(0x39434f);

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
      } else {
        color.setHex(terrain.color);
        if (tile.road) color.lerp(ROAD_TINT, 0.45);
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
        const marker = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.2, 0),
          new THREE.MeshLambertMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.25 }),
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

      if (tile.feature.gate) {
        const gate = new THREE.Mesh(
          new THREE.TorusGeometry(0.34, 0.07, 6, 12),
          new THREE.MeshBasicMaterial({ color: PALETTE.gate }),
        );
        gate.rotation.x = Math.PI / 2;
        gate.position.set(x, top + 0.36, z);
        this.markerGroup.add(gate);
      }

      if (tile.feature.facility) {
        const isMain = !!tile.feature.mainObjective;
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.2, isMain ? 1.0 : 0.62, 6),
          new THREE.MeshLambertMaterial({
            color: isMain ? PALETTE.objective : PALETTE.facility,
            emissive: isMain ? PALETTE.objective : PALETTE.facility,
            emissiveIntensity: tile.feature.facility.state === 'active' ? 0.7 : 0.18,
          }),
        );
        pillar.position.set(x, top + (isMain ? 0.5 : 0.31), z);
        this.markerGroup.add(pillar);
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
    this.clearGroup(this.armyGroup);

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
      const scale = THREE.MathUtils.clamp(0.5 + Math.log10(Math.max(1, size)) * 0.42, 0.5, 1.25);

      const body = new THREE.Mesh(
        new THREE.ConeGeometry(0.2 * scale, 0.5 * scale, 5),
        new THREE.MeshLambertMaterial({ color: owner?.color ?? 0xffffff }),
      );
      body.position.set(x, top + 0.28 * scale + 0.16, z);
      body.rotation.y = Math.PI / 5;
      this.armyGroup.add(body);

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26 * scale, 0.26 * scale, 0.07, 12),
        new THREE.MeshBasicMaterial({ color: owner?.color ?? 0xffffff }),
      );
      base.position.set(x, top + 0.06, z);
      this.armyGroup.add(base);
    }
  }

  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
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

  /** Centres the camera on a hex without changing zoom. */
  focus(state: MatchState, hex: HexId): void {
    const tile = state.tiles[hex];
    if (!tile) return;
    const { x, z } = hexToWorld(tile.q, tile.r);
    const offsetX = this.kit.camera.position.x - this.kit.controls.target.x;
    const offsetZ = this.kit.camera.position.z - this.kit.controls.target.z;
    this.kit.controls.target.set(x, 0, z);
    this.kit.camera.position.set(x + offsetX, this.kit.camera.position.y, z + offsetZ);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.detachTap();
    this.clearGroup(this.markerGroup);
    this.clearGroup(this.armyGroup);
    for (const item of this.disposables) item.dispose();
    this.tiles.dispose();
    this.collars.dispose();
    this.overlay.dispose();
    this.kit.dispose();
  }
}
