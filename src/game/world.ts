import * as THREE from "three";
import { terrainHeight } from "./noise";

export type BlockType = 0 | 1 | 2 | 3 | 4 | 5 | 6;
// 0 = air, 1 grass, 2 dirt, 3 stone, 4 wood, 5 leaves, 6 sand

export const BLOCK_NAMES: Record<number, string> = {
  1: "Grass",
  2: "Dirt",
  3: "Stone",
  4: "Wood",
  5: "Leaves",
  6: "Sand",
};

export const BLOCK_COLORS: Record<number, number> = {
  1: 0x4caf50,
  2: 0x8b5a2b,
  3: 0x888888,
  4: 0x6b4423,
  5: 0x2e7d32,
  6: 0xe6d27a,
};

export const WORLD_SIZE = 48; // X/Z
export const WORLD_HEIGHT = 24;

export class World {
  data: Uint8Array;
  constructor() {
    this.data = new Uint8Array(WORLD_SIZE * WORLD_HEIGHT * WORLD_SIZE);
  }
  idx(x: number, y: number, z: number) {
    return (y * WORLD_SIZE + z) * WORLD_SIZE + x;
  }
  inBounds(x: number, y: number, z: number) {
    return x >= 0 && x < WORLD_SIZE && y >= 0 && y < WORLD_HEIGHT && z >= 0 && z < WORLD_SIZE;
  }
  get(x: number, y: number, z: number): BlockType {
    if (!this.inBounds(x, y, z)) return 0;
    return this.data[this.idx(x, y, z)] as BlockType;
  }
  set(x: number, y: number, z: number, b: BlockType) {
    if (!this.inBounds(x, y, z)) return;
    this.data[this.idx(x, y, z)] = b;
  }
  generate() {
    for (let x = 0; x < WORLD_SIZE; x++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        const h = Math.min(WORLD_HEIGHT - 4, terrainHeight(x, z));
        for (let y = 0; y < h; y++) {
          let b: BlockType = 3;
          if (y === h - 1) b = h <= 5 ? 6 : 1;
          else if (y > h - 4) b = 2;
          this.set(x, y, z, b);
        }
        // occasional tree
        if (h > 5 && Math.random() < 0.015) {
          const trunk = h, th = 3 + Math.floor(Math.random() * 2);
          for (let y = trunk; y < trunk + th; y++) this.set(x, y, z, 4);
          for (let dx = -2; dx <= 2; dx++)
            for (let dz = -2; dz <= 2; dz++)
              for (let dy = 0; dy < 3; dy++) {
                const lx = x + dx, lz = z + dz, ly = trunk + th - 1 + dy;
                if (Math.abs(dx) + Math.abs(dz) + dy < 4 && this.get(lx, ly, lz) === 0)
                  this.set(lx, ly, lz, 5);
              }
        }
      }
    }
  }
  isSolid(x: number, y: number, z: number) {
    return this.get(Math.floor(x), Math.floor(y), Math.floor(z)) !== 0;
  }
}

export function buildMesh(world: World): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  // Per block type, collect instance positions
  const byType: Record<number, THREE.Matrix4[]> = {};
  const m = new THREE.Matrix4();
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        const b = world.get(x, y, z);
        if (b === 0) continue;
        // skip fully enclosed blocks (optimization)
        if (
          world.get(x + 1, y, z) && world.get(x - 1, y, z) &&
          world.get(x, y + 1, z) && world.get(x, y - 1, z) &&
          world.get(x, y, z + 1) && world.get(x, y, z - 1)
        ) continue;
        m.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
        (byType[b] ||= []).push(m.clone());
      }
    }
  }
  for (const key of Object.keys(byType)) {
    const b = Number(key);
    const mats = byType[b];
    const mat = new THREE.MeshLambertMaterial({ color: BLOCK_COLORS[b] });
    const inst = new THREE.InstancedMesh(geo, mat, mats.length);
    inst.userData.blockType = b;
    for (let i = 0; i < mats.length; i++) inst.setMatrixAt(i, mats[i]);
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }
  return group;
}