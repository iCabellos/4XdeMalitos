import * as THREE from 'three';
import { createSceneKit, createTapDetector, type SceneKit } from './sceneKit';
import { CITY_BUILDINGS, CITY_BUILDING_IDS } from '../data/buildings.city';
import type { CityState } from '../entities/city';

/**
 * The persistent city as its own 3D scene. Placeholder geometry on purpose:
 * the point is to read levels and branches at a glance, not to look finished.
 */
export class CityRenderer {
  private kit: SceneKit;
  private plots = new THREE.Group();
  private highlight: THREE.Mesh;
  private buildingByMesh = new Map<THREE.Object3D, string>();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private frame = 0;
  private running = true;
  private detachTap: () => void;

  constructor(
    container: HTMLElement,
    private onPickBuilding: (id: string | null) => void,
  ) {
    this.kit = createSceneKit({
      container,
      minDistance: 6,
      maxDistance: 26,
      panLimit: 8,
      initialDistance: 14,
    });

    const ground = new THREE.Mesh(
      new THREE.CylinderGeometry(7.4, 7.6, 0.5, 8),
      new THREE.MeshLambertMaterial({ color: 0x39424f }),
    );
    ground.position.y = -0.25;
    this.kit.scene.add(ground);

    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(7.0, 7.0, 0.06, 8),
      new THREE.MeshLambertMaterial({ color: 0x4a5563 }),
    );
    pad.position.y = 0.02;
    this.kit.scene.add(pad);

    this.kit.scene.add(this.plots);

    const ringGeometry = new THREE.TorusGeometry(0.95, 0.06, 8, 24);
    ringGeometry.rotateX(Math.PI / 2);
    this.highlight = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    this.highlight.visible = false;
    this.kit.scene.add(this.highlight);

    this.detachTap = createTapDetector(this.kit.renderer.domElement, (x, y) => this.pick(x, y));
    this.loop();
  }

  private loop = () => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.loop);
    if (this.highlight.visible) {
      this.highlight.rotation.y += 0.01;
    }
    this.kit.render();
  };

  private pick(clientX: number, clientY: number): void {
    this.kit.toNdc(clientX, clientY, this.pointer);
    this.raycaster.setFromCamera(this.pointer, this.kit.camera);
    const hits = this.raycaster.intersectObjects(this.plots.children, true);
    for (const hit of hits) {
      let node: THREE.Object3D | null = hit.object;
      while (node) {
        const id = this.buildingByMesh.get(node);
        if (id) {
          this.onPickBuilding(id);
          return;
        }
        node = node.parent;
      }
    }
    this.onPickBuilding(null);
  }

  update(city: CityState, selectedId: string | null): void {
    this.clear();

    for (const id of CITY_BUILDING_IDS) {
      const def = CITY_BUILDINGS[id];
      const level = city.buildings[id] ?? 0;
      const group = new THREE.Group();
      group.position.set(def.plot.x, 0, def.plot.z);

      // An unbuilt plot is a marked foundation, not an empty gap.
      const foundation = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.9, 0.12, 8),
        new THREE.MeshLambertMaterial({ color: level > 0 ? 0x5b6674 : 0x3d4650 }),
      );
      foundation.position.y = 0.09;
      group.add(foundation);

      if (level > 0) {
        const height = 0.5 + level * 0.42;
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(1.05, height, 1.05),
          new THREE.MeshLambertMaterial({ color: def.color }),
        );
        body.position.y = 0.15 + height / 2;
        group.add(body);

        // One stripe per level: the city's progress is countable from the sky.
        for (let i = 0; i < level; i++) {
          const stripe = new THREE.Mesh(
            new THREE.BoxGeometry(1.12, 0.05, 1.12),
            new THREE.MeshBasicMaterial({ color: 0xf0f4f8 }),
          );
          stripe.position.y = 0.36 + i * 0.4;
          group.add(stripe);
        }

        const roof = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.34, 0.28, 6),
          new THREE.MeshLambertMaterial({ color: 0xd7dee6 }),
        );
        roof.position.y = 0.15 + height + 0.14;
        group.add(roof);
      }

      this.buildingByMesh.set(group, id);
      for (const child of group.children) this.buildingByMesh.set(child, id);
      this.plots.add(group);

      if (selectedId === id) {
        this.highlight.position.set(def.plot.x, 0.2, def.plot.z);
        this.highlight.visible = true;
      }
    }

    if (!selectedId) this.highlight.visible = false;
  }

  private clear(): void {
    this.buildingByMesh.clear();
    for (const child of [...this.plots.children]) {
      this.plots.remove(child);
      child.traverse((node) => {
        const mesh = node as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
    }
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.detachTap();
    this.clear();
    this.highlight.geometry.dispose();
    (this.highlight.material as THREE.Material).dispose();
    this.kit.dispose();
  }
}
