import { World } from "./world";

export interface RaycastHit {
  x: number; y: number; z: number;     // hit block coords
  nx: number; ny: number; nz: number;  // normal (face direction)
}

// Amanatides & Woo voxel traversal
export function raycastVoxel(
  world: World,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxDist = 6,
): RaycastHit | null {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = Math.abs(1 / dx);
  const tDeltaY = Math.abs(1 / dy);
  const tDeltaZ = Math.abs(1 / dz);
  const nextX = x + (dx > 0 ? 1 : 0);
  const nextY = y + (dy > 0 ? 1 : 0);
  const nextZ = z + (dz > 0 ? 1 : 0);
  let tMaxX = dx !== 0 ? (nextX - ox) / dx : Infinity;
  let tMaxY = dy !== 0 ? (nextY - oy) / dy : Infinity;
  let tMaxZ = dz !== 0 ? (nextZ - oz) / dz : Infinity;
  let face: [number, number, number] = [0, 0, 0];
  let t = 0;
  while (t <= maxDist) {
    if (world.get(x, y, z) !== 0) {
      return { x, y, z, nx: face[0], ny: face[1], nz: face[2] };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX; face = [-stepX, 0, 0];
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY; face = [0, -stepY, 0];
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ];
    }
  }
  return null;
}