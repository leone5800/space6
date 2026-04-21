"use client";
// ============================================================
// SPACE INVADERS NEON — COMPONENTE PRINCIPAL DO JOGO
// ============================================================
// Gerencia: canvas, game loop (requestAnimationFrame), inputs
// de teclado/touch, estado global e lógica de todas as fases.
// ============================================================

import React, { useEffect, useRef, useCallback, useState } from "react";

import {
  GameState, PhaseId, DifficultyMode, DIFFICULTY_MULTIPLIERS,
  PHASE_CONFIG, COLORS, PLAYER_CONFIG,
  Star, Particle, Bullet, Enemy, Boss, Barrier, Player,
  PowerUp, PowerUpType, ActivePowerUp,
  PlayerSkin, ShipModel, ShipColor, DEFAULT_SKIN,
  createStarField, updateStars,
  createExplosion, updateParticles,
  updateBullets,
  createEnemyGrid, createBoss, getBossPhase,
  createBarriers, checkBarrierCollision,
  createPlayer,
  rectOverlap,
  saveHighScore, getHighScore,
  clamp, lerp,
  POWERUP_DROP_CHANCE, BOSS_POWERUP_DROP_CHANCE,
  POWERUP_DURATION, POWERUP_COLORS, POWERUP_LABELS,
  rollPowerUpType, createPowerUp, updatePowerUps,
} from "@/lib/game-engine";

import {
  drawBackground, drawStars, drawPlayer,
  drawEnemy, drawBoss, drawBullets,
  drawParticles, drawBarriers, drawHUD,
  drawPhaseClear, drawBossIntro,
  drawMenu, drawGameOver, drawVictory, drawPause,
  getPauseMenuButtonRect,
  getMenuDifficultyRects, getMenuModelRects, getMenuColorRects,
  drawPowerUps, drawActivePowerUps,
} from "@/lib/game-renderer";

// ── Áudio sintetizado via Web Audio API ──
// Cada função gera o som proceduralmente sem arquivos externos.
import {
  sfxPlayerShoot, sfxEnemyShoot, sfxBossShoot,
  sfxEnemyExplode, sfxBigExplosion,
  sfxPlayerHit, sfxShieldUp, sfxShieldBreak,
  sfxPhaseClear, sfxBossIntro as sfxBossIntroSound,
  sfxVictory, sfxBossCharge,
} from "@/lib/game-audio";

// ──────────────────────────────────────────────────────────
// DIMENSÕES DO CANVAS
// ──────────────────────────────────────────────────────────

const CANVAS_W   = 780;
const CANVAS_H   = 760; // altura expandida para permitir movimento vertical do jogador
const STAR_COUNT = 180; // quantidade de estrelas no parallax

// Zona de movimento do jogador (metade inferior do canvas).
// Inimigos ficam na metade superior; jogador manobra na inferior.
// PLAYER_ZONE_TOP: linha divisória — o jogador não pode cruzar para cima desta linha.
const PLAYER_ZONE_TOP = CANVAS_H / 2 + 20;

// ──────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────────────────

export default function SpaceInvadersGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ── Estado React (causa re-render apenas quando necessário) ──
  const [gameState,    setGameState]    = useState<GameState>("menu");
  const [currentPhase, setCurrentPhase] = useState<PhaseId>(1);
  const [finalScore,   setFinalScore]   = useState(0);
  const [highScore,    setHighScore]    = useState(0);

  // Dificuldade escolhida pelo jogador no menu.
  // Guardamos em state (para re-render do canvas) e em ref (para acesso no loop).
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyMode>("NORMAL");
  // Ref espelhada — o game loop acessa esta sem causar re-renders
  const difficultyModeRef = useRef<DifficultyMode>("NORMAL");

  // Skin da nave escolhida pelo jogador no menu (modelo + cor).
  const [selectedSkin, setSelectedSkin] = useState<PlayerSkin>(DEFAULT_SKIN);
  // Ref espelhada para acesso no game loop sem re-renders
  const skinRef = useRef<PlayerSkin>(DEFAULT_SKIN);

  // ── Refs do estado interno (atualizados sem re-render no loop) ──
  const stateRef = useRef<GameState>("menu");
  const phaseRef = useRef<PhaseId>(1);

  // ── Entidades do jogo ──
  const playerRef    = useRef<Player | null>(null);
  const enemiesRef   = useRef<Enemy[]>([]);
  const bossRef      = useRef<Boss | null>(null);
  const bulletsRef   = useRef<Bullet[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const starsRef     = useRef<Star[]>([]);
  const barriersRef  = useRef<Barrier[]>([]);

  // ── Power-ups ──
  // powerUpsRef: itens caindo na tela (aguardando coleta)
  // activePowerUpsRef: efeitos ativos no jogador (com timer)
  const powerUpsRef       = useRef<PowerUp[]>([]);
  const activePowerUpsRef = useRef<ActivePowerUp[]>([]);

  // ── Inputs de teclado ──
  const keysRef = useRef({ left: false, right: false, up: false, down: false, fire: false });

  // ── Timers do loop ──
  const lastTimeRef    = useRef(0);
  const timeRef        = useRef(0);
  const rafRef         = useRef(0);
  const enemyDirRef    = useRef(1);       // direção do grid: 1=direita, -1=esquerda
  const phaseClearRef  = useRef(0);       // timer da tela de fase concluída
  const bossIntroRef   = useRef(0);       // timer da intro do boss
  const screenShakeRef = useRef(0);       // intensidade do screen shake
  const bgColorRef     = useRef(COLORS.background);
  const accentColorRef = useRef("#000020");

  // ── Sistema de dificuldade progressiva ─────────────────────────────
  // difficultyRef cresce conforme o tempo passa e inimigos são mortos.
  // Afeta: velocidade dos tiros inimigos, fire rate, velocidade do grid.
  // Vai de 1.0 (início da fase 1) até ~3.5 (final da fase 4 + boss).
  const difficultyRef       = useRef(1.0);
  // Acumula o total de inimigos eliminados na partida (para dificuldade)
  const totalKillsRef       = useRef(0);
  // Tempo total de jogo (para rampa de dificuldade baseada no tempo)
  const gameTimeRef         = useRef(0);
  // Flag para sons de evento único por fase (evita repetição)
  const phaseSoundPlayedRef = useRef(false);

  // ──────────────────────────────────────────────────────────
  // INICIAR UMA FASE
  // ──────────────────────────────────────────────────────────

  const initPhase = useCallback((phase: PhaseId) => {
    const cfg = PHASE_CONFIG[phase];
    phaseRef.current      = phase;
    bgColorRef.current     = cfg.bgColor;
    // accentColor já é uma cor hex de 6 dígitos — guardamos sem alpha
    // (o drawBackground usa rgba() separadamente, não concatena hex)
    accentColorRef.current = cfg.accentColor;

    // Fase 5 = boss, fases 1-4 = grid de inimigos
    enemiesRef.current   = phase < 5 ? createEnemyGrid(cfg, CANVAS_W) : [];
    bossRef.current      = phase === 5 ? createBoss(CANVAS_W) : null;
    bulletsRef.current   = [];
    particlesRef.current = [];
    barriersRef.current  = createBarriers(CANVAS_W, CANVAS_H);
    powerUpsRef.current  = []; // limpa itens caindo ao trocar de fase
    enemyDirRef.current  = 1;
    // Mantém os power-ups ativos do jogador entre fases (não reseta activePowerUpsRef)

    setCurrentPhase(phase);
  }, []);

  // ──────────────────────────────────────────────────────────
  // INICIAR JOGO
  // ──────────────────────────────────────────────────────────

  // ──────────────────────────────────────────────────────────
  // VOLTAR AO MENU
  // ────────────────────────────────────────────��─────────────

  const goToMenu = useCallback(() => {
    // Para tudo e volta para a tela de menu
    stateRef.current = "menu";
    setGameState("menu");
    // Limpa todas as entidades ao voltar ao menu
    enemiesRef.current        = [];
    bossRef.current           = null;
    bulletsRef.current        = [];
    particlesRef.current      = [];
    barriersRef.current       = [];
    powerUpsRef.current       = [];
    activePowerUpsRef.current = [];
    playerRef.current         = null;
  }, []);

  const startGame = useCallback(() => {
    // Garante que os refs espelham o state antes de iniciar
    // (importante quando startGame é chamado via teclado)
    difficultyModeRef.current = selectedDifficulty;
    skinRef.current = selectedSkin;

    playerRef.current    = createPlayer(CANVAS_W, CANVAS_H);
    starsRef.current     = createStarField(STAR_COUNT, CANVAS_W, CANVAS_H);
    timeRef.current      = 0;
    gameTimeRef.current  = 0;
    phaseClearRef.current = 0;
    bossIntroRef.current  = 0;
    // Reseta a dificuldade progressiva para o início da partida
    difficultyRef.current = 1.0;
    totalKillsRef.current = 0;
    phaseSoundPlayedRef.current = false;
    // Reseta power-ups ao iniciar nova partida
    powerUpsRef.current       = [];
    activePowerUpsRef.current = [];

    initPhase(1);
    stateRef.current = "playing";
    setGameState("playing");
    setHighScore(getHighScore());
  }, [initPhase, selectedDifficulty, selectedSkin]);

  // ──────────────────────────────────────────────────────────
  // GAME OVER
  // ──────────────────────────────────────────────────────────

  const triggerGameOver = useCallback(() => {
    const score = playerRef.current?.score ?? 0;
    saveHighScore(score);
    setFinalScore(score);
    setHighScore(getHighScore());
    stateRef.current = "game_over";
    setGameState("game_over");
    // Explosão grande ao morrer
    particlesRef.current = [
      ...particlesRef.current,
      ...createExplosion(
        playerRef.current?.x ?? CANVAS_W / 2,
        playerRef.current?.y ?? CANVAS_H / 2,
        60, COLORS.explosion, 2
      ),
    ];
  }, []);

  // ──────────────────────────────────────────────────────────
  // VITÓRIA
  // ──────────────────────────────────────────────────────────

  const triggerVictory = useCallback(() => {
    const score = playerRef.current?.score ?? 0;
    saveHighScore(score);
    setFinalScore(score);
    setHighScore(getHighScore());
    stateRef.current = "victory";
    setGameState("victory");
    // Muitas explosões coloridas!
    for (let i = 0; i < 8; i++) {
      particlesRef.current = [
        ...particlesRef.current,
        ...createExplosion(
          50 + Math.random() * (CANVAS_W - 100),
          50 + Math.random() * (CANVAS_H - 200),
          30, ["#00ff88", "#ffff00", "#00f5ff", "#ff00ff", "#ffffff"], 1.5
        ),
      ];
    }
  }, []);

  // ──────────────────────────────────────────────────────────
  // HELPERS DE POWER-UP
  // ──────────────────────────────────────────────────────────

  /** Retorna true se um power-up do tipo dado está ativo no jogador */
  const hasPowerUp = useCallback((type: PowerUpType): boolean => {
    return activePowerUpsRef.current.some(a => a.type === type);
  }, []);

  /**
   * Aplica um power-up ao jogador.
   * - Se já estiver ativo do mesmo tipo, renova o timer.
   * - BOMB: dispara efeito imediatamente (não fica no array de ativos).
   */
  const applyPowerUp = useCallback((type: PowerUpType) => {
    if (type === "BOMB") {
      // Elimina todos os inimigos visiveis instantaneamente
      const killed = enemiesRef.current;
      for (const e of killed) {
        playerRef.current && (playerRef.current.score += e.points);
        totalKillsRef.current++;
        const eCol: Record<string, string> = { A: COLORS.enemyA, B: COLORS.enemyB, C: COLORS.enemyC, D: COLORS.enemyD };
        particlesRef.current = [...particlesRef.current, ...createExplosion(e.x + e.w / 2, e.y + e.h / 2, 18, [eCol[e.type] ?? "#fff", "#ff00ff", "#fff"], 1.1)];
      }
      enemiesRef.current = [];
      screenShakeRef.current = 0.8;
      sfxBigExplosion();
      return;
    }

    const duration = POWERUP_DURATION[type];
    const existing = activePowerUpsRef.current.findIndex(a => a.type === type);
    if (existing >= 0) {
      // Renova o timer do power-up existente
      activePowerUpsRef.current[existing].timeLeft = duration;
    } else {
      activePowerUpsRef.current.push({ type, timeLeft: duration });
    }
  }, []);

  // ──────────────────────────────────────────────────────────
  // DISPARO DO JOGADOR
  // ──────────────────────────────────────────────────────────

  const playerFire = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;

    sfxPlayerShoot();

    const isPierce      = hasPowerUp("PIERCE");
    const isTripleShot  = hasPowerUp("TRIPLE_SHOT");

    // Projétil base (centro)
    const makeBullet = (vx: number, vy: number) => ({
      x: p.x - 2,
      y: p.y - p.h / 2 - 10,
      vy,
      vx,
      w: isPierce ? 5 : 4,
      h: isPierce ? 22 : 18,
      fromPlayer: true,
      color:     isPierce ? POWERUP_COLORS.PIERCE : COLORS.bulletPlayer,
      glowColor: isPierce ? POWERUP_COLORS.PIERCE : COLORS.bulletPlayer,
      damage: isPierce ? 999 : 1,  // PIERCE destrói sem ser consumido — tratamos nas colisões
    });

    bulletsRef.current.push(makeBullet(0, -PLAYER_CONFIG.bulletSpeed));

    if (isTripleShot) {
      // Dois tiros laterais diagonais com leve spread
      bulletsRef.current.push(makeBullet(-90, -PLAYER_CONFIG.bulletSpeed * 0.97));
      bulletsRef.current.push(makeBullet( 90, -PLAYER_CONFIG.bulletSpeed * 0.97));
    }
  }, [hasPowerUp]);

  // ──────────────────────────────────────────────────────────
  // DISPARO DOS INIMIGOS (apenas inimigos frontais por coluna)
  // ──────────────────────────────────────────────────────────

  const enemyFire = useCallback((phase: PhaseId) => {
    const enemies = enemiesRef.current;
    if (enemies.length === 0) return;
    const cfg = PHASE_CONFIG[phase];

    // Multiplicadores do modo de dificuldade selecionado no menu
    const modeMult = DIFFICULTY_MULTIPLIERS[difficultyModeRef.current];

    // Pega o inimigo mais ao fundo de cada coluna (mais próximo do jogador)
    const front: Record<number, Enemy> = {};
    for (const e of enemies) {
      if (!front[e.col] || e.y > front[e.col].y) front[e.col] = e;
    }

    for (const e of Object.values(front)) {
      // Fire rate: base da fase × dificuldade progressiva × multiplicador do modo
      const adjustedRate = cfg.enemyFireRate * difficultyRef.current * modeMult.fireRateMult;
      if (Math.random() < adjustedRate) {
        sfxEnemyShoot();
        // Velocidade do tiro: base × ramp progressiva × multiplicador do modo
        const bulletSpeed = cfg.enemyBulletSpeed
          * (1 + (difficultyRef.current - 1) * 0.4)
          * modeMult.bulletSpeedMult;
        bulletsRef.current.push({
          x: e.x + e.w / 2 - 3,
          y: e.y + e.h,
          vy: bulletSpeed,
          vx: 0,
          w: 6, h: 14,
          fromPlayer: false,
          color: COLORS.bulletEnemy,
          glowColor: COLORS.bulletEnemy,
          damage: 1,
        });
      }
    }
  }, []);

  // ──────────────────────────────────────────────────────────
  // DISPARO DO BOSS (múltiplos padrões por fase de comportamento)
  // ──────────────────────────────────────────────────────────

  const bossFire = useCallback((boss: Boss) => {
    const bPhase = getBossPhase(boss);
    const cx = boss.x;
    const cy = boss.y + boss.h / 2 + 10;

    // Multiplicador de velocidade dos projéteis do boss baseado no modo escolhido
    const bm = DIFFICULTY_MULTIPLIERS[difficultyModeRef.current].bulletSpeedMult;

    // Som do boss — mais pesado e grave que os inimigos normais
    sfxBossShoot();

    const add = (vx: number, vy: number, col = COLORS.bulletBoss) => {
      bulletsRef.current.push({
        x: cx - 3, y: cy,
        vx: vx * bm, vy: vy * bm,
        w: 8, h: 14,
        fromPlayer: false,
        color: col, glowColor: col,
        damage: 1,
      });
    };

    if (boss.firePattern === 0) {
      // Padrão 0: Tiros verticais diretos
      add(0, 260);
      if (bPhase >= 2) { add(-40, 250); add(40, 250); }
    } else if (boss.firePattern === 1) {
      // Padrão 1: Leque espalhado
      const count = bPhase >= 3 ? 9 : 5;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 0.5) + (-Math.PI * 0.4) + (Math.PI * 0.8 / (count - 1)) * i;
        const speed = 280;
        add(Math.cos(angle) * speed, Math.sin(angle) * speed);
      }
    } else if (boss.firePattern === 2) {
      // Padrão 2: Espiral (apenas na fase 3 do boss)
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 / 8) * i + timeRef.current * 2;
        add(Math.cos(angle) * 200, Math.sin(angle) * 200, "#ff8800");
      }
    }
  }, []);

  // ──────────────────────────────────────────────────────────
  // ATUALIZAÇÃO DO BOSS
  // ──────────────────────────────────────────────────────────

  const updateBossEntity = useCallback((boss: Boss, dt: number) => {
    const bPhase = getBossPhase(boss);

    // ── Multiplicadores do modo de dificuldade escolhido ──
    // São aplicados sobre os valores base do boss para que FACIL/DIFICIL/EXTREMO
    // tenham impacto real também na fase 5.
    const modeMult = DIFFICULTY_MULTIPLIERS[difficultyModeRef.current];

    // Animação de entrada: boss desce lentamente até a posição de batalha
    if (boss.entering) {
      boss.y = lerp(boss.y, boss.entranceY, dt * 2.5);
      if (Math.abs(boss.y - boss.entranceY) < 2) { boss.y = boss.entranceY; boss.entering = false; }
      boss.animTimer += dt;
      if (boss.animTimer > 0.25) { boss.animFrame = (boss.animFrame + 1) % 2; boss.animTimer = 0; }
      return;
    }

    // Velocidade lateral do boss escalada pela fase de comportamento E pelo modo
    const bPhaseSpeedMult = bPhase === 3 ? 2.0 : bPhase === 2 ? 1.4 : 1.0;
    const totalSpeedMult  = bPhaseSpeedMult * modeMult.speedMult;

    // Movimento lateral (suspende durante a carga)
    if (!boss.chargeActive) {
      boss.x += boss.vx * totalSpeedMult * dt;
      if (boss.x > CANVAS_W - boss.w / 2 - 10) { boss.x = CANVAS_W - boss.w / 2 - 10; boss.vx = -Math.abs(boss.vx); }
      if (boss.x < boss.w / 2 + 10)             { boss.x = boss.w / 2 + 10;             boss.vx =  Math.abs(boss.vx); }
    }

    // Carga suicida (fase 3): boss avança em direção ao jogador.
    // No modo EXTREMO o intervalo entre cargas é menor.
    const chargeInterval = 4 / modeMult.fireRateMult; // mais agressivo em dificuldades altas
    if (bPhase === 3 && !boss.chargeActive) {
      boss.chargeTimer += dt;
      if (boss.chargeTimer > chargeInterval) {
        boss.chargeActive = true;
        boss.chargeTimer = 0;
        sfxBossCharge();
      }
    }
    if (boss.chargeActive) {
      const p = playerRef.current;
      if (p) {
        const dx = p.x - boss.x;
        const dy = (p.y - 80) - boss.y;
        const d  = Math.sqrt(dx * dx + dy * dy) || 1;
        // Velocidade de carga também escala com o modo
        boss.x  += (dx / d) * 380 * modeMult.speedMult * dt;
        boss.y  += (dy / d) * 280 * modeMult.speedMult * dt;
      }
      boss.chargeTimer += dt;
      if (boss.chargeTimer > 1.3) { boss.chargeActive = false; boss.chargeTimer = 0; boss.y = boss.entranceY; }
    }

    // Escudo se recarrega periodicamente (fase 2+).
    // No modo FACIL o escudo demora mais para reaparecer.
    const shieldRecharge = 8 / modeMult.fireRateMult;
    if (bPhase >= 2 && !boss.shieldActive) {
      boss.shieldTimer += dt;
      if (boss.shieldTimer > shieldRecharge) {
        boss.shieldActive = true;
        boss.shieldHp = boss.shieldMaxHp;
        boss.shieldTimer = 0;
        sfxShieldUp();
      }
    }

    // Cadência de tiro do boss: base por fase escalado pelo modo de dificuldade.
    // fireRateMult > 1 = mais tiros (menos tempo entre disparos = dividimos o intervalo)
    const baseRates = [1.4, 0.9, 0.55]; // segundos entre disparos por fase de comportamento
    const adjustedRate = baseRates[bPhase - 1] / modeMult.fireRateMult;
    boss.fireTimer += dt;
    if (boss.fireTimer >= adjustedRate) {
      boss.fireTimer = 0;
      bossFire(boss);
      boss.patternTimer++;
      if (boss.patternTimer >= 3) {
        boss.patternTimer = 0;
        boss.firePattern  = (boss.firePattern + 1) % (bPhase >= 3 ? 3 : bPhase >= 2 ? 2 : 1);
      }
    }

    if (boss.flashTimer > 0) boss.flashTimer = Math.max(0, boss.flashTimer - dt * 4);
    boss.animTimer += dt;
    if (boss.animTimer > 0.25) { boss.animFrame = (boss.animFrame + 1) % 2; boss.animTimer = 0; }
  }, [bossFire]);

  // ──────────────────────────────────────────────────────────
  // COLISÕES
  // ──────────────────────────────────────────────────────────

  // Tiros do jogador vs inimigos normais
  const checkPlayerVsEnemies = useCallback(() => {
    const bullets = bulletsRef.current;
    const enemies  = enemiesRef.current;
    const player   = playerRef.current;
    if (!player) return;

    const deadB = new Set<number>(); // tiros a remover
    const deadE = new Set<number>(); // inimigos a remover

    for (let bi = 0; bi < bullets.length; bi++) {
      const b = bullets[bi];
      if (!b.fromPlayer) continue;

      const isPierce = b.damage >= 999; // tiro com PIERCE ativo

      for (let ei = 0; ei < enemies.length; ei++) {
        if (deadE.has(ei)) continue;
        const e = enemies[ei];
        if (!rectOverlap(b.x, b.y, b.w, b.h, e.x, e.y, e.w, e.h)) continue;

        // Aplica dano — PIERCE: hp sempre vai a 0 (mata de 1 hit) mas o tiro continua
        e.hp = 0;
        e.flashTimer = 0.25;

        // Tiro normal é consumido; tiro PIERCE segue em frente
        if (!isPierce) deadB.add(bi);

        deadE.add(ei);
        player.score += e.points;
        totalKillsRef.current++;
        screenShakeRef.current = 0.15;
        sfxEnemyExplode();
        const eCol: Record<string, string> = { A: COLORS.enemyA, B: COLORS.enemyB, C: COLORS.enemyC, D: COLORS.enemyD };
        particlesRef.current = [...particlesRef.current, ...createExplosion(e.x + e.w / 2, e.y + e.h / 2, 16, [eCol[e.type] ?? "#fff", "#fff", "#ffff00"], 0.9)];

        // ── Drop de power-up ──
        const dropChance = POWERUP_DROP_CHANCE[e.type] ?? 0.08;
        if (Math.random() < dropChance) {
          const puType = rollPowerUpType();
          powerUpsRef.current.push(createPowerUp(e.x + e.w / 2, e.y + e.h / 2, puType));
        }

        // Tiro normal só pode acertar 1 inimigo
        if (!isPierce) break;
      }
    }
    bulletsRef.current = bullets.filter((_, i) => !deadB.has(i));
    enemiesRef.current = enemies.filter((_, i) => !deadE.has(i));
  }, []);

  // Tiros do jogador vs boss
  const checkPlayerVsBoss = useCallback(() => {
    const boss   = bossRef.current;
    const player = playerRef.current;
    if (!boss || !player) return;

    bulletsRef.current = bulletsRef.current.filter(b => {
      if (!b.fromPlayer) return true;
      if (!rectOverlap(b.x, b.y, b.w, b.h, boss.x - boss.w / 2, boss.y - boss.h / 2, boss.w, boss.h)) return true;

      if (boss.shieldActive) {
        // Tiro absorvido pelo escudo
        boss.shieldHp -= b.damage;
        particlesRef.current = [...particlesRef.current, ...createExplosion(b.x, b.y, 6, [COLORS.bossShield, "#fff"], 0.5)];
        if (boss.shieldHp <= 0) {
          boss.shieldActive = false;
          screenShakeRef.current = 0.3;
          // Som de escudo quebrando (explosão aguda)
          sfxShieldBreak();
          particlesRef.current = [...particlesRef.current, ...createExplosion(boss.x, boss.y, 30, [COLORS.bossShield, "#fff"], 1.2)];
        }
        return false;
      }

      // Dano direto ao boss
      boss.hp -= b.damage;
      boss.flashTimer = 0.2;
      player.score += 5;
      screenShakeRef.current = 0.1;
      particlesRef.current = [...particlesRef.current, ...createExplosion(b.x, b.y, 8, [COLORS.boss, "#ff8800", "#fff"], 0.6)];
      return false;
    });
  }, []);

  // Tiros inimigos/boss vs jogador
  const checkEnemyBulletsVsPlayer = useCallback(() => {
    const player = playerRef.current;
    if (!player || player.invincible > 0) return;

    bulletsRef.current = bulletsRef.current.filter(b => {
      if (b.fromPlayer) return true;
      if (!rectOverlap(b.x, b.y, b.w, b.h, player.x - player.w / 2, player.y - player.h / 2, player.w, player.h)) return true;

      // ── SHIELD: absorve o próximo hit e se consome ──
      const shieldIdx = activePowerUpsRef.current.findIndex(a => a.type === "SHIELD");
      if (shieldIdx >= 0) {
        activePowerUpsRef.current.splice(shieldIdx, 1);
        screenShakeRef.current = 0.25;
        // Partículas de escudo quebrado (verde)
        particlesRef.current = [...particlesRef.current, ...createExplosion(player.x, player.y, 20, [POWERUP_COLORS.SHIELD, "#fff"], 0.9)];
        return false; // tiro absorvido
      }

      player.lives--;
      player.invincible = PLAYER_CONFIG.invincibleTime;
      screenShakeRef.current = 0.5;
      sfxPlayerHit();
      particlesRef.current = [...particlesRef.current, ...createExplosion(player.x, player.y, 25, [COLORS.playerBody, "#fff", "#0066ff"], 1.2)];
      if (player.lives <= 0) {
        sfxBigExplosion();
        triggerGameOver();
      }
      return false;
    });
  }, [triggerGameOver]);

  // ── Coleta de power-ups pelo jogador ──
  const checkPowerUpCollect = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    powerUpsRef.current = powerUpsRef.current.filter(pu => {
      // Hitbox um pouco mais generosa para facilitar a coleta
      if (!rectOverlap(
        pu.x - pu.w / 2, pu.y - pu.h / 2, pu.w, pu.h,
        player.x - player.w / 2 - 8, player.y - player.h / 2 - 8, player.w + 16, player.h + 16
      )) return true;

      // Coletado!
      applyPowerUp(pu.type);
      // Partículas coloridas de coleta
      particlesRef.current = [...particlesRef.current, ...createExplosion(pu.x, pu.y, 14, [POWERUP_COLORS[pu.type], "#fff"], 0.7)];
      return false;
    });
  }, [applyPowerUp]);

  // ── Atualiza timers dos power-ups ativos ──
  const tickActivePowerUps = useCallback((dt: number) => {
    activePowerUpsRef.current = activePowerUpsRef.current.filter(a => {
      if (a.timeLeft < 0) return true; // permanente (SHIELD aguardando uso)
      a.timeLeft -= dt;
      return a.timeLeft > 0;
    });

    // Aplica RAPID_FIRE: reduz o fireRate do jogador enquanto ativo
    const player = playerRef.current;
    if (!player) return;
    // O fireRate real é calculado dinamicamente no game loop via hasPowerUp
  }, []);

  // Inimigos que chegam à zona do jogador (jogo perdido)
  // Com o canvas expandido, a linha de perigo é a borda superior da zona do jogador.
  const checkEnemiesAtBase = useCallback(() => {
    const player = playerRef.current;
    for (const e of enemiesRef.current) {
      if (e.y + e.h >= PLAYER_ZONE_TOP) {
        if (player) player.lives = 0;
        sfxBigExplosion();
        triggerGameOver();
        return;
      }
    }
  }, [triggerGameOver]);

  // ──────────────────────────────────────────────────────────
  // GAME LOOP PRINCIPAL
  // ──────────────────────────────────────────────────────────

  const gameLoop = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) { rafRef.current = requestAnimationFrame(gameLoop); return; }

    // Delta time em segundos (limitado a 50ms para evitar saltos grandes)
    const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05);
    lastTimeRef.current = timestamp;
    timeRef.current += dt;

    const state  = stateRef.current;
    const phase  = phaseRef.current;
    const cfg    = PHASE_CONFIG[phase];
    const player = playerRef.current;
    const time   = timeRef.current;

    // ── Screen Shake: tremor ao tomar dano ──
    let shakeX = 0, shakeY = 0;
    if (screenShakeRef.current > 0) {
      screenShakeRef.current = Math.max(0, screenShakeRef.current - dt * 2);
      const s = screenShakeRef.current * 10;
      shakeX = (Math.random() - 0.5) * s;
      shakeY = (Math.random() - 0.5) * s;
    }

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // ══════════════════════════════════════════════════════
    // DESENHO DO FUNDO (sempre, em todos os estados)
    // ══════════════════════════════════════════════════════
    drawBackground(ctx, CANVAS_W, CANVAS_H, bgColorRef.current, accentColorRef.current);
    updateStars(starsRef.current, dt, CANVAS_H, CANVAS_W);
    drawStars(ctx, starsRef.current);

    // ── Linha divisória da zona do jogador (visível durante o jogo) ──
    if (state === "playing" || state === "paused" || state === "phase_clear" || state === "boss_intro") {
      ctx.save();
      const lineGrad = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
      lineGrad.addColorStop(0,   "transparent");
      lineGrad.addColorStop(0.2, "#00f5ff18");
      lineGrad.addColorStop(0.5, "#00f5ff30");
      lineGrad.addColorStop(0.8, "#00f5ff18");
      lineGrad.addColorStop(1,   "transparent");
      ctx.strokeStyle = lineGrad;
      ctx.lineWidth   = 1;
      ctx.setLineDash([6, 10]);
      ctx.beginPath();
      ctx.moveTo(0, PLAYER_ZONE_TOP);
      ctx.lineTo(CANVAS_W, PLAYER_ZONE_TOP);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ══════════════════════════════════════════════════════
    // ESTADO: MENU INICIAL
    // ══════════════════════════════════════════════════════
    if (state === "menu") {
      drawMenu(ctx, CANVAS_W, CANVAS_H, getHighScore(), time, difficultyModeRef.current, skinRef.current);
      ctx.restore();
      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // ════════════════════════════════════��═════════════════
    // ESTADO: GAME OVER
    // ══════════════════════════════════════════════════════
    if (state === "game_over") {
      particlesRef.current = updateParticles(particlesRef.current, dt);
      drawParticles(ctx, particlesRef.current);
      drawGameOver(ctx, CANVAS_W, CANVAS_H, finalScore, getHighScore(), time);
      ctx.restore();
      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // ══════════════════════════════════════════════════════
    // ESTADO: VITÓRIA
    // ══════════════════════════════════════════════════════
    if (state === "victory") {
      particlesRef.current = updateParticles(particlesRef.current, dt);
      drawParticles(ctx, particlesRef.current);
      drawVictory(ctx, CANVAS_W, CANVAS_H, finalScore, getHighScore(), time);
      ctx.restore();
      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // ══════════════════════════════════════════════════════
    // ESTADO: PHASE CLEAR (transição entre fases 1-4)
    // ══════════════════════════════════════════════════════
    if (state === "phase_clear") {
      phaseClearRef.current += dt;
      particlesRef.current = updateParticles(particlesRef.current, dt);
      drawParticles(ctx, particlesRef.current);
      if (player) drawPlayer(ctx, player, time, skinRef.current);
      drawPhaseClear(ctx, CANVAS_W, CANVAS_H, phase, phaseClearRef.current);

      // Após 2.5s avança para a próxima fase
      if (phaseClearRef.current > 2.5) {
        phaseClearRef.current = 0;
        const nextPhase = (phase + 1) as PhaseId;
        if (nextPhase === 5) {
          stateRef.current = "boss_intro";
          setGameState("boss_intro");
          initPhase(5);
        } else {
          initPhase(nextPhase);
          stateRef.current = "playing";
          setGameState("playing");
        }
      }
      ctx.restore();
      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // ══════════════════════════════════════════════════════
    // ESTADO: BOSS INTRO
    // ══════════════════════════════════════════════════════
    if (state === "boss_intro") {
      // Toca o som da intro do boss apenas uma vez (quando entra pela 1ª vez)
      if (bossIntroRef.current === 0) sfxBossIntroSound();
      bossIntroRef.current += dt;
      // Boss já está descendo durante a intro
      const boss = bossRef.current;
      if (boss) updateBossEntity(boss, dt);
      if (boss) drawBoss(ctx, boss, time);
      drawBossIntro(ctx, CANVAS_W, CANVAS_H, bossIntroRef.current);

      if (bossIntroRef.current > 3.0) {
        bossIntroRef.current = 0;
        stateRef.current = "playing";
        setGameState("playing");
      }
      ctx.restore();
      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // ══════════════════════════════════════════════════════
    // ESTADO: PAUSADO
    // ══════════════════════════════════════════════════════
    if (state === "paused") {
      // Desenha tudo parado
      drawBarriers(ctx, barriersRef.current);
      if (player) drawPlayer(ctx, player, time, skinRef.current);
      for (const e of enemiesRef.current) drawEnemy(ctx, e, time);
      const boss = bossRef.current;
      if (boss) drawBoss(ctx, boss, time);
      drawBullets(ctx, bulletsRef.current);
      drawParticles(ctx, particlesRef.current);
      if (player) drawHUD(ctx, CANVAS_W, CANVAS_H, player.score, getHighScore(), player.lives, phase,
        boss?.hp, boss?.maxHp, difficultyRef.current);
      drawPause(ctx, CANVAS_W, CANVAS_H);
      ctx.restore();
      rafRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // ══════════════════════════════════════════════════════
    // ESTADO: PHASE CLEAR — som único ao entrar no estado
    // ══════════════════════════════════════════════════════
    if (state === "phase_clear" && !phaseSoundPlayedRef.current) {
      sfxPhaseClear();
      phaseSoundPlayedRef.current = true;
    }
    if (state === "playing") phaseSoundPlayedRef.current = false;

    // ══════════════════════════════════════════════════════
    // ESTADO: PLAYING — LÓGICA PRINCIPAL
    // ══════════════════════════════════════════════════════
    if (state === "playing") {

      // ── Partículas ──
      particlesRef.current = updateParticles(particlesRef.current, dt);

      // ── Power-ups: move itens caindo e verifica coleta ──
      powerUpsRef.current = updatePowerUps(powerUpsRef.current, dt, CANVAS_H);
      checkPowerUpCollect();
      tickActivePowerUps(dt);

      // ──────────────────────────────────────────────────
      // SISTEMA DE DIFICULDADE PROGRESSIVA
      // ──────────────────────────────────────────────────
      // A dificuldade é um multiplicador (1.0 = base, 3.5 = máximo).
      // Ele cresce de duas formas:
      //   1. Por TEMPO DE JOGO: +0.04 por segundo — garante que
      //      o jogo fique progressivamente mais difícil mesmo se
      //      o jogador demorar para matar inimigos.
      //   2. Por FASE: cada fase começa com uma dificuldade mínima
      //      garantida — o jogador não pode "farmar" na fase 1.
      //   3. Por KILLS: cada 10 inimigos eliminados dá +0.08 —
      //      jogadores agressivos enfrentam mais desafio.
      // O valor é limitado em 3.5 para manter o jogo jogável.
      // ── Dificuldade progressiva com multiplicador do modo selecionado ──
      // phaseBase: valor mínimo garantido por fase (aumenta a cada fase)
      // phaseBaseAdd: bônus fixo do modo escolhido (ex: EXTREMO soma +1.0)
      // timeBonus: cresce com o tempo de jogo (jogo fica mais difícil com o tempo)
      // killBonus: cresce a cada 10 mortes acumuladas
      // O cap máximo também escala com o modo: FACIL→2.5, NORMAL→3.5, DIFICIL→4.5, EXTREMO→5.5
      gameTimeRef.current += dt;
      const modeMultipliers = DIFFICULTY_MULTIPLIERS[difficultyModeRef.current];
      const phaseBase       = [1.0, 1.3, 1.7, 2.1, 2.5][(phase as number) - 1] ?? 1.0;
      const adjustedBase    = Math.max(0.5, phaseBase + modeMultipliers.phaseBaseAdd);
      const timeBonus       = gameTimeRef.current * 0.014;
      const killBonus       = Math.floor(totalKillsRef.current / 10) * 0.07;
      const cap             = 2.5 + { FACIL: 0, NORMAL: 1, DIFICIL: 2, EXTREMO: 3 }[difficultyModeRef.current];
      difficultyRef.current = Math.min(cap, Math.max(adjustedBase, adjustedBase + timeBonus + killBonus));

      // ── Jogador: movimento com inércia (horizontal e vertical) ──
      if (player) {
        const k = keysRef.current;

        // Horizontal (A/D / setas esquerda-direita)
        if (k.left)       player.vx = lerp(player.vx, -PLAYER_CONFIG.speed, dt * 10);
        else if (k.right) player.vx = lerp(player.vx,  PLAYER_CONFIG.speed, dt * 10);
        else              player.vx = lerp(player.vx,  0,                   dt * 12);

        // Vertical (W/S / setas cima-baixo) — limitado à zona inferior do canvas
        if (k.up)         player.vy = lerp(player.vy, -PLAYER_CONFIG.speed, dt * 10);
        else if (k.down)  player.vy = lerp(player.vy,  PLAYER_CONFIG.speed, dt * 10);
        else              player.vy = lerp(player.vy,  0,                   dt * 12);

        player.x = clamp(player.x + player.vx * dt, player.w / 2 + 5, CANVAS_W - player.w / 2 - 5);
        // O jogador só pode mover-se dentro da metade inferior (zona de manobra)
        // Limite inferior = linha azul do HUD (h - 36) menos margem da nave
        player.y = clamp(player.y + player.vy * dt, PLAYER_ZONE_TOP + player.h / 2, CANVAS_H - 36 - player.h / 2 - 4);

        // Auto-fire: RAPID_FIRE reduz o intervalo entre tiros à metade
        const fireInterval = hasPowerUp("RAPID_FIRE")
          ? PLAYER_CONFIG.fireRate * 0.45
          : PLAYER_CONFIG.fireRate;
        player.fireTimer = Math.max(0, player.fireTimer - dt);
        if (k.fire && player.fireTimer <= 0) { playerFire(); player.fireTimer = fireInterval; }

        player.invincible   = Math.max(0, player.invincible - dt);
        player.thrusterAnim += dt;
      }

      // ── Projéteis ──
      bulletsRef.current = updateBullets(bulletsRef.current, dt, CANVAS_H, CANVAS_W);

      // ══════════════════════════════════════════════════
      // FASES 1-4: Grid de inimigos
      // ══════════════════════════════════════════��═══════
      if (phase < 5) {
        const enemies = enemiesRef.current;

        // Animação e flash dos inimigos
        for (const e of enemies) {
          e.animTimer += dt;
          if (e.animTimer > 0.5) { e.animFrame = (e.animFrame + 1) % 2; e.animTimer = 0; }
          if (e.flashTimer > 0)  e.flashTimer -= dt;
        }

        // ── Velocidade do grid (três multiplicadores empilhados) ──
        // 1. classicBoost: quanto menos inimigos, mais rápidos (mecânica clássica)
        // 2. diffBoost: sobe com tempo e kills (dificuldade progressiva)
        // 3. modeSpeedMult: multiplicador fixo do modo escolhido no menu (ex: EXTREMO = 1.9x)
        const total     = cfg.rows * cfg.cols;
        const remaining = enemies.length;
        const classicBoost  = remaining > 0 ? 1 + (1 - remaining / total) * 2.2 : 1;
        const diffBoost     = 1 + (difficultyRef.current - 1) * 0.30;
        const modeSpeedMult = DIFFICULTY_MULTIPLIERS[difficultyModeRef.current].speedMult;
        const speed         = cfg.enemySpeed * classicBoost * diffBoost * modeSpeedMult;

        // Move o grid horizontal e rebate nas bordas
        let hitWall = false;
        for (const e of enemies) {
          e.x += enemyDirRef.current * speed * dt;
          if (e.x < 5 || e.x + e.w > CANVAS_W - 5) hitWall = true;
        }
        if (hitWall) {
          enemyDirRef.current *= -1;
          for (const e of enemies) e.y += cfg.dropAmount; // desce uma fileira ao rebater
        }

        // Tiros dos inimigos
        enemyFire(phase);

        // Colisões
        checkPlayerVsEnemies();
        checkEnemyBulletsVsPlayer();
        checkEnemiesAtBase();

        // Tiros vs barreiras (ambos os lados destroem os blocos)
        bulletsRef.current = bulletsRef.current.filter(b =>
          b.fromPlayer ? !checkBarrierCollision(b, barriersRef.current) : !checkBarrierCollision(b, barriersRef.current)
        );

        // Fase concluída quando todos os inimigos foram eliminados
        if (enemies.length === 0 && stateRef.current === "playing") {
          stateRef.current = "phase_clear";
          setGameState("phase_clear");
          phaseClearRef.current = 0;
        }

      // ══════════════════════════════════════════════════
      // FASE 5: BOSS
      // ══════════════════════════════════════════════════
      } else {
        const boss = bossRef.current;
        if (boss) {
          updateBossEntity(boss, dt);
          checkPlayerVsBoss();
          checkEnemyBulletsVsPlayer();

          // Tiros do boss vs barreiras
          bulletsRef.current = bulletsRef.current.filter(b =>
            b.fromPlayer ? true : !checkBarrierCollision(b, barriersRef.current)
          );

          // Boss derrotado → vitória!
          if (boss.hp <= 0 && stateRef.current === "playing") {
            // Explosão enorme + som de vitória
            sfxBigExplosion();
            sfxVictory();
            particlesRef.current = [...particlesRef.current, ...createExplosion(boss.x, boss.y, 80, COLORS.explosion, 2.5)];
            triggerVictory();
          }
        }
      }

      // ══════════════════════════════════════════════════
      // RENDERIZAÇÃO (ordem: fundo → barreira → entidades → HUD)
      // ══════════════════════════════════════════════════
      drawBarriers(ctx, barriersRef.current);
      drawBullets(ctx, bulletsRef.current);
      drawParticles(ctx, particlesRef.current);

      // Power-ups caindo
      drawPowerUps(ctx, powerUpsRef.current, time);

      // Inimigos normais
      for (const e of enemiesRef.current) drawEnemy(ctx, e, time);

      // Boss
      const boss = bossRef.current;
      if (boss) drawBoss(ctx, boss, time);

      // Nave do jogador
      if (player) drawPlayer(ctx, player, time, skinRef.current);

      // HUD (por cima de tudo)
      if (player) drawHUD(ctx, CANVAS_W, CANVAS_H, player.score, getHighScore(), player.lives, phase,
        boss?.hp, boss?.maxHp, difficultyRef.current);

      // HUD de power-ups ativos (abaixo do HUD principal)
      drawActivePowerUps(ctx, CANVAS_W, CANVAS_H, activePowerUpsRef.current, time);
    }

    ctx.restore();
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [
    initPhase, triggerGameOver, triggerVictory,
    playerFire, enemyFire, bossFire,
    updateBossEntity,
    checkPlayerVsEnemies, checkPlayerVsBoss,
    checkEnemyBulletsVsPlayer, checkEnemiesAtBase,
    checkPowerUpCollect, tickActivePowerUps, hasPowerUp,
    finalScore,
  ]);

  // ──────────────────────────────────────────────────────────
  // INICIALIZAÇÃO DO LOOP E INPUTS
  // ──────────────────────────────────────────────────────────

  useEffect(() => {
    // Inicializa o campo de estrelas para o menu
    starsRef.current = createStarField(STAR_COUNT, CANVAS_W, CANVAS_H);
    setHighScore(getHighScore());

    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(gameLoop);

    return () => cancelAnimationFrame(rafRef.current);
  }, [gameLoop]);

  // ── Inputs de teclado ──
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const k = keysRef.current;
      if (e.key === "ArrowLeft"  || e.key === "a" || e.key === "A") k.left  = true;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") k.right = true;
      if (e.key === "ArrowUp"    || e.key === "w" || e.key === "W") { k.up   = true; e.preventDefault(); }
      if (e.key === "ArrowDown"  || e.key === "s" || e.key === "S") { k.down = true; e.preventDefault(); }
      if (e.key === " ") {
        e.preventDefault();
        // Espaço: jogar / reiniciar / atirar
        if (stateRef.current === "menu" || stateRef.current === "game_over" || stateRef.current === "victory") {
          startGame();
        } else {
          k.fire = true;
        }
      }
      if ((e.key === "p" || e.key === "P" || e.key === "Escape") && stateRef.current === "playing") {
        stateRef.current = "paused"; setGameState("paused");
      } else if ((e.key === "p" || e.key === "P" || e.key === "Escape") && stateRef.current === "paused") {
        stateRef.current = "playing"; setGameState("playing");
      }
      // M = voltar ao menu a partir da pausa
      if ((e.key === "m" || e.key === "M") && stateRef.current === "paused") {
        goToMenu();
      }
    };

    const onUp = (e: KeyboardEvent) => {
      const k = keysRef.current;
      if (e.key === "ArrowLeft"  || e.key === "a" || e.key === "A") k.left  = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") k.right = false;
      if (e.key === "ArrowUp"    || e.key === "w" || e.key === "W") k.up    = false;
      if (e.key === "ArrowDown"  || e.key === "s" || e.key === "S") k.down  = false;
      if (e.key === " ") k.fire = false;
    };

    // ── Clique do mouse: menu (dificuldade) e pausa (voltar ao menu) ──
    const onMouseClick = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Coordenadas do clique relativas ao canvas (com escala)
      const rect   = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      const mx     = (e.clientX - rect.left) * scaleX;
      const my     = (e.clientY - rect.top)  * scaleY;

      // ── Botões no menu (dificuldade, modelo, cor) ──
      if (stateRef.current === "menu") {
        // Botões de dificuldade
        const diffRects = getMenuDifficultyRects(CANVAS_W, CANVAS_H);
        for (const rect of diffRects) {
          if (mx >= rect.x && mx <= rect.x + rect.width && my >= rect.y && my <= rect.y + rect.height) {
            difficultyModeRef.current = rect.mode;
            setSelectedDifficulty(rect.mode);
            import("@/lib/game-audio").then(m => m.sfxMenuSelect());
            return;
          }
        }

        // Botões de modelo de nave
        const modelRects = getMenuModelRects(CANVAS_W, CANVAS_H);
        for (const rect of modelRects) {
          if (mx >= rect.x && mx <= rect.x + rect.width && my >= rect.y && my <= rect.y + rect.height) {
            const newSkin: PlayerSkin = { ...skinRef.current, model: rect.model };
            skinRef.current = newSkin;
            setSelectedSkin(newSkin);
            import("@/lib/game-audio").then(m => m.sfxMenuSelect());
            return;
          }
        }

        // Botões de cor de nave
        const colorRects = getMenuColorRects(CANVAS_W, CANVAS_H);
        for (const rect of colorRects) {
          if (mx >= rect.x && mx <= rect.x + rect.width && my >= rect.y && my <= rect.y + rect.height) {
            const newSkin: PlayerSkin = { ...skinRef.current, color: rect.color };
            skinRef.current = newSkin;
            setSelectedSkin(newSkin);
            import("@/lib/game-audio").then(m => m.sfxMenuSelect());
            return;
          }
        }
      }

      // ── Botão "VOLTAR AO MENU" na tela de pausa ──
      if (stateRef.current === "paused") {
        const btn = getPauseMenuButtonRect(CANVAS_W, CANVAS_H);
        if (mx >= btn.x && mx <= btn.x + btn.width && my >= btn.y && my <= btn.y + btn.height) {
          goToMenu();
        }
      }
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup",   onUp);
    window.addEventListener("click",   onMouseClick);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup",   onUp);
      window.removeEventListener("click",   onMouseClick);
    };
  }, [startGame, goToMenu]);

  // ──────────────────────────────────────────────────────────
  // CONTROLES TOUCH (mobile)
  // ──────────────────────────────────────────────────────────

  const touchLeft   = useCallback(() => { keysRef.current.left  = true;  }, []);
  const touchRight  = useCallback(() => { keysRef.current.right = true;  }, []);
  const touchUp     = useCallback(() => { keysRef.current.up    = true;  }, []);
  const touchDown   = useCallback(() => { keysRef.current.down  = true;  }, []);
  const touchStopDir = useCallback((dir: "left" | "right" | "up" | "down") => {
    keysRef.current[dir] = false;
  }, []);
  const touchStopAll   = useCallback(() => {
    keysRef.current.left  = false;
    keysRef.current.right = false;
    keysRef.current.up    = false;
    keysRef.current.down  = false;
  }, []);
  const touchFire   = useCallback(() => { keysRef.current.fire  = true;  }, []);
  const touchNoFire = useCallback(() => { keysRef.current.fire  = false; }, []);
  const touchStart = useCallback(() => {
    if (stateRef.current === "menu" || stateRef.current === "game_over" || stateRef.current === "victory") {
      startGame();
    }
  }, [startGame]);
  const touchPause = useCallback(() => {
    if (stateRef.current === "playing") {
      stateRef.current = "paused"; setGameState("paused");
    } else if (stateRef.current === "paused") {
      stateRef.current = "playing"; setGameState("playing");
    }
  }, []);

  // ── Handler de toque no canvas (para menus) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      // Previne zoom e scroll
      e.preventDefault();

      const touch = e.touches[0];
      if (!touch) return;

      const rect   = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      const mx     = (touch.clientX - rect.left) * scaleX;
      const my     = (touch.clientY - rect.top)  * scaleY;

      // ── Menu: seleção de dificuldade, modelo, cor ──
      if (stateRef.current === "menu") {
        // Botões de dificuldade
        const diffRects = getMenuDifficultyRects(CANVAS_W, CANVAS_H);
        for (const r of diffRects) {
          if (mx >= r.x && mx <= r.x + r.width && my >= r.y && my <= r.y + r.height) {
            difficultyModeRef.current = r.mode;
            setSelectedDifficulty(r.mode);
            import("@/lib/game-audio").then(m => m.sfxMenuSelect());
            return;
          }
        }
        // Botões de modelo de nave
        const modelRects = getMenuModelRects(CANVAS_W, CANVAS_H);
        for (const r of modelRects) {
          if (mx >= r.x && mx <= r.x + r.width && my >= r.y && my <= r.y + r.height) {
            const newSkin: PlayerSkin = { ...skinRef.current, model: r.model };
            skinRef.current = newSkin;
            setSelectedSkin(newSkin);
            import("@/lib/game-audio").then(m => m.sfxMenuSelect());
            return;
          }
        }
        // Botões de cor de nave
        const colorRects = getMenuColorRects(CANVAS_W, CANVAS_H);
        for (const r of colorRects) {
          if (mx >= r.x && mx <= r.x + r.width && my >= r.y && my <= r.y + r.height) {
            const newSkin: PlayerSkin = { ...skinRef.current, color: r.color };
            skinRef.current = newSkin;
            setSelectedSkin(newSkin);
            import("@/lib/game-audio").then(m => m.sfxMenuSelect());
            return;
          }
        }
      }

      // ── Pausa: voltar ao menu ──
      if (stateRef.current === "paused") {
        const btn = getPauseMenuButtonRect(CANVAS_W, CANVAS_H);
        if (mx >= btn.x && mx <= btn.x + btn.width && my >= btn.y && my <= btn.y + btn.height) {
          goToMenu();
        }
      }
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    return () => canvas.removeEventListener("touchstart", onTouchStart);
  }, [goToMenu, selectedSkin]);

  // ──────────────────────────────────────────────────────────
  // RENDER JSX
  // ──────────────────────────────────────────────────────────

  // Detecta se é mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768 || "ontouchstart" in window);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return (
    <div
      className="flex flex-col items-center justify-start md:justify-center min-h-screen w-full select-none overflow-hidden"
      style={{ 
        background: "#020209", 
        fontFamily: "'Courier New', monospace",
        touchAction: "none", // Previne gestos do navegador
      }}
    >
      {/* Container do jogo com borda neon */}
      <div
        className="relative flex-shrink-0"
        style={{
          border: "2px solid #00f5ff44",
          boxShadow: "0 0 40px #00f5ff22, 0 0 80px #00f5ff0a, inset 0 0 30px #00f5ff08",
          borderRadius: 4,
          marginTop: isMobile ? 4 : 0,
        }}
      >
        {/* Canvas principal — todo o jogo é desenhado aqui */}
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block max-w-[100vw]"
          style={{ 
            maxHeight: isMobile ? "calc(100vh - 180px)" : "none",
            touchAction: "none",
          }}
          aria-label="Space Invaders Neon"
        />
      </div>

      {/* Controles touch (visíveis apenas em mobile) */}
      {isMobile && (
        <div 
          className="w-full px-4 py-3 flex justify-between items-center"
          style={{ 
            background: "linear-gradient(180deg, #020209 0%, #0a0a15 100%)",
            maxWidth: CANVAS_W,
          }}
        >
          {/* D-pad esquerdo */}
          <div className="flex flex-col items-center gap-1">
            {/* Cima */}
            <button
              onTouchStart={(e) => { e.preventDefault(); touchUp(); }}
              onTouchEnd={(e) => { e.preventDefault(); touchStopDir("up"); }}
              style={touchBtnStyle}
              aria-label="Mover para cima"
            >
              <span style={{ fontSize: 20 }}>&#9650;</span>
            </button>
            {/* Esquerda / Direita */}
            <div className="flex gap-3">
              <button
                onTouchStart={(e) => { e.preventDefault(); touchLeft(); }}
                onTouchEnd={(e) => { e.preventDefault(); touchStopDir("left"); }}
                style={touchBtnStyle}
                aria-label="Mover para esquerda"
              >
                <span style={{ fontSize: 20 }}>&#9664;</span>
              </button>
              <button
                onTouchStart={(e) => { e.preventDefault(); touchRight(); }}
                onTouchEnd={(e) => { e.preventDefault(); touchStopDir("right"); }}
                style={touchBtnStyle}
                aria-label="Mover para direita"
              >
                <span style={{ fontSize: 20 }}>&#9654;</span>
              </button>
            </div>
            {/* Baixo */}
            <button
              onTouchStart={(e) => { e.preventDefault(); touchDown(); }}
              onTouchEnd={(e) => { e.preventDefault(); touchStopDir("down"); }}
              style={touchBtnStyle}
              aria-label="Mover para baixo"
            >
              <span style={{ fontSize: 20 }}>&#9660;</span>
            </button>
          </div>

          {/* Botões centrais: Pause / Menu */}
          <div className="flex flex-col gap-2">
            {gameState === "playing" && (
              <button
                onTouchStart={(e) => { e.preventDefault(); touchPause(); }}
                style={{ ...touchBtnSmall, background: "#ffaa0022", borderColor: "#ffaa00" }}
                aria-label="Pausar"
              >
                II
              </button>
            )}
            {gameState === "paused" && (
              <>
                <button
                  onTouchStart={(e) => { e.preventDefault(); touchPause(); }}
                  style={{ ...touchBtnSmall, background: "#00ff0022", borderColor: "#00ff00" }}
                  aria-label="Continuar"
                >
                  &#9654;
                </button>
                <button
                  onTouchStart={(e) => { e.preventDefault(); goToMenu(); }}
                  style={{ ...touchBtnSmall, background: "#ff000022", borderColor: "#ff5555" }}
                  aria-label="Menu"
                >
                  M
                </button>
              </>
            )}
          </div>

          {/* Botão FIRE direito */}
          <button
            onTouchStart={(e) => { e.preventDefault(); touchFire(); touchStart(); }}
            onTouchEnd={(e) => { e.preventDefault(); touchNoFire(); }}
            style={touchBtnFire}
            aria-label="Atirar"
          >
            <span style={{ fontSize: 14, fontWeight: "bold", letterSpacing: 2 }}>FIRE</span>
          </button>
        </div>
      )}

      {/* Legenda dos controles (desktop) */}
      {!isMobile && (
        <p
          className="mt-3 text-center"
          style={{ color: "#00f5ff55", fontSize: 12, letterSpacing: "0.15em" }}
        >
          WASD / SETAS = MOVER (4 DIREÇÕES) &nbsp;|&nbsp; ESPAÇO = ATIRAR &nbsp;|&nbsp; P / ESC = PAUSAR &nbsp;|&nbsp; M = MENU
        </p>
      )}
    </div>
  );
}

// Estilo dos botões touch (D-pad)
const touchBtnStyle: React.CSSProperties = {
  width: 56, 
  height: 48,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(180deg, #ffffff18 0%, #ffffff08 100%)",
  border: "2px solid #ffffff55",
  borderRadius: 10,
  color: "#ffffff",
  cursor: "pointer",
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTapHighlightColor: "transparent",
  boxShadow: "0 0 10px #ffffff11, inset 0 1px 0 #ffffff22",
};

// Estilo dos botões pequenos (pause/menu)
const touchBtnSmall: React.CSSProperties = {
  width: 44,
  height: 36,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#ffffff11",
  border: "2px solid #ffffff44",
  borderRadius: 8,
  color: "#ffffff",
  fontSize: 14,
  fontWeight: "bold",
  cursor: "pointer",
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTapHighlightColor: "transparent",
};

// Estilo do botão FIRE
const touchBtnFire: React.CSSProperties = {
  width: 80,
  height: 80,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "radial-gradient(circle, #00f5ff33 0%, #00f5ff11 70%, transparent 100%)",
  border: "3px solid #00f5ff",
  borderRadius: "50%",
  color: "#00f5ff",
  cursor: "pointer",
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTapHighlightColor: "transparent",
  boxShadow: "0 0 20px #00f5ff44, 0 0 40px #00f5ff22, inset 0 0 15px #00f5ff22",
};
