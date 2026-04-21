# Space Invaders Neon

Jogo de Space Invaders com estetica neon construido com **Next.js 16**, **React 19** e **TypeScript**. Todo o jogo e renderizado em um `<canvas>` HTML5 puro, sem nenhuma dependencia de engine externa. O audio e gerado proceduralmente via **Web Audio API**, sem arquivos de som externos.

---

## Requisitos

- **Node.js** 18 ou superior (recomendado: versao LTS mais recente)
- **pnpm** (gerenciador de pacotes do projeto — veja `pnpm-lock.yaml`)

Para instalar o pnpm globalmente caso ainda nao tenha:

```bash
npm install -g pnpm
```

---

## Como rodar no VS Code

### 1. Clone o repositorio

```bash
git clone https://github.com/leone5800/space5.git
cd space5
```

### 2. Instale as dependencias

```bash
pnpm install
```

### 3. Inicie o servidor de desenvolvimento

```bash
pnpm dev
```

Abra o navegador em **http://localhost:3000**.

> O Next.js 16 usa Turbopack por padrao. Se preferir Webpack, use `pnpm dev --no-turbo`.

### 4. Build para producao (opcional)

```bash
pnpm build
pnpm start
```

---

## Estrutura do projeto

```
space5/
├── app/
│   ├── layout.tsx              # Layout raiz do Next.js App Router
│   ├── page.tsx                # Pagina principal (Server Component)
│   └── globals.css             # Estilos globais (Tailwind CSS v4)
│
├── components/
│   ├── SpaceInvadersGame.tsx   # Componente principal do jogo (canvas + game loop)
│   ├── GameClientWrapper.tsx   # Wrapper client-side para dynamic import (ssr: false)
│   ├── theme-provider.tsx      # Provider de tema (dark/light)
│   └── ui/                     # Componentes shadcn/ui (botoes, dialogs, etc)
│       ├── button.tsx
│       ├── dialog.tsx
│       └── ...                 # Outros componentes UI
│
├── lib/
│   ├── game-engine.ts          # Motor do jogo: tipos, entidades, fisica, colisao
│   ├── game-renderer.ts        # Funcoes de desenho no canvas 2D
│   ├── game-audio.ts           # Sons procedurais via Web Audio API
│   └── utils.ts                # Utilitarios gerais (cn, etc)
│
├── hooks/
│   ├── use-mobile.ts           # Hook para detectar dispositivos moveis
│   └── use-toast.ts            # Hook para notificacoes toast
│
├── styles/
│   └── globals.css             # Estilos globais alternativos
│
├── public/                     # Assets estaticos
│   ├── icon.svg
│   ├── apple-icon.png
│   └── ...
│
├── next.config.mjs             # Configuracao do Next.js
├── tsconfig.json               # Configuracao do TypeScript
├── postcss.config.mjs          # Configuracao do PostCSS
├── components.json             # Configuracao do shadcn/ui
├── package.json                # Dependencias e scripts
└── pnpm-lock.yaml              # Lockfile do pnpm
```

---

## Arquivos principais explicados

### `lib/game-engine.ts`

Contem toda a logica do jogo:

- **Tipos TypeScript**: `GameState`, `PhaseId`, `DifficultyMode`, `PowerUpType`, `ShipModel`, `ShipColor`, etc.
- **Constantes**: `COLORS`, `PLAYER_CONFIG`, `PHASE_CONFIG`, `DIFFICULTY_MULTIPLIERS`
- **Interfaces de entidades**: `Player`, `Enemy`, `Boss`, `Bullet`, `Barrier`, `Star`, `Particle`, `PowerUp`
- **Sistema de skins**: `PlayerSkin`, `SHIP_COLORS`, `SHIP_MODEL_LABELS`, `DEFAULT_SKIN`
- **Sistema de power-ups**: `POWERUP_DROP_CHANCE`, `POWERUP_DURATION`, `POWERUP_COLORS`, `POWERUP_LABELS`
- **Funcoes de criacao**: `createPlayer()`, `createEnemyGrid()`, `createBoss()`, `createBarriers()`, `createStarField()`, `createExplosion()`, `createPowerUp()`
- **Funcoes de atualizacao**: `updateStars()`, `updateParticles()`, `updateBullets()`, `updatePowerUps()`
- **Fisica e colisao**: `rectOverlap()`, `checkBarrierCollision()`, `getBossPhase()`
- **High score**: `saveHighScore()`, `getHighScore()` (usa localStorage)
- **Utilitarios**: `lerp()`, `clamp()`, `rand()`

### `lib/game-renderer.ts`

Funcoes de desenho no Canvas 2D:

- **Fundo**: `drawBackground()`, `drawStars()`
- **Jogador**: `drawPlayer()`, `drawShipPadrao()`, `drawShipAguia()`, `drawShipFantasma()`, `drawShipArma()`
- **Inimigos**: `drawEnemy()` (4 tipos: A, B, C, D com designs unicos)
- **Boss**: `drawBoss()` (com escudo, olho, canhoes, rachaduras de dano)
- **Projeteis**: `drawBullets()`
- **Particulas**: `drawParticles()`
- **Barreiras**: `drawBarriers()`
- **HUD**: `drawHUD()`, `drawActivePowerUps()`
- **Telas**: `drawMenu()`, `drawPause()`, `drawPhaseClear()`, `drawBossIntro()`, `drawGameOver()`, `drawVictory()`
- **Power-ups**: `drawPowerUps()`
- **Geometrias do menu**: `getMenuDifficultyRects()`, `getMenuModelRects()`, `getMenuColorRects()`, `getPauseMenuButtonRect()`
- **Utilitarios**: `glowText()`, `withGlow()`

### `lib/game-audio.ts`

Sons gerados proceduralmente com Web Audio API:

- **Tiros**: `sfxPlayerShoot()`, `sfxEnemyShoot()`, `sfxBossShoot()`
- **Explosoes**: `sfxEnemyExplode()`, `sfxBigExplosion()`
- **Dano**: `sfxPlayerHit()`
- **Escudo**: `sfxShieldUp()`, `sfxShieldBreak()`
- **Eventos**: `sfxPhaseClear()`, `sfxBossIntro()`, `sfxVictory()`, `sfxBossCharge()`, `sfxMenuSelect()`

### `components/SpaceInvadersGame.tsx`

Componente React principal:

- **Estado React**: `gameState`, `currentPhase`, `finalScore`, `highScore`, `selectedDifficulty`, `selectedSkin`
- **Refs de entidades**: `playerRef`, `enemiesRef`, `bossRef`, `bulletsRef`, `particlesRef`, `starsRef`, `barriersRef`, `powerUpsRef`, `activePowerUpsRef`
- **Game loop**: `gameLoop()` com `requestAnimationFrame`
- **Callbacks**: `initPhase()`, `startGame()`, `goToMenu()`, `triggerGameOver()`, `triggerVictory()`, `playerFire()`, `enemyFire()`, `bossFire()`
- **Colisoes**: `checkPlayerVsEnemies()`, `checkPlayerVsBoss()`, `checkEnemyBulletsVsPlayer()`, `checkPowerUpCollect()`, `checkEnemiesAtBase()`
- **Inputs**: Teclado (WASD/setas) + Mouse (cliques no menu) + Touch (mobile)

---

## Como jogar

| Acao           | Teclado                        | Mobile          |
|----------------|--------------------------------|-----------------|
| Mover          | Setas ou WASD (4 direcoes)     | Botoes D-pad    |
| Atirar         | Barra de espaco                | Botao FIRE      |
| Iniciar jogo   | Espaco (na tela de menu)       | Botao FIRE      |
| Pausar         | P ou Esc                       | —               |
| Continuar      | P ou Esc                       | —               |
| Voltar ao menu | M (na pausa) ou clique         | Clique no botao |

---

## Personalizacao da nave

No menu, voce pode escolher:

### Modelos de nave

| Modelo    | Descricao                                    |
|-----------|----------------------------------------------|
| PADRAO    | Nave triangular classica (design original)   |
| AGUIA     | Asa larga e agressiva com pontas pronunciadas|
| FANTASMA  | Corpo ovalado, silhueta arredondada          |
| ARMA      | Fuselagem estreita, caca militar estilizado  |

### Cores disponiveis

| Cor      | Hex       |
|----------|-----------|
| CIANO    | #00f5ff   |
| MAGENTA  | #ff00ff   |
| DOURADO  | #ffd700   |
| VERDE    | #00ff88   |

---

## Fases e dificuldade

O jogo possui **5 fases**:

| Fase | Nome            | Inimigos       | Descricao                              |
|------|-----------------|----------------|----------------------------------------|
| 1    | Invasao Basica  | Tipo A         | Introducao ao jogo, ritmo lento        |
| 2    | Esquadrao Verde | Tipos A e B    | Velocidade e cadencia moderadas        |
| 3    | Ataque Triplo   | Tipos A, B, C  | Tres tipos, tiros rapidos              |
| 4    | Frota Dourada   | Tipos A-D      | Maxima pressao antes do boss           |
| 5    | Boss            | Almirante Necrox | Boss com 3 fases de comportamento   |

### Modos de dificuldade

Selecione clicando nos botoes no menu antes de iniciar:

| Modo    | Velocidade | Cadencia de tiro | Tiros inimigos | Cor      |
|---------|------------|------------------|----------------|----------|
| FACIL   | 0.65x      | 0.55x            | 0.65x          | Ciano    |
| NORMAL  | 1.00x      | 1.00x            | 1.00x          | Verde    |
| DIFICIL | 1.45x      | 1.55x            | 1.40x          | Laranja  |
| EXTREMO | 1.90x      | 2.20x            | 1.80x          | Vermelho |

Os multiplicadores se aplicam a **todas as fases**, incluindo o Boss (fase 5).

### Dificuldade progressiva

Dentro de cada partida, a dificuldade cresce automaticamente com:
- **Tempo de jogo**: +0.014 por segundo
- **Kills**: +0.07 a cada 10 inimigos eliminados
- **Fase atual**: cada fase tem um valor base garantido

---

## Sistema de power-ups

Inimigos podem dropar power-ups ao serem eliminados:

| Power-up    | Letra | Cor      | Duracao  | Efeito                                    |
|-------------|-------|----------|----------|-------------------------------------------|
| TRIPLE_SHOT | 3     | Ciano    | 10s      | Dispara 3 projeteis simultaneos           |
| RAPID_FIRE  | R     | Amarelo  | 8s       | Dobra a cadencia de tiro                  |
| SHIELD      | S     | Verde    | Uso unico| Absorve o proximo hit recebido            |
| PIERCE      | P     | Laranja  | 7s       | Tiros atravessam inimigos                 |
| BOMB        | B     | Magenta  | Imediato | Elimina todos os inimigos na tela         |

### Chance de drop

| Tipo de inimigo | Chance |
|-----------------|--------|
| A (basico)      | 8%     |
| B               | 11%    |
| C               | 15%    |
| D (dourado)     | 18%    |
| Boss (por fase) | 25%    |

---

## Arquitetura tecnica

### Canvas e Game Loop

O jogo usa `requestAnimationFrame` com delta time (em segundos) para atualizacoes independentes do frame rate. O estado do jogo e mantido em `useRef` para evitar re-renders desnecessarios do React; apenas mudancas de estado de tela (`GameState`) usam `useState`.

### Dimensoes do canvas

- Largura: 780px
- Altura: 760px
- Zona do jogador: metade inferior (abaixo de `CANVAS_H / 2 + 20`)
- Estrelas de fundo: 180 particulas com 3 camadas de parallax

### Renderizacao

Ordem de desenho (de tras para frente):
1. Fundo (gradiente radial)
2. Estrelas (parallax)
3. Linha divisoria da zona
4. Barreiras
5. Projeteis
6. Particulas
7. Power-ups caindo
8. Inimigos / Boss
9. Nave do jogador
10. HUD (pontos, vidas, fase, barra de vida do boss)
11. HUD de power-ups ativos

---

## Possiveis erros e solucoes

| Erro                                      | Causa provavel                     | Solucao                                      |
|-------------------------------------------|------------------------------------|----------------------------------------------|
| `Cannot find module 'next'`               | Dependencias nao instaladas        | Execute `pnpm install`                       |
| `Error: listen EADDRINUSE :::3000`        | Porta 3000 ja em uso               | Use `pnpm dev -- -p 3001` para outra porta   |
| Audio nao funciona                        | Browser bloqueia AudioContext      | Interaja com a pagina primeiro (clique/tecla)|
| Canvas em branco no servidor              | SSR desativado corretamente        | Espere o carregamento client-side            |
| `pnpm: command not found`                 | pnpm nao instalado                 | Execute `npm install -g pnpm`                |
| Skin nao muda                             | Clique fora do botao               | Clique dentro da area dos botoes no menu     |

---

## Variaveis de ambiente

O projeto **nao precisa de variaveis de ambiente** para rodar localmente. Nao ha banco de dados, autenticacao ou API externa.

---

## Scripts disponiveis

```bash
# Desenvolvimento
pnpm dev          # Inicia servidor de desenvolvimento (Turbopack)
pnpm dev --no-turbo # Usa Webpack ao inves de Turbopack

# Build
pnpm build        # Compila o projeto para producao
pnpm start        # Inicia servidor de producao (apos build)

# Qualidade
pnpm lint         # Executa ESLint para verificar erros
```

---

## Deploy

### Vercel (recomendado)

1. Conecte seu repositorio GitHub na Vercel
2. A Vercel detecta o Next.js automaticamente
3. Deploy automatico a cada push

Ou via CLI:

```bash
pnpm build
vercel --prod
```

### Outras plataformas

O projeto funciona em qualquer plataforma que suporte Next.js:
- Netlify
- Railway
- Render
- Docker

---

## Tecnologias utilizadas

- **Next.js 16** - Framework React com App Router
- **React 19** - Biblioteca UI
- **TypeScript** - Tipagem estatica
- **Tailwind CSS v4** - Estilizacao utilitaria
- **shadcn/ui** - Componentes de UI
- **Canvas API** - Renderizacao 2D
- **Web Audio API** - Audio sintetizado

---

## Licenca

MIT License - Livre para uso pessoal e comercial.
