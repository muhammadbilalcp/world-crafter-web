// Tiny seeded value noise for terrain heightmap
function hash(x: number, z: number, seed: number) {
  let h = x * 374761393 + z * 668265263 + seed * 1442695040888963407;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, z: number, seed: number) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const v00 = hash(xi, zi, seed);
  const v10 = hash(xi + 1, zi, seed);
  const v01 = hash(xi, zi + 1, seed);
  const v11 = hash(xi + 1, zi + 1, seed);
  const u = smooth(xf), v = smooth(zf);
  return v00 * (1 - u) * (1 - v) + v10 * u * (1 - v) + v01 * (1 - u) * v + v11 * u * v;
}

export function terrainHeight(x: number, z: number, seed = 1337): number {
  let amp = 1, freq = 0.05, sum = 0, norm = 0;
  for (let o = 0; o < 4; o++) {
    sum += valueNoise(x * freq, z * freq, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  const n = sum / norm;
  return Math.floor(4 + n * 10);
}