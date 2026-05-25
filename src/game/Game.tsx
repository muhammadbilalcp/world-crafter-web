import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { World, buildMesh, BlockType, BLOCK_NAMES, BLOCK_COLORS, WORLD_SIZE, WORLD_HEIGHT } from "./world";
import { raycastVoxel } from "./raycast";

const HOTBAR: BlockType[] = [1, 2, 3, 4, 5, 6];
const SAVE_KEY = "voxelcraft-save-v1";

interface SaveData {
  world: number[]; // base64-like compressed not needed; small enough
  px: number; py: number; pz: number;
  yaw: number; pitch: number;
  selected: number;
}

export default function Game() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(0);
  const selectedRef = useRef(0);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [showMenu, setShowMenu] = useState(true);
  const [isMobile] = useState(() =>
    typeof window !== "undefined" &&
    (window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window)
  );

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ===== Scene =====
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 30, 80);

    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 200);

    const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(50, 80, 30);
    scene.add(sun);

    // World
    const world = new World();
    let player = { x: WORLD_SIZE / 2, y: WORLD_HEIGHT - 2, z: WORLD_SIZE / 2 };
    let yaw = 0, pitch = 0;
    const velocity = new THREE.Vector3(0, 0, 0);
    let onGround = false;

    // Load save or generate
    const saved = (() => {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as SaveData;
      } catch { return null; }
    })();
    if (saved && saved.world.length === world.data.length) {
      world.data.set(saved.world);
      player = { x: saved.px, y: saved.py, z: saved.pz };
      yaw = saved.yaw; pitch = saved.pitch;
      setSelected(saved.selected);
      selectedRef.current = saved.selected;
    } else {
      world.generate();
      // Drop player on terrain top
      let topY = WORLD_HEIGHT - 1;
      while (topY > 0 && world.get(Math.floor(player.x), topY, Math.floor(player.z)) === 0) topY--;
      player.y = topY + 2;
    }

    let worldMesh = buildMesh(world);
    scene.add(worldMesh);
    const rebuildWorld = () => {
      scene.remove(worldMesh);
      worldMesh.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
        else if (mat) mat.dispose();
      });
      worldMesh = buildMesh(world);
      scene.add(worldMesh);
    };

    // Highlight (selected block outline)
    const highlightGeo = new THREE.BoxGeometry(1.01, 1.01, 1.01);
    const highlightMat = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true });
    const highlight = new THREE.Mesh(highlightGeo, highlightMat);
    highlight.visible = false;
    scene.add(highlight);

    // ===== Input =====
    const keys = new Set<string>();
    const touch = { mx: 0, mz: 0, jump: false, lookDx: 0, lookDy: 0 };
    let wantBreak = false, wantPlace = false;

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code.startsWith("Digit")) {
        const n = parseInt(e.code.slice(5), 10) - 1;
        if (n >= 0 && n < HOTBAR.length) setSelected(n);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Mouse look (desktop pointer lock)
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      yaw -= e.movementX * 0.0025;
      pitch -= e.movementY * 0.0025;
      pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
    };
    window.addEventListener("mousemove", onMouseMove);

    const onPointerLockChange = () => {
      setIsPointerLocked(document.pointerLockElement === renderer.domElement);
    };
    document.addEventListener("pointerlockchange", onPointerLockChange);

    const onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      if (e.button === 0) wantBreak = true;
      if (e.button === 2) wantPlace = true;
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    renderer.domElement.addEventListener("contextmenu", onContextMenu);

    // ===== Touch controls =====
    let lookTouchId: number | null = null;
    let lookLast = { x: 0, y: 0 };
    let moveTouchId: number | null = null;
    let moveStart = { x: 0, y: 0 };

    const onTouchStart = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
        if (el && el.dataset.uictl) continue; // ignore touches on UI controls
        if (t.clientX < window.innerWidth / 2 && moveTouchId === null) {
          moveTouchId = t.identifier;
          moveStart = { x: t.clientX, y: t.clientY };
        } else if (t.clientX >= window.innerWidth / 2 && lookTouchId === null) {
          lookTouchId = t.identifier;
          lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === moveTouchId) {
          const dx = t.clientX - moveStart.x;
          const dy = t.clientY - moveStart.y;
          const max = 60;
          touch.mx = Math.max(-1, Math.min(1, dx / max));
          touch.mz = Math.max(-1, Math.min(1, dy / max));
        } else if (t.identifier === lookTouchId) {
          touch.lookDx += (t.clientX - lookLast.x) * 0.005;
          touch.lookDy += (t.clientY - lookLast.y) * 0.005;
          lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === moveTouchId) {
          moveTouchId = null;
          touch.mx = 0; touch.mz = 0;
        } else if (t.identifier === lookTouchId) {
          lookTouchId = null;
        }
      }
    };
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
    renderer.domElement.addEventListener("touchmove", onTouchMove, { passive: true });
    renderer.domElement.addEventListener("touchend", onTouchEnd);
    renderer.domElement.addEventListener("touchcancel", onTouchEnd);

    // Expose for UI buttons
    (window as unknown as { __game: object }).__game = {
      jump: () => { touch.jump = true; },
      break: () => { wantBreak = true; },
      place: () => { wantPlace = true; },
    };

    // ===== Save =====
    const save = () => {
      const data: SaveData = {
        world: Array.from(world.data),
        px: player.x, py: player.y, pz: player.z,
        yaw, pitch,
        selected: selectedRef.current,
      };
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* quota */ }
    };
    const saveInterval = window.setInterval(save, 10000);
    window.addEventListener("beforeunload", save);

    // ===== Player physics & game loop =====
    const PLAYER_W = 0.6, PLAYER_H = 1.7, EYE = 1.6;
    const collide = (px: number, py: number, pz: number) => {
      const minX = Math.floor(px - PLAYER_W / 2);
      const maxX = Math.floor(px + PLAYER_W / 2);
      const minY = Math.floor(py);
      const maxY = Math.floor(py + PLAYER_H);
      const minZ = Math.floor(pz - PLAYER_W / 2);
      const maxZ = Math.floor(pz + PLAYER_W / 2);
      for (let x = minX; x <= maxX; x++)
        for (let y = minY; y <= maxY; y++)
          for (let z = minZ; z <= maxZ; z++)
            if (world.get(x, y, z) !== 0) return true;
      return false;
    };

    let last = performance.now();
    let actionCooldown = 0;
    let raf = 0;
    const tmpDir = new THREE.Vector3();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Apply touch look
      if (touch.lookDx || touch.lookDy) {
        yaw -= touch.lookDx;
        pitch -= touch.lookDy;
        pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
        touch.lookDx = 0; touch.lookDy = 0;
      }

      // Movement input
      let fwd = 0, str = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) fwd += 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) fwd -= 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) str -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) str += 1;
      fwd -= touch.mz;
      str += touch.mx;
      const len = Math.hypot(fwd, str);
      if (len > 1) { fwd /= len; str /= len; }

      const speed = (keys.has("ShiftLeft") || keys.has("ShiftRight")) ? 8 : 4.5;
      const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
      const wx = (-sinY) * fwd + cosY * str;
      const wz = (-cosY) * fwd + (-sinY) * str;
      velocity.x = wx * speed;
      velocity.z = wz * speed;

      // Gravity & jump
      velocity.y -= 22 * dt;
      if ((keys.has("Space") || touch.jump) && onGround) {
        velocity.y = 8;
        onGround = false;
      }
      touch.jump = false;

      // Integrate with collision (per axis)
      let nx = player.x + velocity.x * dt;
      if (collide(nx, player.y, player.z)) { velocity.x = 0; nx = player.x; }
      player.x = nx;

      let nz = player.z + velocity.z * dt;
      if (collide(player.x, player.y, nz)) { velocity.z = 0; nz = player.z; }
      player.z = nz;

      let ny = player.y + velocity.y * dt;
      if (collide(player.x, ny, player.z)) {
        if (velocity.y < 0) onGround = true;
        velocity.y = 0;
        ny = player.y;
      } else {
        onGround = false;
      }
      player.y = ny;

      // Don't fall through world
      if (player.y < -10) {
        player.y = WORLD_HEIGHT;
        velocity.set(0, 0, 0);
      }

      // Camera
      camera.position.set(player.x, player.y + EYE, player.z);
      camera.rotation.order = "YXZ";
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;

      // Raycast for highlight & actions
      tmpDir.set(0, 0, -1).applyEuler(camera.rotation);
      const hit = raycastVoxel(
        world,
        camera.position.x, camera.position.y, camera.position.z,
        tmpDir.x, tmpDir.y, tmpDir.z,
        6
      );
      if (hit) {
        highlight.visible = true;
        highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      } else {
        highlight.visible = false;
      }

      actionCooldown -= dt;
      if (actionCooldown <= 0 && hit) {
        if (wantBreak) {
          world.set(hit.x, hit.y, hit.z, 0);
          rebuildWorld();
          actionCooldown = 0.15;
        } else if (wantPlace) {
          const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
          // don't place inside player
          const blocksPlayer =
            px === Math.floor(player.x) && pz === Math.floor(player.z) &&
            (py === Math.floor(player.y) || py === Math.floor(player.y + 1));
          if (!blocksPlayer && world.get(px, py, pz) === 0) {
            world.set(px, py, pz, HOTBAR[selectedRef.current]);
            rebuildWorld();
          }
          actionCooldown = 0.2;
        }
      }
      wantBreak = false; wantPlace = false;

      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(saveInterval);
      save();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [isMobile]);

  const requestLock = () => {
    setShowMenu(false);
    const canvas = mountRef.current?.querySelector("canvas");
    if (canvas && !isMobile) {
      (canvas as HTMLCanvasElement).requestPointerLock?.();
    }
  };

  const resetWorld = () => {
    localStorage.removeItem(SAVE_KEY);
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 bg-background">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="crosshair" />

      {/* Hotbar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex gap-1 p-1 rounded-md bg-black/40 backdrop-blur-sm">
        {HOTBAR.map((b, i) => (
          <button
            key={i}
            data-uictl="1"
            onClick={() => setSelected(i)}
            className={`w-12 h-12 sm:w-14 sm:h-14 rounded flex flex-col items-center justify-center text-[10px] font-medium text-white border-2 ${selected === i ? "border-white" : "border-white/20"}`}
            style={{ backgroundColor: `#${BLOCK_COLORS[b].toString(16).padStart(6, "0")}` }}
          >
            <span className="opacity-90">{BLOCK_NAMES[b]}</span>
            <span className="opacity-60">{i + 1}</span>
          </button>
        ))}
      </div>

      {/* Mobile controls */}
      {isMobile && !showMenu && (
        <>
          <button
            data-uictl="1"
            onTouchStart={() => (window as unknown as { __game: { jump: () => void } }).__game.jump()}
            className="fixed bottom-24 right-6 z-30 w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/40 text-white text-sm font-semibold"
          >
            JUMP
          </button>
          <button
            data-uictl="1"
            onTouchStart={() => (window as unknown as { __game: { break: () => void } }).__game.break()}
            className="fixed bottom-48 right-6 z-30 w-16 h-16 rounded-full bg-red-500/60 backdrop-blur-sm border-2 border-white/40 text-white text-xs font-semibold"
          >
            BREAK
          </button>
          <button
            data-uictl="1"
            onTouchStart={() => (window as unknown as { __game: { place: () => void } }).__game.place()}
            className="fixed bottom-48 right-24 z-30 w-16 h-16 rounded-full bg-green-500/60 backdrop-blur-sm border-2 border-white/40 text-white text-xs font-semibold"
          >
            PLACE
          </button>
        </>
      )}

      {/* Top bar */}
      {!showMenu && (
        <div className="fixed top-3 left-3 z-30 flex gap-2">
          <button
            data-uictl="1"
            onClick={() => setShowMenu(true)}
            className="px-3 py-1.5 rounded bg-black/50 text-white text-xs backdrop-blur-sm"
          >
            Menu
          </button>
        </div>
      )}

      {!isMobile && !isPointerLocked && !showMenu && (
        <div className="fixed inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="px-4 py-2 rounded bg-black/60 text-white text-sm">Click to play</div>
        </div>
      )}

      {/* Menu */}
      {showMenu && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-[90%] max-w-md rounded-xl bg-card text-card-foreground p-6 shadow-2xl border border-border">
            <h1 className="text-3xl font-bold mb-2">VoxelCraft</h1>
            <p className="text-sm text-muted-foreground mb-4">
              A tiny browser block-building world. Your progress auto-saves.
            </p>
            <div className="text-xs text-muted-foreground space-y-1 mb-5">
              {isMobile ? (
                <>
                  <div><b>Left side</b> of screen: drag to move</div>
                  <div><b>Right side</b>: drag to look</div>
                  <div><b>Buttons</b>: jump / break / place</div>
                  <div><b>Hotbar</b>: tap a block to select</div>
                </>
              ) : (
                <>
                  <div><b>WASD</b> move · <b>Space</b> jump · <b>Shift</b> sprint</div>
                  <div><b>Mouse</b> look · <b>Left click</b> break · <b>Right click</b> place</div>
                  <div><b>1–6</b> select block</div>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={requestLock}
                className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90"
              >
                Play
              </button>
              <button
                onClick={resetWorld}
                className="px-4 py-2 rounded-md border border-border text-foreground text-sm hover:bg-accent"
              >
                New world
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-4">
              Multiplayer is not available in this single-player build.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}