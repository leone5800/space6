// ============================================================
// SPACE INVADERS NEON — ENGINE PRINCIPAL DO JOGO
// ============================================================
// Contém todos os tipos, constantes, entidades e lógica de
// física, colisão e gerenciamento de estado do jogo.
// ============================================================

// ──────────────────────────────────────────────────────────
// TIPOS
// ──────────────────────────────────────────────────────────

/** Estados possíveis do jogo */
export type GameState = "menu" | "playing" | "paused" | "phase_clear" | "boss_intro" | "game_over" | "victory";

/** ID de cada fase (1-4 normais, 5 = boss) */
export type PhaseId = 1 | 2 | 3 | 4 | 5;

/**
 * Nível de dificuldade escolhido pelo jogador no menu.
 * Determina os multiplicadores base aplicados em TODAS as fases.
 *   FACIL   — para iniciantes: inimigos lentos, pouco tiro
 *   NORMAL  — experiência balanceada (padrão do jogo)
 *   DIFICIL — inimigos agressivos, tiros rápidos
 *   EXTREMO — máxima pressão desde a fase 1
 */
export type DifficultyMode = "FACIL" | "NORMAL" | "DIFICIL" | "EXTREMO";

/**
 * Multiplicadores fixos por nível de dificuldade.
 * São aplicados sobre os valores base de cada PHASE_CONFIG.
 *   speedMult       — velocidade horizontal do grid de inimigos
 *   fireRateMult    — probabilidade de tiro por frame
 *   bulletSpeedMult — velocidade dos projéteis inimigos
 *   phaseBaseAdd    — valor somado ao phaseBase da dificuldade progressiva
 */
export const DIFFICULTY_MULTIPLIERS: Record<DifficultyMode, {
  speedMult:       number;
  fireRateMult:    number;
  bulletSpeedMult: number;
  phaseBaseAdd:    number;
  label:           string;
  color:           string;
}> = {
  FACIL:   { speedMult: 0.65, fireRateMult: 0.55, bulletSpeedMult: 0.65, phaseBaseAdd: -0.3, label: "FACIL",   color: "#00f5ff" },
  NORMAL:  { speedMult: 1.00, fireRateMult: 1.00, bulletSpeedMult: 1.00, phaseBaseAdd:  0.0, label: "NORMAL",  color: "#00ff88" },
  DIFICIL: { speedMult: 1.45, fireRateMult: 1.55, bulletSpeedMult: 1.40, phaseBaseAdd:  0.5, label: "DIFICIL", color: "#ff8800" },
  EXTREMO: { speedMult: 1.90, fireRateMult: 2.20, bulletSpeedMult: 1.80, phaseBaseAdd:  1.0, label: "EXTREMO", color: "#ff2244" },
};

// ──────────────────────────────────────────────────────────
// PALETA DE CORES NEON
// ──────────────────────────────────────────────────────────

export const COLORS = {
  background:   "#020209",
  playerBody:   "#00f5ff",
  playerGlow:   "#00f5ff44",
  bulletPlayer: "#00ffff",
  bulletEnemy:  "#ff2244",
  bulletBoss:   "#ff00ff",
  enemyA:       "#ff00ff",
  enemyB:       "#ff8800",
  enemyC:       "#00ff88",
  enemyD:       "#ffff00",
  boss:         "#ff0066",
  bossShield:   "#8800ff",
  star:         "#ffffff",
  hud:          "#00f5ff",
  shield:       "#00ff88",
  explosion:    ["#ff4400", "#ff8800", "#ffff00", "#ffffff"] as string[],
} as const;

// ──────────────────────────────────────────────────────────
// CONFIGURAÇÕES DO JOGADOR
// ──────────────────────────────────────────────────────────

export const PLAYER_CONFIG = {
  speed:          300,   // px/s de movimento lateral
  bulletSpeed:    600,   // px/s do projétil
  fireRate:       0.18,  // segundos entre tiros
  width:          44,
  height:         36,
  lives:          3,
  invincibleTime: 2.0,   // segundos de invencibilidade após dano
} as const;

// ──────────────────────────────────────────────────────────
// CONFIGURAÇÕES DE CADA FASE
// ──────────────────────────────────────────────────────────

export interface PhaseSettings {
  rows: number;
  cols: number;
  enemyTypes: string[];
  enemySpeed: number;       // px/s horizontal do grid
  dropAmount: number;       // pixels que descem ao inverter direção
  enemyFireRate: number;    // probabilidade de tiro por frame por inimigo
  enemyBulletSpeed: number; // px/s dos tiros inimigos
  enemyPoints: Record<string, number>;
  label: string;
  bgColor: string;
  accentColor: string;
}

export const PHASE_CONFIG: Record<PhaseId, PhaseSettings> = {
  // ── FASE 1: Invasão Básica ──────────────────────────────
  // Apenas inimigo tipo A. Lento, poucas colunas, baixo fire rate.
  // Introduz o jogador às mecânicas sem sobrecarregar.
  1: {
    rows: 3, cols: 8,
    enemyTypes: ["A"],
    enemySpeed: 50,  dropAmount: 26,
    enemyFireRate: 0.010, enemyBulletSpeed: 200,
    enemyPoints: { A: 10 },
    label: "INVASÃO BÁSICA", bgColor: "#000814", accentColor: "#ff00ff",
  },
  // ── FASE 2: Esquadrão Verde ─────────────────────────────
  // Dois tipos de inimigos. Velocidade e cadência moderadas.
  // Inimigo B (fileira de cima) vale mais pontos.
  2: {
    rows: 4, cols: 9,
    enemyTypes: ["A", "B"],
    enemySpeed: 70,  dropAmount: 28,
    enemyFireRate: 0.016, enemyBulletSpeed: 255,
    enemyPoints: { A: 10, B: 20 },
    label: "ESQUADRÃO VERDE", bgColor: "#000d05", accentColor: "#00ff88",
  },
  // ── FASE 3: Ataque Triplo ───────────────────────────────
  // Três tipos de inimigos. Velocidade alta, tiros rápidos.
  // Inimigo C (fileira superior) é mais difícil e vale muito.
  3: {
    rows: 4, cols: 10,
    enemyTypes: ["A", "B", "C"],
    enemySpeed: 95,  dropAmount: 30,
    enemyFireRate: 0.022, enemyBulletSpeed: 300,
    enemyPoints: { A: 10, B: 20, C: 40 },
    label: "ATAQUE TRIPLO", bgColor: "#080004", accentColor: "#ff8800",
  },
  // ── FASE 4: Frota Dourada ───────────────────────────────
  // Todos os quatro tipos de inimigos. Máximo de pressão antes do boss.
  // Muitas colunas, alta velocidade, cadência de tiro intensa.
  4: {
    rows: 5, cols: 10,
    enemyTypes: ["A", "B", "C", "D"],
    enemySpeed: 120, dropAmount: 34,
    enemyFireRate: 0.028, enemyBulletSpeed: 355,
    enemyPoints: { A: 10, B: 20, C: 40, D: 80 },
    label: "FROTA DOURADA", bgColor: "#080600", accentColor: "#ffff00",
  },
  // ── FASE 5: Boss ────────────────────────────────────────
  // Grid vazio — o boss é uma entidade separada com IA própria.
  5: {
    rows: 0, cols: 0,
    enemyTypes: ["BOSS"],
    enemySpeed: 0, dropAmount: 0,
    enemyFireRate: 0, enemyBulletSpeed: 0,
    enemyPoints: { BOSS: 5000 },
    label: "ALMIRANTE NECROX", bgColor: "#06000d", accentColor: "#ff0066",
  },
};

// ──────────────────────────────────────────────────────────
// SISTEMA DE POWER-UPS
// ──────────────────────────────────────────────────────────

/**
 * Tipos de power-up que podem ser dropados pelos inimigos.
 *   TRIPLE_SHOT — dispara 3 projéteis simultâneos (centro + 2 diagonais)
 *   RAPID_FIRE  — dobra a cadência de tiro por 8 segundos
 *   SHIELD      — escudo que absorve o próximo hit recebido
 *   PIERCE      — tiros atravessam inimigos por 7 segundos
 *   BOMB        — elimina todos os inimigos na tela instantaneamente
 */
export type PowerUpType = "TRIPLE_SHOT" | "RAPID_FIRE" | "SHIELD" | "PIERCE" | "BOMB";

/** Item coletável que cai após a morte de um inimigo */
export interface PowerUp {
  x: number;
  y: number;
  vy: number;       // velocidade de queda em px/s
  type: PowerUpType;
  w: number;
  h: number;
  animTimer: number; // acumulador para animação de pulso
}

/** Estado ativo de um power-up no jogador (temporários ou permanentes) */
export interface ActivePowerUp {
  type: PowerUpType;
  timeLeft: number; // -1 = permanente (SHIELD, BOMB — consumidos ao usar)
}

/** Probabilidade de drop por tipo de inimigo (0-1) */
export const POWERUP_DROP_CHANCE: Record<string, number> = {
  A: 0.08,  // Inimigo básico — menor chance
  B: 0.11,
  C: 0.15,
  D: 0.18,  // Inimigo dourado — maior chance
};

/** Drop chance para o boss (a cada hit que o tira de uma fase de comportamento) */
export const BOSS_POWERUP_DROP_CHANCE = 0.25;

/** Duração em segundos para cada tipo (para SHIELD e BOMB é permanente / único uso) */
export const POWERUP_DURATION: Record<PowerUpType, number> = {
  TRIPLE_SHOT: 10,
  RAPID_FIRE:  8,
  SHIELD:      -1, // consome ao levar dano
  PIERCE:      7,
  BOMB:        -1, // usa imediatamente ao coletar
};

/** Cores neon de cada power-up (usadas no renderer e nas partículas) */
export const POWERUP_COLORS: Record<PowerUpType, string> = {
  TRIPLE_SHOT: "#00ffff",
  RAPID_FIRE:  "#ffff00",
  SHIELD:      "#00ff88",
  PIERCE:      "#ff8800",
  BOMB:        "#ff00ff",
};

/** Rótulos exibidos no HUD */
export const POWERUP_LABELS: Record<PowerUpType, string> = {
  TRIPLE_SHOT: "3x TIRO",
  RAPID_FIRE:  "RAPIDO",
  SHIELD:      "ESCUDO",
  PIERCE:      "PIERCE",
  BOMB:        "BOMBA",
};

/**
 * Seleciona aleatoriamente um tipo de power-up para dropar.
 * A BOMB é rara (10% dos drops); os demais são uniformes.
 */
export function rollPowerUpType(): PowerUpType {
  const r = Math.random();
  if (r < 0.10) return "BOMB";
  if (r < 0.30) return "SHIELD";
  if (r < 0.50) return "TRIPLE_SHOT";
  if (r < 0.75) return "RAPID_FIRE";
  return "PIERCE";
}

/** Cria um power-up caindo na posição do inimigo morto */
export function createPowerUp(x: number, y: number, type: PowerUpType): PowerUp {
  return {
    x, y,
    vy: 90, // cai a 90 px/s
    type,
    w: 26, h: 26,
    animTimer: 0,
  };
}

/** Move os power-ups para baixo e remove os que saíram da tela */
export function updatePowerUps(powerUps: PowerUp[], dt: number, height: number): PowerUp[] {
  return powerUps.filter(p => {
    p.y += p.vy * dt;
    p.animTimer += dt;
    return p.y < height + 40;
  });
}

// ──────────────────────────────────────────────────────────
// ENTIDADE: BARREIRA (bunker de proteção)
// ──────────────────────────────────────────────────────────

export interface Star {
  x: number; y: number;
  size: number;  // raio em pixels
  speed: number; // velocidade de queda
  alpha: number; // opacidade
}

/** Cria campo de estrelas com 3 camadas de profundidade (parallax) */
export function createStarField(count: number, width: number, height: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const layer = Math.floor(Math.random() * 3);
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size:  [0.5, 1.0, 1.8][layer],
      speed: [20,  45,  80][layer],
      alpha: [0.3, 0.6, 1.0][layer],
    });
  }
  return stars;
}

/** Move as estrelas para baixo e reinicia no topo (loop infinito) */
export function updateStars(stars: Star[], dt: number, height: number, width: number): void {
  for (const s of stars) {
    s.y += s.speed * dt;
    if (s.y > height) {
      s.y = -s.size * 2;
      s.x = Math.random() * width;
    }
  }
}

// ──────────────────────────────────────────────────────────
// ENTIDADE: PARTÍCULA DE EXPLOSÃO
// ──────────────────────────────────────────────────────────

export interface Particle {
  x: number; y: number;
  vx: number; vy: number;   // velocidade em px/s
  life: number;             // vida restante em segundos
  maxLife: number;          // vida máxima (para calcular fade)
  size: number;             // raio em pixels
  color: string;
}

/** Cria uma explosão radial de partículas */
export function createExplosion(
  x: number, y: number,
  count: number,
  colors: readonly string[],
  intensity = 1
): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.8;
    const speed = (80 + Math.random() * 200) * intensity;
    const life  = 0.4 + Math.random() * 0.6;
    out.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life, maxLife: life,
      size: (2 + Math.random() * 5) * intensity,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
  return out;
}

/** Atualiza partículas: move, aplica gravidade leve e remove as mortas */
export function updateParticles(particles: Particle[], dt: number): Particle[] {
  return particles.filter(p => {
    p.x   += p.vx * dt;
    p.y   += p.vy * dt;
    p.vy  += 80 * dt; // gravidade suave
    p.vx  *= 0.98;    // atrito do ar
    p.life -= dt;
    return p.life > 0;
  });
}

// ──────────────────────────────────────────────────────────
// ENTIDADE: PROJÉTIL
// ──────────────────────────────────────────────────────────

export interface Bullet {
  x: number; y: number;
  vx: number; vy: number;  // velocidade em px/s
  w: number; h: number;
  fromPlayer: boolean;     // true = tiro do jogador
  color: string;
  glowColor: string;
  damage: number;
}

/** Move projéteis e remove os que saíram da tela */
export function updateBullets(bullets: Bullet[], dt: number, height: number, width: number): Bullet[] {
  return bullets.filter(b => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    return b.y > -30 && b.y < height + 30 && b.x > -30 && b.x < width + 30;
  });
}

// ──────────────────────────────────────────────────────────
// ENTIDADE: INIMIGO
// ──────────────────────────────────────────────────────────

export interface Enemy {
  x: number; y: number;
  w: number; h: number;
  type: string;        // "A", "B", "C" ou "D"
  hp: number; maxHp: number;
  points: number;      // pontos ao eliminar
  animFrame: number;   // frame da animação (0 ou 1)
  animTimer: number;   // acumulador de tempo para animação
  row: number; col: number;
  flashTimer: number;  // timer de piscar ao tomar dano
}

/** Cria o grid de inimigos para uma fase */
export function createEnemyGrid(phase: PhaseSettings, canvasW: number): Enemy[] {
  const enemies: Enemy[] = [];

  // ── Dimensões e espaçamento ──────────────────────────────────────
  // padX/padY: espaço ENTRE inimigos (não é o tamanho deles).
  // Valores maiores evitam que fiquem "colados" e dão espaço ao jogador
  // para mirar individualmente em vez de disparar na massa.
  const eW = 34, eH = 26;
  const padX = 22; // espaço horizontal entre centros
  const padY = 30; // espaço vertical entre centros

  const totalW = phase.cols * (eW + padX) - padX;
  // Se o grid for mais largo que o canvas, centraliza com margem
  const startX = Math.max(24, (canvasW - totalW) / 2);
  const startY = 72; // começa mais perto do topo

  for (let row = 0; row < phase.rows; row++) {
    // As linhas de CIMA recebem o tipo de inimigo mais valioso.
    // Isso incentiva o jogador a atacar as fileiras superiores primeiro.
    const typeIdx = Math.min(
      Math.floor(((phase.rows - 1 - row) / phase.rows) * phase.enemyTypes.length),
      phase.enemyTypes.length - 1
    );
    const type = phase.enemyTypes[typeIdx];
    const pts  = phase.enemyPoints[type] ?? 10;

    for (let col = 0; col < phase.cols; col++) {
      enemies.push({
        x: startX + col * (eW + padX),
        y: startY + row * (eH + padY),
        w: eW, h: eH,
        type, hp: 1, maxHp: 1,
        points: pts,
        animFrame: 0, animTimer: 0,
        row, col,
        flashTimer: 0,
      });
    }
  }
  return enemies;
}

// ──────────────────────────────────────────────────────────
// ENTIDADE: BOSS — ALMIRANTE NECROX
// ──────────────────────────────────────────────────────────

export interface Boss {
  x: number; y: number;
  w: number; h: number;
  hp: number; maxHp: number;
  behaviorPhase: number; // 1=normal, 2=agressivo, 3=frenético
  vx: number;
  animFrame: number; animTimer: number;
  fireTimer: number;
  firePattern: number;  // 0=reto, 1=leque, 2=espiral
  patternTimer: number;
  flashTimer: number;
  shieldActive: boolean;
  shieldHp: number; shieldMaxHp: number;
  shieldTimer: number;
  chargeActive: boolean;
  chargeTimer: number;
  entranceY: number;    // Y de parada após entrada
  entering: boolean;    // ainda descendo para entrar em cena
}

/** Cria o boss no topo (fora da tela, descerá ao entrar) */
export function createBoss(canvasW: number): Boss {
  return {
    x: canvasW / 2, y: -160,
    w: 110, h: 80,
    hp: 500, maxHp: 500,
    behaviorPhase: 1,
    vx: 120,
    animFrame: 0, animTimer: 0,
    fireTimer: 0, firePattern: 0, patternTimer: 0,
    flashTimer: 0,
    shieldActive: false, shieldHp: 80, shieldMaxHp: 80, shieldTimer: 0,
    chargeActive: false, chargeTimer: 0,
    entranceY: 110,
    entering: true,
  };
}

/** Calcula fase de comportamento do boss baseada em % de vida */
export function getBossPhase(boss: Boss): number {
  const r = boss.hp / boss.maxHp;
  if (r > 0.66) return 1;
  if (r > 0.33) return 2;
  return 3;
}

// ───────────────────────────────────────��──────────────────
// ENTIDADE: BARREIRA (bunker de proteção)
// ──────────────────────────────────────────────────────────

export interface Barrier {
  x: number; y: number;
  blocks: boolean[][];  // true = bloco intacto
  blockW: number; blockH: number;
  cols: number; rows: number;
}

/** Cria as 4 barreiras estilo bunker clássico */
export function createBarriers(canvasW: number, canvasH: number): Barrier[] {
  const barriers: Barrier[] = [];
  const num = 4;
  const cols = 10, rows = 5;
  const bW = 8, bH = 8;
  const barrierW = cols * bW;
  const spacing  = (canvasW - num * barrierW) / (num + 1);

  for (let i = 0; i < num; i++) {
    const blocks: boolean[][] = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => {
        if (r === 0 && (c < 2 || c > cols - 3)) return false; // cantos superiores vazios
        if (r >= rows - 2 && c >= 3 && c <= cols - 4) return false; // abertura inferior
        return true;
      })
    );
    // Posiciona as barreiras no terço inferior do canvas,
    // logo acima da zona de manobra do jogador (canvasH/2 + 30).
    const barrierY = Math.round(canvasH / 2 + 32);
    barriers.push({
      x: spacing + i * (barrierW + spacing),
      y: barrierY,
      blocks, blockW: bW, blockH: bH, cols, rows,
    });
  }
  return barriers;
}

/** Verifica se um projétil atingiu alguma barreira e destrói blocos */
export function checkBarrierCollision(bullet: Bullet, barriers: Barrier[]): boolean {
  for (const bar of barriers) {
    const bx = bar.x, by = bar.y;
    const bw = bar.cols * bar.blockW;
    const bh = bar.rows * bar.blockH;
    if (bullet.x + bullet.w < bx || bullet.x > bx + bw) continue;
    if (bullet.y + bullet.h < by || bullet.y > by + bh) continue;

    const col = Math.floor((bullet.x + bullet.w / 2 - bx) / bar.blockW);
    const row = Math.floor((bullet.y + bullet.h / 2 - by) / bar.blockH);
    if (row < 0 || row >= bar.rows || col < 0 || col >= bar.cols) continue;
    if (!bar.blocks[row][col]) continue;

    bar.blocks[row][col] = false;
    // Dano em área nos blocos adjacentes (35% de chance)
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr < bar.rows && nc >= 0 && nc < bar.cols && bar.blocks[nr][nc] && Math.random() < 0.35) {
          bar.blocks[nr][nc] = false;
        }
      }
    }
    return true;
  }
  return false;
}

// ──────────────────────────────────────────────────────────
// SISTEMA DE SKINS DA NAVE
// ──────────────────────────────────────────────────────────

/**
 * Modelos de nave disponíveis para o jogador selecionar no menu.
 *   PADRAO   — nave triangular clássica (design original)
 *   AGUIA    — asa larga e agressiva com pontas pronunciadas
 *   FANTASMA — corpo ovalado, silhueta arredondada
 *   ARMA     — fuselagem estreita, caça militar estilizado
 */
export type ShipModel = "PADRAO" | "AGUIA" | "FANTASMA" | "ARMA";

/** Cores neon disponíveis para a nave */
export type ShipColor = "CIANO" | "MAGENTA" | "DOURADO" | "VERDE";

/** Combinação de modelo + cor que define a aparência da nave */
export interface PlayerSkin {
  model: ShipModel;
  color: ShipColor;
}

/** Valor hex de cada cor de nave */
export const SHIP_COLORS: Record<ShipColor, string> = {
  CIANO:   "#00f5ff",
  MAGENTA: "#ff00ff",
  DOURADO: "#ffd700",
  VERDE:   "#00ff88",
};

/** Rótulos exibidos no menu para cada modelo */
export const SHIP_MODEL_LABELS: Record<ShipModel, string> = {
  PADRAO:   "PADRAO",
  AGUIA:    "AGUIA",
  FANTASMA: "FANTASMA",
  ARMA:     "ARMA",
};

/** Skin padrão ao iniciar o jogo */
export const DEFAULT_SKIN: PlayerSkin = { model: "PADRAO", color: "CIANO" };

// ──────────────────────────────────────────────────────────
// ENTIDADE: NAVE DO JOGADOR
// ──────────────────────────────────────────────────────────

export interface Player {
  x: number; y: number;
  w: number; h: number;
  vx: number;
  vy: number;           // velocidade vertical em px/s
  lives: number;
  score: number;
  fireTimer: number;
  invincible: number;   // segundos restantes de invencibilidade
  thrusterAnim: number; // acumulador de tempo para animar propulsor
}

/** Cria o jogador na posição inicial centralizada (zona inferior do canvas) */
export function createPlayer(canvasW: number, canvasH: number): Player {
  return {
    x: canvasW / 2, y: canvasH - 90,
    w: PLAYER_CONFIG.width, h: PLAYER_CONFIG.height,
    vx: 0, vy: 0,
    lives: PLAYER_CONFIG.lives,
    score: 0,
    fireTimer: 0,
    invincible: 0,
    thrusterAnim: 0,
  };
}

// ──────────────────────────────────────────────────────────
// COLISÃO AABB
// ──────────────────────────────────────────────────────────

/** Retorna true se os dois retângulos se sobrepõem */
export function rectOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ──────────────────────────────────────────────────────────
// HIGH SCORE (localStorage)
// ──────────────────────────────────────────────────────────

export function saveHighScore(score: number): void {
  if (typeof window === "undefined") return;
  const cur = getHighScore();
  if (score > cur) localStorage.setItem("si_hs", String(score));
}

export function getHighScore(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem("si_hs") ?? "0", 10);
}

// ──────────────────────────────────────────────────────────
// UTILITÁRIOS MATEMÁTICOS
// ──────────────────────────────────────────────────────────

/** Interpolação linear */
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

/** Número aleatório entre min e max */
export function rand(min: number, max: number): number { return min + Math.random() * (max - min); }

/** Mantém valor dentro de [min, max] */
export function clamp(val: number, min: number, max: number): number { return Math.max(min, Math.min(max, val)); }
