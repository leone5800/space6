// ============================================================
// SPACE INVADERS NEON — PÁGINA RAIZ (Server Component)
// ============================================================
// No Next.js 16 App Router, "ssr: false" com next/dynamic só
// pode ser usado dentro de Client Components ("use client").
// Por isso importamos GameClientWrapper — um Client Component
// que contém o dynamic import — e usamos ele aqui na página.
// ============================================================

import GameClientWrapper from "@/components/GameClientWrapper";

// Página raiz — Server Component (sem "use client").
// Delega a renderização do jogo para o wrapper client-side.
export default function HomePage() {
  return (
    <main className="min-h-screen w-full" style={{ background: "#020209" }}>
      {/* GameClientWrapper faz o dynamic import com ssr:false */}
      <GameClientWrapper />
    </main>
  );
}
