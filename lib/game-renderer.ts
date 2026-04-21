// ============================================================
// SPACE INVADERS NEON — RENDERER
// ============================================================
// Responsável por DESENHAR todos os elementos visuais do jogo
// no canvas 2D. Cada função recebe o contexto e os dados da entidade.
// ============================================================

import {
  COLORS, Star, Particle, Bullet, Enemy, Boss, Barrier, Player,
  PowerUp, ActivePowerUp,
  DifficultyMode, DIFFICULTY_MULTIPLIERS,
  PlayerSkin, ShipModel, ShipColor, SHIP_COLORS, SHIP_MODEL_LABELS,
  POWERUP_COLORS, POWERUP_LABELS, POWERUP_DURATION,
  getBossPhase, clamp,
} from "./game-engine";

// ──────────────────────────────────────────────────────────
// UTILITÁRIOS DE DESENHO
// ──────────────────────────────────────────────────────────

/** Salva estado, aplica brilho neon e restaura ao terminar */
function withGlow(ctx: CanvasRenderingContext2D, color: string, blur: number, fn: () => void): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur  = blur;
  fn();
  ctx.restore();
}

/** Desenha texto com efeito neon (double-pass para intensificar) */
export function glowText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  color: string, font: string,
  blur = 15, align: CanvasTextAlign = "center"
): void {
  ctx.save();
  ctx.font = font; ctx.textAlign = align;
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = blur;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = blur * 0.4;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ──────────────────────────────────────────────────────────
// FUNDO DO ESPAÇO
// ──────────────────────────────────────────────────────────

/** Converte cor hex #rrggbb para rgba(r,g,b,a) com alpha entre 0 e 1 */
function hexToRgba(hex: string, alpha: number): string {
  // Remove o # e extrai componentes RGB
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Fundo preto com gradiente radial sutil na cor de destaque da fase */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  bgColor = COLORS.background,
  accentColor = "#000020"
): void {
  // Preenche o fundo sólido
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);
  // Sobrepõe gradiente radial sutil usando rgba (canvas não aceita hex com alpha)
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
  g.addColorStop(0, hexToRgba(accentColor, 0.12));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Desenha o campo de estrelas com parallax visual */
export function drawStars(ctx: CanvasRenderingContext2D, stars: Star[]): void {
  for (const s of stars) {
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle   = COLORS.star;
    ctx.shadowColor = "#aaddff";
    ctx.shadowBlur  = s.size > 1 ? 4 : 0;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ──────────────────────────────────────────────────────────
// NAVE DO JOGADOR
// ──────────────────────────────────────────────────────────

// ── Helpers internos de desenho de nave ───────────────────

/** Desenha a chama do propulsor. posYBase = y de onde a chama sai (coords locais). */
function drawThruster(
  ctx: CanvasRenderingContext2D,
  cx: number, posYBase: number,
  thrusterAnim: number,
  color: string,
  wide = false
): void {
  const flameH = 10 + Math.sin(thrusterAnim * 20) * 5;
  const hw = wide ? 9 : 7;
  const tw = wide ? 4 : 3;
  const fg = ctx.createLinearGradient(0, posYBase, 0, posYBase + flameH);
  fg.addColorStop(0, color);
  fg.addColorStop(0.5, "#0033cc");
  fg.addColorStop(1, "transparent");
  ctx.fillStyle   = fg;
  ctx.shadowColor = color;
  ctx.shadowBlur  = 14;
  ctx.beginPath();
  ctx.moveTo(cx - hw, posYBase);
  ctx.lineTo(cx + hw, posYBase);
  ctx.lineTo(cx + tw, posYBase + flameH);
  ctx.lineTo(cx - tw, posYBase + flameH);
  ctx.closePath();
  ctx.fill();
}

/** Desenha o cockpit oval com reflexo interno. */
function drawCockpit(
  ctx: CanvasRenderingContext2D,
  cy: number, rx: number, ry: number,
  bodyColor: string
): void {
  ctx.fillStyle = "#001122";
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  // reflexo neon
  ctx.fillStyle   = bodyColor + "55";
  ctx.shadowColor = bodyColor;
  ctx.shadowBlur  = 8;
  ctx.beginPath();
  ctx.ellipse(-rx * 0.3, cy - ry * 0.3, rx * 0.45, ry * 0.45, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

// ── 4 sub-rotinas de modelo de nave ──────────────────────

export function drawShipPadrao(ctx: CanvasRenderingContext2D, w: number, h: number, col: string, ta: number): void {
  // Propulsor central
  drawThruster(ctx, 0, h / 2 - 2, ta, col);
  // Corpo triangular clássico
  ctx.fillStyle   = col;
  ctx.shadowColor = col;
  ctx.shadowBlur  = 18;
  ctx.beginPath();
  ctx.moveTo( 0,         -h / 2);
  ctx.lineTo( w / 2,     -h / 2 + h * 0.35);
  ctx.lineTo( w / 2 + 5, -h / 2 + h * 0.60);
  ctx.lineTo( w / 2 - 2,  h / 2);
  ctx.lineTo(-(w / 2 - 2), h / 2);
  ctx.lineTo(-(w / 2 + 5), -h / 2 + h * 0.60);
  ctx.lineTo(-w / 2,     -h / 2 + h * 0.35);
  ctx.closePath();
  ctx.fill();
  drawCockpit(ctx, -5, 8, 11, col);
}

export function drawShipAguia(ctx: CanvasRenderingContext2D, w: number, h: number, col: string, ta: number): void {
  // Dois propulsores laterais
  drawThruster(ctx, -w * 0.38, h / 2 - 4, ta, col);
  drawThruster(ctx,  w * 0.38, h / 2 - 4, ta, col);
  // Fuselagem central mais estreita
  ctx.fillStyle   = col;
  ctx.shadowColor = col;
  ctx.shadowBlur  = 20;
  ctx.beginPath();
  ctx.moveTo( 0,        -h / 2);          // nariz
  ctx.lineTo( w * 0.18, -h / 2 + h * 0.3);
  ctx.lineTo( w * 0.18,  h / 2);
  ctx.lineTo(-w * 0.18,  h / 2);
  ctx.lineTo(-w * 0.18, -h / 2 + h * 0.3);
  ctx.closePath();
  ctx.fill();
  // Asas largas — ponta muito pronunciada
  ctx.beginPath();
  ctx.moveTo(-w * 0.18, -h / 2 + h * 0.25);
  ctx.lineTo(-w / 2 - 10, -h / 2 + h * 0.65); // ponta asa esq
  ctx.lineTo(-w * 0.18,  h / 2 * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo( w * 0.18, -h / 2 + h * 0.25);
  ctx.lineTo( w / 2 + 10, -h / 2 + h * 0.65);
  ctx.lineTo( w * 0.18,  h / 2 * 0.6);
  ctx.closePath();
  ctx.fill();
  drawCockpit(ctx, -8, 6, 10, col);
}

function drawShipFantasma(ctx: CanvasRenderingContext2D, w: number, h: number, col: string, ta: number): void {
  // Propulsor central largo
  drawThruster(ctx, 0, h / 2, ta, col, true);
  // Corpo ovalado/disco
  ctx.fillStyle   = col;
  ctx.shadowColor = col;
  ctx.shadowBlur  = 22;
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2 + 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Anel externo mais escuro
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth   = 2;
  ctx.shadowBlur  = 6;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2 + 9, h / 2 + 4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // Antenas
  ctx.strokeStyle = col;
  ctx.lineWidth   = 2;
  ctx.shadowBlur  = 8;
  ctx.beginPath(); ctx.moveTo(-8, -h / 2); ctx.lineTo(-12, -h / 2 - 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( 8, -h / 2); ctx.lineTo( 12, -h / 2 - 10); ctx.stroke();
  drawCockpit(ctx, -4, 9, 7, col);
}

function drawShipArma(ctx: CanvasRenderingContext2D, w: number, h: number, col: string, ta: number): void {
  // Propulsor central
  drawThruster(ctx, 0, h / 2 - 1, ta, col);
  // Fuselagem muito estreita e comprida
  const fw = w * 0.22;
  ctx.fillStyle   = col;
  ctx.shadowColor = col;
  ctx.shadowBlur  = 16;
  ctx.beginPath();
  ctx.moveTo(0,    -h / 2);       // ponta do nariz
  ctx.lineTo( fw,  -h / 2 + h * 0.45);
  ctx.lineTo( fw,   h / 2);
  ctx.lineTo(-fw,   h / 2);
  ctx.lineTo(-fw,  -h / 2 + h * 0.45);
  ctx.closePath();
  ctx.fill();
  // Mini asas angulares agressivas
  ctx.beginPath();
  ctx.moveTo(-fw, -h / 2 + h * 0.38);
  ctx.lineTo(-w / 2 - 4, -h / 2 + h * 0.55);
  ctx.lineTo(-w / 2 + 2, -h / 2 + h * 0.72);
  ctx.lineTo(-fw,  h / 2 * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo( fw, -h / 2 + h * 0.38);
  ctx.lineTo( w / 2 + 4, -h / 2 + h * 0.55);
  ctx.lineTo( w / 2 - 2, -h / 2 + h * 0.72);
  ctx.lineTo( fw,  h / 2 * 0.3);
  ctx.closePath();
  ctx.fill();
  // Linhas de detalhe militares
  ctx.save();
  ctx.strokeStyle = col + "88";
  ctx.lineWidth   = 1;
  ctx.shadowBlur  = 0;
  ctx.beginPath(); ctx.moveTo(-fw + 2, -h * 0.1); ctx.lineTo(-fw + 2, h * 0.3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( fw - 2, -h * 0.1); ctx.lineTo( fw - 2, h * 0.3); ctx.stroke();
  ctx.restore();
  drawCockpit(ctx, -h * 0.12, 5, 9, col);
}

/**
 * Desenha a nave do jogador usando a skin selecionada.
 * Aceita um PlayerSkin opcional; se omitido usa o modelo PADRAO cor CIANO.
 */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: Player,
  time: number,
  skin: PlayerSkin = { model: "PADRAO", color: "CIANO" }
): void {
  const { x, y, w, h, invincible, thrusterAnim } = player;

  // Pisca durante a invencibilidade
  if (invincible > 0 && Math.floor(invincible * 8) % 2 === 0) return;

  const col = SHIP_COLORS[skin.color] ?? "#00f5ff";

  ctx.save();
  ctx.translate(x, y); // origem no centro da nave

  switch (skin.model) {
    case "AGUIA":    drawShipAguia(ctx, w, h, col, thrusterAnim);    break;
    case "FANTASMA": drawShipFantasma(ctx, w, h, col, thrusterAnim); break;
    case "ARMA":     drawShipArma(ctx, w, h, col, thrusterAnim);     break;
    default:         drawShipPadrao(ctx, w, h, col, thrusterAnim);   break;
  }

  ctx.restore();
}

// ──────────────────────────────────────────────────────────
// INIMIGOS
// ──────────────────────────────────────────────────────────

function enemyColor(type: string): string {
  const map: Record<string, string> = {
    A: COLORS.enemyA,
    B: COLORS.enemyB,
    C: COLORS.enemyC,
    D: COLORS.enemyD,
  };
  return map[type] ?? "#ffffff";
}

/** Desenha um inimigo com design único por tipo e animação de 2 frames */
export function drawEnemy(ctx: CanvasRenderingContext2D, enemy: Enemy, _time: number): void {
  const { x, y, w, h, type, animFrame, flashTimer } = enemy;
  const color = enemyColor(type);
  const cx = x + w / 2;
  const cy = y + h / 2;

  ctx.save();
  ctx.translate(cx, cy);

  // Flash branco ao tomar dano
  const fc = flashTimer > 0 ? `rgba(255,255,255,${clamp(flashTimer * 4, 0, 1)})` : color;
  ctx.fillStyle   = fc;
  ctx.strokeStyle = fc;
  ctx.shadowColor = fc;
  ctx.shadowBlur  = 14;

  if (type === "A") {
    // ── TIPO A: Medusa (magenta) ──
    // Cabeça redonda
    ctx.beginPath();
    ctx.arc(0, -4, 10, 0, Math.PI * 2);
    ctx.fill();
    // Olhos
    ctx.fillStyle = flashTimer > 0 ? "#fff" : "#330022";
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(-4, -5, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc( 4, -5, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Tentáculos animados (alternam posição)
    ctx.fillStyle   = fc;
    ctx.shadowColor = fc;
    ctx.shadowBlur  = 10;
    const legXs = animFrame === 0 ? [-10, -5, 0, 5, 10] : [-12, -4, 0, 4, 12];
    for (const lx of legXs) {
      ctx.beginPath();
      ctx.moveTo(lx - 2, 2);
      ctx.lineTo(lx + 2, 2);
      ctx.lineTo(lx,     12);
      ctx.closePath();
      ctx.fill();
    }

  } else if (type === "B") {
    // ── TIPO B: Caranguejo (laranja) ──
    // Corpo oval central
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Garras laterais alternadas
    const gy = animFrame === 0 ? -3 : 3;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 12,  0);
      ctx.lineTo(s * 19, gy);
      ctx.lineTo(s * 17, gy + 5);
      ctx.lineTo(s * 12,  4);
      ctx.closePath();
      ctx.fill();
    }
    // Olhos
    ctx.fillStyle = "#220000";
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(-4, -1, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc( 4, -1, 2, 0, Math.PI * 2);
    ctx.fill();

  } else if (type === "C") {
    // ── TIPO C: Polvo (verde) ──
    // Cabeça
    ctx.beginPath();
    ctx.arc(0, -3, 11, 0, Math.PI * 2);
    ctx.fill();
    // Tentáculos curvados
    const txs = animFrame === 0 ? [-10, -6, -2, 2, 6, 10] : [-11, -5, -1, 1, 5, 11];
    ctx.lineWidth   = 2.5;
    ctx.strokeStyle = fc;
    ctx.shadowColor = fc;
    ctx.shadowBlur  = 10;
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      const ty = i % 2 === 0 ? 11 : 8;
      const cp = i % 2 === 0 ? -3 : 3;
      ctx.beginPath();
      ctx.moveTo(tx, 4);
      ctx.quadraticCurveTo(tx + cp, 7, tx, ty);
      ctx.stroke();
    }
    // Olhos
    ctx.fillStyle = "#002200";
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(-4, -4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc( 4, -4, 2.5, 0, Math.PI * 2);
    ctx.fill();

  } else if (type === "D") {
    // ── TIPO D: Aranha Estelar (amarelo) ──
    // Corpo hexagonal
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = Math.cos(a) * 11, py = Math.sin(a) * 8;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    // Patas rígidas (4 pares alternando)
    ctx.lineWidth   = 2;
    ctx.strokeStyle = fc;
    ctx.shadowBlur  = 8;
    const angs = [0.15, 0.35, 0.65, 0.85].map(a => a * Math.PI);
    for (const ang of angs) {
      const sign = animFrame === 0 ? 1 : -1;
      for (const s of [-1, 1]) {
        const a = ang * s;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 11, Math.sin(a) * 8);
        ctx.lineTo(Math.cos(a) * (16 + sign * 2), Math.sin(a) * (14 + sign * 2));
        ctx.stroke();
      }
    }
    // Núcleo brilhante
    ctx.fillStyle   = "#ffff8855";
    ctx.shadowBlur  = 0;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ──────────────────────────────────────────────────────────
// BOSS: ALMIRANTE NECROX
// ──────────────────────────────────────────────────────────

/** Desenha o boss com aura, escudo giratório, olho central, canhões e propulsores */
export function drawBoss(ctx: CanvasRenderingContext2D, boss: Boss, time: number): void {
  const bPhase = getBossPhase(boss);
  const pulse  = Math.sin(time * 4) * 0.5 + 0.5;
  const hpRatio = boss.hp / boss.maxHp;

  const bColors = ["#ff0066", "#ff6600", "#ff0000"];
  const bColor  = bColors[bPhase - 1];
  const dc      = boss.flashTimer > 0 ? "#ffffff" : bColor;

  const W = boss.w, H = boss.h;

  ctx.save();
  ctx.translate(boss.x, boss.y);

  // ── Aura radial ao redor do boss ──
  const aura = ctx.createRadialGradient(0, 0, 20, 0, 0, W * 0.9);
  aura.addColorStop(0, hexToRgba(bColor, 0.16));
  aura.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.ellipse(0, 0, W * 0.9, H * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Escudo giratório (ativo na fase 2+) ──
  if (boss.shieldActive) {
    ctx.save();
    ctx.rotate(time * 2);
    ctx.strokeStyle = COLORS.bossShield;
    ctx.lineWidth   = 3 + pulse * 2;
    ctx.shadowColor = COLORS.bossShield;
    ctx.shadowBlur  = 22;
    ctx.setLineDash([14, 9]);
    ctx.beginPath();
    ctx.ellipse(0, 0, W * 0.75, H * 0.72, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Corpo principal (nave-mãe) ──
  ctx.fillStyle   = dc;
  ctx.shadowColor = dc;
  ctx.shadowBlur  = 24 + pulse * 12;
  ctx.beginPath();
  ctx.moveTo( 0,         -H / 2);
  ctx.lineTo( W / 2 + 10, -H / 2 + H * 0.30);
  ctx.lineTo( W / 2 + 22,  0);
  ctx.lineTo( W / 2,       H / 2 * 0.6);
  ctx.lineTo( W / 3,       H / 2);
  ctx.lineTo(-W / 3,       H / 2);
  ctx.lineTo(-W / 2,       H / 2 * 0.6);
  ctx.lineTo(-(W / 2 + 22), 0);
  ctx.lineTo(-(W / 2 + 10), -H / 2 + H * 0.30);
  ctx.closePath();
  ctx.fill();

  // ── Cockpit escuro ──
  ctx.fillStyle  = "#110000";
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.ellipse(0, -10, 22, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Olho/núcleo (brilho varia com fase) ──
  const eyeColor = bPhase >= 3 ? "#ff0000" : bPhase >= 2 ? "#ff8800" : "#ff00ff";
  ctx.fillStyle   = eyeColor;
  ctx.shadowColor = eyeColor;
  ctx.shadowBlur  = 28 + pulse * 14;
  ctx.beginPath();
  ctx.arc(0, -10, 10 + pulse * 3, 0, Math.PI * 2);
  ctx.fill();
  // Reflexo do olho
  ctx.fillStyle  = "#ffffff77";
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(-3, -13, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // ── Canhões laterais ──
  for (const s of [-1, 1]) {
    const cx = s * (W / 2 + 6);
    const cy = H * 0.1;
    ctx.fillStyle   = hexToRgba(dc === "#ffffff" ? "#ffffff" : dc, 0.8);
    ctx.shadowBlur  = 8;
    ctx.shadowColor = dc;
    ctx.fillRect(cx - 5, cy - 4, 10, 22);
    // Boca do canhão (pulsa)
    const muzzle = Math.sin(time * 8) > 0.7 ? "#ff8800" : "#440000";
    ctx.fillStyle   = muzzle;
    ctx.shadowColor = muzzle;
    ctx.shadowBlur  = 14;
    ctx.beginPath();
    ctx.arc(cx, cy + 20, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Rachaduras de dano (aparecem conforme o boss perde vida) ──
  if (hpRatio < 0.66) {
    ctx.strokeStyle = "#ff440055"; ctx.lineWidth = 1.5; ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(-15, -20); ctx.lineTo(-5, -5); ctx.lineTo(-20, 0);
    ctx.stroke();
  }
  if (hpRatio < 0.33) {
    ctx.strokeStyle = "#ff440077";
    ctx.beginPath();
    ctx.moveTo(10, -15); ctx.lineTo(20, 0); ctx.lineTo(8, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, 15); ctx.lineTo(5, 25); ctx.lineTo(-8, 30);
    ctx.stroke();
  }

  // ── Propulsores traseiros animados ──
  for (const tx of [-25, 0, 25]) {
    const fH = 15 + Math.sin(time * 15 + tx * 0.3) * 7;
    const fg  = ctx.createLinearGradient(tx, H / 2, tx, H / 2 + fH);
    fg.addColorStop(0, bColor);
    fg.addColorStop(1, "transparent");
    ctx.fillStyle   = fg;
    ctx.shadowColor = bColor;
    ctx.shadowBlur  = 14;
    ctx.beginPath();
    ctx.moveTo(tx - 6, H / 2);
    ctx.lineTo(tx + 6, H / 2);
    ctx.lineTo(tx + 2, H / 2 + fH);
    ctx.lineTo(tx - 2, H / 2 + fH);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

// ──────────────────────────────────────────────────────────
// PROJÉTEIS
// ──────────────────────────────────────────────────────────

/** Desenha todos os projéteis: losango (jogador) ou plasma oval (inimigos) */
export function drawBullets(ctx: CanvasRenderingContext2D, bullets: Bullet[]): void {
  for (const b of bullets) {
    ctx.save();
    ctx.shadowColor = b.glowColor;
    ctx.shadowBlur  = 14;
    ctx.fillStyle   = b.color;

    if (b.fromPlayer) {
      // Losango vertical fino e brilhante
      const bx = b.x, by = b.y, bw = b.w, bh = b.h;
      ctx.beginPath();
      ctx.moveTo(bx + bw / 2, by);
      ctx.lineTo(bx + bw,     by + bh / 2);
      ctx.lineTo(bx + bw / 2, by + bh);
      ctx.lineTo(bx,           by + bh / 2);
      ctx.closePath();
      ctx.fill();
    } else {
      // Plasma oval
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Núcleo branco
      ctx.fillStyle = "#ffffff";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 4, b.h / 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ──────────────────────────────────────────────────────────
// PARTÍCULAS
// ──────────────────────────────────────────────────────────

/** Desenha partículas de explosão com fade baseado em vida restante */
export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const p of particles) {
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ──────────────────────────────────────────────────────────
// BARREIRAS
// ──────────────────────────────────────────────────────────

/** Desenha os blocos intactos das 4 barreiras */
export function drawBarriers(ctx: CanvasRenderingContext2D, barriers: Barrier[]): void {
  for (const bar of barriers) {
    for (let row = 0; row < bar.rows; row++) {
      for (let col = 0; col < bar.cols; col++) {
        if (!bar.blocks[row][col]) continue;
        const bx = bar.x + col * bar.blockW;
        const by = bar.y + row * bar.blockH;
        ctx.save();
        ctx.fillStyle   = COLORS.shield;
        ctx.shadowColor = COLORS.shield;
        ctx.shadowBlur  = 5;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(bx, by, bar.blockW - 1, bar.blockH - 1);
        ctx.restore();
      }
    }
  }
}

// ──────────────────────────────────────────────────────────
// HUD (interface durante o jogo)
// ──────────────────────────────────────────────────────────

/** Desenha pontuação, recorde, vidas, fase e barra de vida do boss */
export function drawHUD(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  score: number,
  highScore: number,
  lives: number,
  phase: number,
  bossHp?: number,
  bossMaxHp?: number,
  // Multiplicador de dificuldade atual (1.0 = fácil, 3.5 = máximo)
  difficulty = 1.0
): void {
  const font = "bold 14px 'Courier New', monospace";

  // ── Pontuação (esquerda) ──
  glowText(ctx, `PONTOS: ${String(score).padStart(7, "0")}`, 16, 24, COLORS.hud, font, 10, "left");

  // ── Recorde (centro) ──
  glowText(ctx, `RECORD: ${String(highScore).padStart(7, "0")}`, w / 2, 24, COLORS.hud, font, 10, "center");

  // ── Fase + dificuldade (direita) ──
  // A cor do nível de dificuldade vai de ciano → amarelo → vermelho
  const diffLabel = difficulty < 1.8 ? "FACIL" : difficulty < 2.4 ? "MEDIO" : difficulty < 3.0 ? "DIFICIL" : "EXTREMO";
  const diffColor = difficulty < 1.8 ? "#00f5ff" : difficulty < 2.4 ? "#ffff00" : difficulty < 3.0 ? "#ff8800" : "#ff2244";
  glowText(ctx, `FASE: ${phase === 5 ? "BOSS" : phase}`, w - 16, 24, COLORS.hud, font, 10, "right");
  glowText(ctx, diffLabel, w - 16, 40, diffColor, "bold 10px 'Courier New', monospace", 8, "right");

  // ── Linhas decorativas horizontais ──
  ctx.save();
  const lineG = ctx.createLinearGradient(0, 0, w, 0);
  lineG.addColorStop(0, "transparent");
  lineG.addColorStop(0.2, COLORS.hud);
  lineG.addColorStop(0.8, COLORS.hud);
  lineG.addColorStop(1, "transparent");
  ctx.strokeStyle = lineG;
  ctx.lineWidth = 1;
  ctx.shadowColor = COLORS.hud;
  ctx.shadowBlur = 5;
  ctx.beginPath(); ctx.moveTo(0, 32); ctx.lineTo(w, 32); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, h - 36); ctx.lineTo(w, h - 36); ctx.stroke();
  ctx.restore();

  // ── Indicadores de vida (mini-naves) ──
  glowText(ctx, "VIDAS:", 16, h - 14, COLORS.hud, font, 8, "left");
  for (let i = 0; i < lives; i++) {
    const lx = 82 + i * 28, ly = h - 22;
    ctx.save();
    ctx.fillStyle   = COLORS.playerBody;
    ctx.shadowColor = COLORS.playerBody;
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.moveTo(lx,      ly - 8);
    ctx.lineTo(lx + 9,  ly + 3);
    ctx.lineTo(lx - 9,  ly + 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ── Barra de vida do Boss ──
  if (bossHp !== undefined && bossMaxHp !== undefined && bossMaxHp > 0) {
    const barW = w * 0.6, barH = 16;
    const barX = (w - barW) / 2, barY = 42;
    const ratio = clamp(bossHp / bossMaxHp, 0, 1);

    glowText(ctx, "ALMIRANTE NECROX", w / 2, barY - 4, "#ff0066",
      "bold 10px 'Courier New', monospace", 12, "center");

    // Fundo da barra
    ctx.save();
    ctx.fillStyle = "#220000";
    ctx.fillRect(barX, barY, barW, barH);

    // Barra de vida (cor muda com %)
    const hpColor = ratio > 0.66 ? "#ff0066" : ratio > 0.33 ? "#ff6600" : "#ff0000";
    ctx.fillStyle   = hpColor;
    ctx.shadowColor = hpColor;
    ctx.shadowBlur  = 10;
    ctx.fillRect(barX, barY, barW * ratio, barH);

    // Borda
    ctx.strokeStyle = "#ff006688";
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
    ctx.strokeRect(barX, barY, barW, barH);
    ctx.restore();
  }
}

// ──────────────────────────────────────────────────────────
// TELAS DE TRANSIÇÃO
// ──────────────────────────────────────────────────────────

/** Overlay "FASE X CONCLUÍDA" entre as fases normais */
export function drawPhaseClear(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  phase: number,
  progress: number // 0-1 (fade)
): void {
  ctx.save();
  ctx.globalAlpha = Math.min(progress * 3, 1);

  // Overlay escuro
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, w, h);

  const cy = h / 2;
  glowText(ctx, `FASE ${phase} CONCLUÍDA!`, w / 2, cy - 24,
    "#00ff88", "bold 36px 'Courier New', monospace", 25, "center");
  glowText(ctx, "PREPARANDO PRÓXIMA FASE...", w / 2, cy + 20,
    "#00ffcc", "bold 15px 'Courier New', monospace", 14, "center");

  ctx.restore();
}

/** Overlay de introdução do BOSS com efeito dramático */
export function drawBossIntro(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  progress: number // 0-1
): void {
  ctx.save();
  ctx.globalAlpha = Math.min(progress * 3, 1);

  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.fillRect(0, 0, w, h);

  const cy = h / 2;
  const flicker = Math.sin(progress * 60) > 0.3 ? 1 : 0.7;
  ctx.globalAlpha *= flicker;

  glowText(ctx, "ATENÇÃO!", w / 2, cy - 60,
    "#ff0066", "bold 42px 'Courier New', monospace", 30, "center");
  glowText(ctx, "ALMIRANTE NECROX", w / 2, cy,
    "#ff0066", "bold 30px 'Courier New', monospace", 25, "center");
  glowText(ctx, "aproximando-se...", w / 2, cy + 44,
    "#ff8888", "bold 16px 'Courier New', monospace", 12, "center");

  ctx.restore();
}

/**
 * Tela de menu inicial.
 * Recebe a dificuldade atualmente selecionada para realçar o botão correto.
 * O clique nos botões é tratado pelo componente React via coordenadas do mouse —
 * esta função apenas DESENHA a interface no canvas.
 */
// ──────────────────────────────────────────────────────────
// GEOMETRIA DOS BOTOES DO MENU (compartilhada com handler de clique)
// ──────────────────────────────────────────────────────────

/** Retorna as geometrias dos botoes de dificuldade no menu */
export function getMenuDifficultyRects(w: number, h: number) {
  const modes: DifficultyMode[] = ["FACIL", "NORMAL", "DIFICIL", "EXTREMO"];
  const btnW = 140, btnH = 36, gap = 12;
  const totalW = modes.length * btnW + (modes.length - 1) * gap;
  const startX = (w - totalW) / 2;
  const startY = h / 2 - 160;
  return modes.map((mode, i) => ({
    mode,
    x: startX + i * (btnW + gap), y: startY,
    width: btnW, height: btnH,
  }));
}

/** Retorna as geometrias dos botoes de modelo de nave no menu */
export function getMenuModelRects(w: number, h: number) {
  const models: ShipModel[] = ["PADRAO", "AGUIA", "FANTASMA", "ARMA"];
  const btnW = 110, btnH = 70, gap = 14;
  const totalW = models.length * btnW + (models.length - 1) * gap;
  const startX = (w - totalW) / 2;
  const startY = h / 2 - 76;
  return models.map((model, i) => ({
    model,
    x: startX + i * (btnW + gap), y: startY,
    width: btnW, height: btnH,
  }));
}

/** Retorna as geometrias dos botoes de cor de nave no menu */
export function getMenuColorRects(w: number, h: number) {
  const colors: ShipColor[] = ["CIANO", "MAGENTA", "DOURADO", "VERDE"];
  const btnW = 110, btnH = 32, gap = 14;
  const totalW = colors.length * btnW + (colors.length - 1) * gap;
  const startX = (w - totalW) / 2;
  const startY = h / 2 + 8;
  return colors.map((color, i) => ({
    color,
    x: startX + i * (btnW + gap), y: startY,
    width: btnW, height: btnH,
  }));
}

// ──────────────────────────────────────────────────────────
// HELPER: desenha um botao de menu generico com borda neon
// ──────────────────────────────────────────────────────────
function drawMenuButton(
  ctx: CanvasRenderingContext2D,
  bx: number, by: number, bw: number, bh: number,
  label: string, color: string,
  selected: boolean
): void {
  const r = 5;
  ctx.save();
  ctx.fillStyle   = selected ? color + "28" : "#ffffff08";
  ctx.shadowColor = selected ? color : "transparent";
  ctx.shadowBlur  = selected ? 16 : 0;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.arcTo(bx + bw, by,       bx + bw, by + r,       r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.arcTo(bx + bw, by + bh,  bx + bw - r, by + bh,  r);
  ctx.lineTo(bx + r,  by + bh);
  ctx.arcTo(bx,       by + bh, bx, by + bh - r,        r);
  ctx.lineTo(bx,      by + r);
  ctx.arcTo(bx,       by,      bx + r, by,              r);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = selected ? color : "#ffffff22";
  ctx.lineWidth   = selected ? 2 : 1;
  ctx.stroke();
  glowText(ctx, label, bx + bw / 2, by + bh / 2 + 5,
    selected ? color : "#ffffff55",
    `bold 11px 'Courier New', monospace`,
    selected ? 10 : 0, "center");
  ctx.restore();
}

export function drawMenu(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  highScore: number,
  time: number,
  selectedDifficulty: DifficultyMode = "NORMAL",
  selectedSkin: PlayerSkin = { model: "PADRAO", color: "CIANO" }
): void {
  const pulse = Math.sin(time * 2) * 0.15 + 0.85;

  // ── Titulo principal ──
  glowText(ctx, "SPACE", w / 2, h / 2 - 310,
    "#00f5ff", `bold ${Math.floor(56 * pulse)}px 'Courier New', monospace`, 35, "center");
  glowText(ctx, "INVADERS", w / 2, h / 2 - 255,
    "#ff00ff", `bold ${Math.floor(56 * pulse)}px 'Courier New', monospace`, 35, "center");
  glowText(ctx, "N E O N", w / 2, h / 2 - 222,
    "#ffff00", "bold 18px 'Courier New', monospace", 18, "center");

  // ── Divisor ──
  const divider = (y: number, alpha = "44") => {
    ctx.save();
    ctx.strokeStyle = `#00f5ff${alpha}`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 210, y); ctx.lineTo(w / 2 + 210, y);
    ctx.stroke();
    ctx.restore();
  };

  divider(h / 2 - 200);

  // ── Secao: DIFICULDADE ──
  glowText(ctx, "DIFICULDADE", w / 2, h / 2 - 182,
    "#ffffff88", "bold 11px 'Courier New', monospace", 6, "center");

  const diffRects = getMenuDifficultyRects(w, h);
  for (const rect of diffRects) {
    const cfg = DIFFICULTY_MULTIPLIERS[rect.mode];
    drawMenuButton(ctx, rect.x, rect.y, rect.width, rect.height,
      cfg.label, cfg.color, rect.mode === selectedDifficulty);
  }

  divider(h / 2 - 110, "22");

  // ── Secao: NAVE — MODELO ──
  glowText(ctx, "MODELO DA NAVE", w / 2, h / 2 - 94,
    "#ffffff88", "bold 11px 'Courier New', monospace", 6, "center");

  const modelRects = getMenuModelRects(w, h);
  const models: ShipModel[] = ["PADRAO", "AGUIA", "FANTASMA", "ARMA"];
  const skinColor = SHIP_COLORS[selectedSkin.color] ?? "#00f5ff";

  for (let i = 0; i < modelRects.length; i++) {
    const rect  = modelRects[i];
    const model = models[i];
    const isSel = model === selectedSkin.model;

    // Fundo + borda do slot
    ctx.save();
    ctx.fillStyle   = isSel ? skinColor + "22" : "#ffffff08";
    ctx.shadowColor = isSel ? skinColor : "transparent";
    ctx.shadowBlur  = isSel ? 14 : 0;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 5);
    ctx.fill();
    ctx.strokeStyle = isSel ? skinColor : "#ffffff22";
    ctx.lineWidth   = isSel ? 2 : 1;
    ctx.stroke();
    ctx.restore();

    // Mini preview da nave desenhada dentro do slot
    ctx.save();
    ctx.translate(rect.x + rect.width / 2, rect.y + rect.height * 0.52);
    const scale = 0.72;
    ctx.scale(scale, scale);
    const fakePl = { x: 0, y: 0, w: 44, h: 36, invincible: 0, thrusterAnim: time };
    switch (model) {
      case "AGUIA":    drawShipAguia(ctx, fakePl.w, fakePl.h, isSel ? skinColor : "#ffffff44", time);    break;
      case "FANTASMA": drawShipFantasma(ctx, fakePl.w, fakePl.h, isSel ? skinColor : "#ffffff44", time); break;
      case "ARMA":     drawShipArma(ctx, fakePl.w, fakePl.h, isSel ? skinColor : "#ffffff44", time);     break;
      default:         drawShipPadrao(ctx, fakePl.w, fakePl.h, isSel ? skinColor : "#ffffff44", time);   break;
    }
    ctx.restore();

    // Rotulo abaixo do preview
    glowText(ctx, SHIP_MODEL_LABELS[model],
      rect.x + rect.width / 2, rect.y + rect.height + 12,
      isSel ? skinColor : "#ffffff44",
      `bold 9px 'Courier New', monospace`,
      isSel ? 8 : 0, "center");
  }

  // ── Secao: COR DA NAVE ──
  glowText(ctx, "COR DA NAVE", w / 2, h / 2 - 8,
    "#ffffff88", "bold 11px 'Courier New', monospace", 6, "center");

  const colorRects = getMenuColorRects(w, h);
  const shipColors: ShipColor[] = ["CIANO", "MAGENTA", "DOURADO", "VERDE"];
  for (let i = 0; i < colorRects.length; i++) {
    const rect  = colorRects[i];
    const sc    = shipColors[i];
    const hex   = SHIP_COLORS[sc];
    const isSel = sc === selectedSkin.color;

    ctx.save();
    ctx.fillStyle   = isSel ? hex + "30" : hex + "0a";
    ctx.shadowColor = isSel ? hex : "transparent";
    ctx.shadowBlur  = isSel ? 14 : 0;
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 5);
    ctx.fill();
    ctx.strokeStyle = isSel ? hex : hex + "44";
    ctx.lineWidth   = isSel ? 2 : 1;
    ctx.stroke();
    // Circulo de cor centralizado + label
    ctx.fillStyle   = hex;
    ctx.shadowColor = hex;
    ctx.shadowBlur  = isSel ? 10 : 4;
    ctx.beginPath();
    ctx.arc(rect.x + 20, rect.y + rect.height / 2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Label centralizado apos o circulo
    glowText(ctx, sc, rect.x + rect.width / 2 + 10, rect.y + rect.height / 2 + 4,
      isSel ? hex : hex + "99",
      `bold 10px 'Courier New', monospace`,
      isSel ? 8 : 0, "center");
  }

  divider(h / 2 + 52, "22");

  // ── Botao JOGAR piscante ──
  const blink = Math.floor(time * 2) % 2 === 0;
  if (blink) {
    glowText(ctx, ">> PRESSIONE ESPACO PARA JOGAR <<", w / 2, h / 2 + 72,
      "#ffffff", "bold 14px 'Courier New', monospace", 12, "center");
  }

  glowText(ctx, "WASD / SETAS = MOVER (4 DIR)   |   ESPACO = ATIRAR   |   P = PAUSAR   |   M = MENU",
    w / 2, h / 2 + 98,
    "#00f5ff55", "10px 'Courier New', monospace", 5, "center");

  glowText(ctx, `RECORDE: ${String(highScore).padStart(7, "0")}`,
    w / 2, h / 2 + 124,
    "#ff00ff", "bold 13px 'Courier New', monospace", 12, "center");

  // ── Legenda dos inimigos ──
  const types = [
    { color: "#ff00ff", label: "10 pts" },
    { color: "#ff8800", label: "20 pts" },
    { color: "#00ff88", label: "40 pts" },
    { color: "#ffff00", label: "80 pts" },
  ];
  const legendY = h / 2 + 160;
  const startXL = w / 2 - 170;
  for (let i = 0; i < types.length; i++) {
    const lx = startXL + i * 88;
    const t  = types[i];
    ctx.save();
    ctx.translate(lx, legendY);
    ctx.fillStyle   = t.color;
    ctx.shadowColor = t.color;
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.arc(0, -4, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    glowText(ctx, `= ${t.label}`, lx + 34, legendY + 4,
      t.color, "11px 'Courier New', monospace", 5, "left");
  }
}

/** Tela de Game Over */
export function drawGameOver(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  score: number,
  highScore: number,
  time: number
): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.88)";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  glowText(ctx, "GAME OVER", w / 2, h / 2 - 80,
    "#ff2244", "bold 54px 'Courier New', monospace", 35, "center");
  glowText(ctx, `PONTUAÇÃO FINAL: ${String(score).padStart(7, "0")}`,
    w / 2, h / 2 - 14,
    "#ffffff", "bold 18px 'Courier New', monospace", 14, "center");
  glowText(ctx, `RECORDE: ${String(highScore).padStart(7, "0")}`,
    w / 2, h / 2 + 20,
    "#ff00ff", "bold 16px 'Courier New', monospace", 12, "center");

  const blink = Math.floor(time * 2) % 2 === 0;
  if (blink) {
    glowText(ctx, "PRESSIONE ESPAÇO PARA RECOMEÇAR", w / 2, h / 2 + 70,
      "#00f5ff", "bold 15px 'Courier New', monospace", 12, "center");
  }
}

/** Tela de Vitória */
export function drawVictory(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  score: number,
  highScore: number,
  time: number
): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.88)";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  const pulse = Math.sin(time * 3) * 0.15 + 0.85;
  glowText(ctx, "VITÓRIA!", w / 2, h / 2 - 90,
    `rgba(0,255,136,${pulse})`, "bold 60px 'Courier New', monospace", 40, "center");
  glowText(ctx, "ALMIRANTE NECROX DERROTADO!", w / 2, h / 2 - 30,
    "#ffff00", "bold 18px 'Courier New', monospace", 16, "center");
  glowText(ctx, `PONTUAÇÃO FINAL: ${String(score).padStart(7, "0")}`,
    w / 2, h / 2 + 16,
    "#ffffff", "bold 18px 'Courier New', monospace", 12, "center");
  glowText(ctx, `RECORDE: ${String(highScore).padStart(7, "0")}`,
    w / 2, h / 2 + 50,
    "#ff00ff", "bold 14px 'Courier New', monospace", 10, "center");

  const blink = Math.floor(time * 2) % 2 === 0;
  if (blink) {
    glowText(ctx, "PRESSIONE ESPAÇO PARA JOGAR NOVAMENTE", w / 2, h / 2 + 96,
      "#00f5ff", "bold 13px 'Courier New', monospace", 10, "center");
  }
}

/** Overlay de Pausa */
export function drawPause(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  glowText(ctx, "PAUSADO", w / 2, h / 2 - 50,
    "#00f5ff", "bold 44px 'Courier New', monospace", 30, "center");

  glowText(ctx, "P / ESC  =  CONTINUAR", w / 2, h / 2 + 8,
    "#ffffff99", "bold 14px 'Courier New', monospace", 8, "center");

  // Linha separadora
  ctx.save();
  ctx.strokeStyle = "#ffffff22";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 140, h / 2 + 30);
  ctx.lineTo(w / 2 + 140, h / 2 + 30);
  ctx.stroke();
  ctx.restore();

  // Botão "VOLTAR AO MENU" — desenhado como retângulo clicável
  // A geometria aqui deve ser idêntica à usada no handler de clique do componente.
  // Dimensões: 200×40, centralizado, topo em h/2 + 42
  const btnW = 200, btnH = 40;
  const bx   = w / 2 - btnW / 2;
  const by   = h / 2 + 42;
  const r    = 4;

  ctx.save();
  ctx.fillStyle   = "#ff224422";
  ctx.shadowColor = "#ff2244";
  ctx.shadowBlur  = 12;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + btnW - r, by);
  ctx.arcTo(bx + btnW, by, bx + btnW, by + r, r);
  ctx.lineTo(bx + btnW, by + btnH - r);
  ctx.arcTo(bx + btnW, by + btnH, bx + btnW - r, by + btnH, r);
  ctx.lineTo(bx + r, by + btnH);
  ctx.arcTo(bx, by + btnH, bx, by + btnH - r, r);
  ctx.lineTo(bx, by + r);
  ctx.arcTo(bx, by, bx + r, by, r);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#ff224488";
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.restore();

  glowText(ctx, "VOLTAR AO MENU", w / 2, by + btnH / 2 + 5,
    "#ff2244", "bold 14px 'Courier New', monospace", 12, "center");
}

/**
 * Retorna a geometria do botão "VOLTAR AO MENU" da tela de pausa.
 * Compartilhado com o handler de clique do componente para manter consistência.
 */
export function getPauseMenuButtonRect(w: number, h: number): { x: number; y: number; width: number; height: number } {
  const btnW = 200, btnH = 40;
  return { x: w / 2 - btnW / 2, y: h / 2 + 42, width: btnW, height: btnH };
}

// ──────────────────────────────────────────────────────────
// POWER-UPS: ITEM CAINDO
// ──────────────────────────────────────────────────────────

/**
 * Desenha todos os power-ups que estão caindo na tela.
 * Cada item tem: um ícone de letra, borda neon pulsante e brilho.
 */
export function drawPowerUps(
  ctx: CanvasRenderingContext2D,
  powerUps: PowerUp[],
  time: number
): void {
  for (const pu of powerUps) {
    const color  = POWERUP_COLORS[pu.type];
    const pulse  = 0.75 + Math.sin(time * 5 + pu.x) * 0.25; // pulso de brilho
    const cx     = pu.x;
    const cy     = pu.y;
    const r      = pu.w / 2;

    ctx.save();

    // Sombra neon ao redor
    ctx.shadowColor = color;
    ctx.shadowBlur  = 18 * pulse;

    // Hexágono preenchido (fundo escuro translúcido)
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `${color}22`;
    ctx.fill();

    // Borda neon do hexágono
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2 * pulse;
    ctx.stroke();

    // Letra identificadora do power-up (1 char)
    const iconMap: Record<string, string> = {
      TRIPLE_SHOT: "3",
      RAPID_FIRE:  "R",
      SHIELD:      "S",
      PIERCE:      "P",
      BOMB:        "B",
    };
    ctx.font      = `bold 13px 'Courier New', monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowBlur = 10;
    ctx.fillText(iconMap[pu.type] ?? "?", cx, cy);

    ctx.restore();
  }
}

// ──────────────────────────────────────────────────────────
// POWER-UPS: HUD DE STATUS (power-ups ativos do jogador)
// ──────────────────────────────────────────────────────────

/**
 * Exibe uma barra de ícones no canto inferior esquerdo mostrando
 * quais power-ups estão ativos e quanto tempo resta em cada um.
 */
export function drawActivePowerUps(
  ctx: CanvasRenderingContext2D,
  _w: number,
  h: number,
  active: ActivePowerUp[],
  time: number
): void {
  if (active.length === 0) return;

  const slotW  = 80;
  const slotH  = 34;
  const gap    = 6;
  const startX = 10;
  const startY = h - 44;

  for (let i = 0; i < active.length; i++) {
    const a     = active[i];
    const color = POWERUP_COLORS[a.type];
    const label = POWERUP_LABELS[a.type];
    const bx    = startX + i * (slotW + gap);
    const by    = startY;

    // Calcular progresso do timer (para barra de tempo)
    const maxDur = POWERUP_DURATION[a.type];
    const prog   = maxDur > 0 ? Math.max(0, a.timeLeft / maxDur) : 1;

    // Piscar quando estiver acabando (< 20% do tempo)
    const isCritical = maxDur > 0 && prog < 0.2;
    const blinkAlpha = isCritical ? (0.5 + Math.sin(time * 10) * 0.5) : 1;

    ctx.save();
    ctx.globalAlpha = blinkAlpha;

    // Fundo do slot
    ctx.fillStyle   = `${color}18`;
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.roundRect(bx, by, slotW, slotH, 4);
    ctx.fill();
    ctx.stroke();

    // Barra de progresso de tempo
    if (maxDur > 0) {
      ctx.fillStyle = `${color}44`;
      ctx.beginPath();
      ctx.roundRect(bx + 2, by + slotH - 6, (slotW - 4) * prog, 4, 2);
      ctx.fill();
    }

    // Rótulo
    ctx.shadowBlur  = 6;
    ctx.font        = `bold 11px 'Courier New', monospace`;
    ctx.fillStyle   = color;
    ctx.textAlign   = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, bx + slotW / 2, by + slotH / 2 - 4);

    // Tempo restante (ou "ATIVO" para power-ups permanentes)
    ctx.font      = `10px 'Courier New', monospace`;
    ctx.fillStyle = `${color}cc`;
    const timeStr = maxDur > 0 ? `${Math.ceil(a.timeLeft)}s` : "ATIVO";
    ctx.fillText(timeStr, bx + slotW / 2, by + slotH / 2 + 7);

    ctx.restore();
  }
}
