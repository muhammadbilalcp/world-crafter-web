import { createFileRoute } from "@tanstack/react-router";
import Game from "@/game/Game";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "VoxelCraft — 3D Block Building Game" },
      { name: "description", content: "Browser-based 3D voxel building game. Play on desktop, iPad, or phone. Place blocks, break blocks, explore." },
    ],
  }),
});

function Index() {
  return <Game />;
}
