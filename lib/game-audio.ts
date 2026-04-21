// ============================================================
// SPACE INVADERS NEON — SISTEMA DE ÁUDIO SINTETIZADO
// ============================================================
// Usa a Web Audio API para gerar todos os sons proceduralmente,
// sem precisar de nenhum arquivo externo. Cada função cria um
// oscilador ou buffer de ruído e o toca uma única vez.
// ============================================================

// Contexto global de áudio (criado na primeira interação do usuário)
let _ctx: AudioContext | null = null;

/** Retorna (ou cria) o AudioContext compartilhado */
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  // Resume caso o browser tenha suspendido por falta de interação
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

// ──────────────────────────────────────────────────────────
// PRIMITIVAS DE SÍNTESE
// ──────────────────────────────────────────────────────────

/**
 * Toca um oscilador com envelope ADSR simples.
 * @param freq      frequência inicial (Hz)
 * @param freqEnd   frequência final (Hz) — cria portamento
 * @param type      forma de onda: sine | square | sawtooth | triangle
 * @param volume    volume pico (0-1)
 * @param duration  duração em segundos
 * @param attack    tempo de ataque em segundos
 * @param decay     tempo de decaimento em segundos
 */
function playTone(
  freq: number,
  freqEnd: number,
  type: OscillatorType,
  volume: number,
  duration: number,
  attack  = 0.005,
  decay   = duration * 0.8
): void {
  const ctx = getAudioCtx();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Nó de ganho (envelope de volume)
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + attack);          // ataque
  gain.gain.exponentialRampToValueAtTime(0.001, now + attack + decay); // decaimento
  gain.connect(ctx.destination);

  // Oscilador principal
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration); // portamento
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + duration);
}

/**
 * Gera ruído branco por um curto período (explosões/impactos).
 * @param volume   volume pico (0-1)
 * @param duration duração em segundos
 * @param filterFreq frequência do filtro passa-baixa (Hz) — afeta o timbre
 */
function playNoise(volume: number, duration: number, filterFreq = 800): void {
  const ctx = getAudioCtx();
  if (!ctx) return;

  const bufSize = ctx.sampleRate * duration;
  const buffer  = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data    = buffer.getChannelData(0);

  // Preenche com amostras aleatórias (ruído branco)
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // Filtro passa-baixa para dar "corpo" ao som
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;
  source.connect(filter);

  // Envelope de decaimento rápido
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  filter.connect(gain);
  gain.connect(ctx.destination);

  source.start(ctx.currentTime);
  source.stop(ctx.currentTime + duration);
}

// ──────────────────────────────────────────────────────────
// SONS DO JOGO
// ──────────────────────────────────────────────────────────

/**
 * Som do tiro do JOGADOR — laser fino e agudo com queda rápida.
 * Tom: onda quadrada, 880 Hz → 220 Hz, 0.12 s.
 */
export function sfxPlayerShoot(): void {
  playTone(880, 220, "square", 0.18, 0.12, 0.003, 0.11);
}

/**
 * Som do tiro dos INIMIGOS NORMAIS — tom mais grave e ameaçador.
 * Tom: sawtooth, 320 Hz → 80 Hz, 0.18 s.
 */
export function sfxEnemyShoot(): void {
  playTone(320, 80, "sawtooth", 0.12, 0.18, 0.005, 0.16);
}

/**
 * Som do tiro do BOSS — mais grave e pesado.
 * Tom: sawtooth, 160 Hz → 40 Hz, com camada de ruído.
 */
export function sfxBossShoot(): void {
  playTone(160, 40, "sawtooth", 0.22, 0.25, 0.005, 0.22);
  playNoise(0.08, 0.15, 500);
}

/**
 * Som de EXPLOSÃO de inimigo normal — estalo curto com ruído.
 * Combina um "thud" de baixa frequência + ruído filtrado.
 */
export function sfxEnemyExplode(): void {
  playNoise(0.35, 0.22, 1200);
  playTone(120, 30, "sine", 0.25, 0.18, 0.003, 0.15);
}

/**
 * Som de EXPLOSÃO GRANDE (boss derrotado, game over).
 * Ruído longo + camadas de tom decrescente.
 */
export function sfxBigExplosion(): void {
  playNoise(0.7, 0.6, 600);
  playTone(200, 20, "sawtooth", 0.4, 0.5, 0.005, 0.45);
  playTone(350, 40, "square",   0.2, 0.4, 0.01,  0.35);
}

/**
 * Som de DANO no jogador — impacto agudo e curto com ruído.
 */
export function sfxPlayerHit(): void {
  playNoise(0.5, 0.3, 2000);
  playTone(600, 100, "square", 0.3, 0.25, 0.003, 0.22);
}

/**
 * Som de ESCUDO do boss se ativando — tom elevado cristalino.
 */
export function sfxShieldUp(): void {
  playTone(1200, 1800, "sine", 0.2, 0.3, 0.01, 0.25);
  playTone(900,  1400, "sine", 0.1, 0.3, 0.01, 0.25);
}

/**
 * Som de ESCUDO do boss quebrando — explosão mais aguda.
 */
export function sfxShieldBreak(): void {
  playNoise(0.5, 0.4, 3000);
  playTone(1600, 200, "square", 0.3, 0.35, 0.003, 0.3);
}

/**
 * Som de FASE CONCLUÍDA — jingle ascendente curto.
 * Toca 3 notas em sequência (C4 → E4 → G4 → C5).
 */
export function sfxPhaseClear(): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const notes = [261.6, 329.6, 392.0, 523.3]; // C4, E4, G4, C5
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, freq * 0.98, "sine", 0.25, 0.22, 0.01, 0.18), i * 120);
  });
}

/**
 * Som da INTRO DO BOSS — tom ominoso e pesado.
 */
export function sfxBossIntro(): void {
  playTone(80, 40, "sawtooth", 0.4, 1.2, 0.02, 1.1);
  playTone(60, 30, "square",   0.2, 1.2, 0.02, 1.1);
}

/**
 * Som de VITÓRIA — jingle de vitória (5 notas ascendentes).
 */
export function sfxVictory(): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const notes = [261.6, 329.6, 392.0, 523.3, 659.3]; // C4, E4, G4, C5, E5
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, freq, "sine", 0.3, 0.35, 0.01, 0.28), i * 150);
  });
}

/**
 * Som de MENU / SELEÇÃO — clique sutil.
 */
export function sfxMenuSelect(): void {
  playTone(440, 480, "sine", 0.15, 0.08, 0.005, 0.07);
}

/**
 * Som da CARGA DO BOSS (quando avança em direção ao jogador).
 */
export function sfxBossCharge(): void {
  playTone(150, 600, "sawtooth", 0.35, 0.4, 0.01, 0.35);
  playNoise(0.2, 0.3, 400);
}
