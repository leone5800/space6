"use client";
// ============================================================
// GAME CLIENT WRAPPER
// ============================================================
// Este é um Client Component que usa next/dynamic com ssr:false.
// No Next.js 16 (App Router), "ssr: false" só é permitido dentro
// de Client Components ("use client"). Por isso este wrapper existe:
// ele recebe o componente do jogo (que usa canvas + window) e
// garante que ele nunca seja executado no servidor.
// ============================================================

import dynamic from "next/dynamic";

// Importação dinâmica do jogo com SSR desativado.
// O canvas HTML5, requestAnimationFrame e addEventListener
// só existem no browser — sem SSR, evitamos erros de hidratação.
const SpaceInvadersGame = dynamic(
  () => import("@/components/SpaceInvadersGame"),
  {
    ssr: false,
    // Tela exibida enquanto o bundle do jogo é baixado pelo cliente
    loading: () => (
      <div
        className="flex items-center justify-center min-h-screen font-mono"
        style={{ background: "#020209", color: "#00f5ff" }}
      >
        <p
          style={{
            textShadow: "0 0 15px #00f5ff",
            letterSpacing: "0.3em",
            fontSize: "1.1rem",
          }}
        >
          CARREGANDO...
        </p>
      </div>
    ),
  }
);

// Exporta o wrapper — usado pela página (Server Component)
export default function GameClientWrapper() {
  return <SpaceInvadersGame />;
}
