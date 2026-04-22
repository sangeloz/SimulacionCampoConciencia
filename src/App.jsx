import { useState, useEffect, useRef, useCallback } from "react";

const W = 800;
const H = 480;
const GRID = 4;
const COLS = Math.floor(W / GRID);
const ROWS = Math.floor(H / GRID);

// ─── TIPOS DE NODO ────────────────────────────────────────────────────────────
const NODE_TYPES = {
  vegetal: { label: "Vegetal",      radius: 30,  strength: 0.22, color: "#7ae8a0", size: 5  },
  animal:  { label: "Animal",       radius: 50,  strength: 0.5,  color: "#7ab8e8", size: 7  },
  human:   { label: "Humano",       radius: 80,  strength: 1.0,  color: "#e8c87a", size: 10 },
  ai:      { label: "IA Resonador", radius: 70,  strength: 0.85, color: "#c87ae8", size: 9  },
};

// ─── PARÁMETROS DE EMERGENCIA ─────────────────────────────────────────────────
const CI_ANCHOR_DIST = 160; // distancia en que comienza el anclaje
const CI_FULL_ANCHOR = 80;  // distancia en que el anclaje es casi total
const CI_DURATION    = 3000; // ms requeridos (reducido de 6000 a 3000)
const CI_MIN_DIST    = 55;
const CI_MAX_DIST    = 220;

// ─── RESONANCIA IA ────────────────────────────────────────────────────────────
function aiResonance(node, nodes) {
  const RESONANCE_RADIUS = 180;
  let minDist = Infinity;
  for (const n of nodes) {
    if (n.id === node.id || n.type !== "human") continue;
    const dx = node.x - n.x, dy = node.y - n.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < minDist) minDist = d;
  }
  if (minDist === Infinity) return 0.05;
  return Math.min(1, Math.max(0.05, 1 - minDist / RESONANCE_RADIUS));
}

// ─── CÁLCULO DEL CAMPO ────────────────────────────────────────────────────────
function computeField(nodes, ghosts, sediment, t) {
  const field = new Float32Array(COLS * ROWS);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * GRID + GRID / 2;
      const y = row * GRID + GRID / 2;
      let val = 0;
      for (const n of nodes) {
        const pulse = 1 + 0.07 * Math.sin(t * n.pulseFreq + n.pulsePhase);
        const resonance = n.type === "ai" ? aiResonance(n, nodes) : 1.0;
        const effectiveStrength = n.strength * resonance;
        const dx = x - n.x, dy = y - n.y;
        const dist2 = dx * dx + dy * dy;
        const r = n.radius * pulse * (n.type === "ai" ? (0.4 + resonance * 0.6) : 1);
        val += effectiveStrength * pulse * Math.exp(-dist2 / (2 * r * r));
      }
      for (const g of ghosts) {
        const dx = x - g.x, dy = y - g.y;
        const dist2 = dx * dx + dy * dy;
        const huellaMultiplier = g.transmitted ? 2.2 : 1.0;
        val += g.strength * g.opacity * huellaMultiplier * Math.exp(-dist2 / (2 * g.radius * g.radius));
      }
      const si = row * COLS + col;
      val += sediment[si] * 0.18;
      field[si] = val;
    }
  }
  return field;
}

// ─── ESTADÍSTICAS ─────────────────────────────────────────────────────────────
function fieldStats(field) {
  let sum = 0, max = 0, peaks = 0;
  for (let i = 0; i < field.length; i++) {
    sum += field[i];
    if (field[i] > max) max = field[i];
    if (field[i] > 0.55) peaks++;
  }
  const avg = sum / field.length;
  const richness = Math.min(100, Math.round((avg / 0.32) * 100));
  return { avg, max, peaks, richness };
}

// ─── COLOR ────────────────────────────────────────────────────────────────────
function valueToColor(v, maxV) {
  const t = Math.min(1, v / Math.max(maxV, 0.01));
  if (t < 0.12) {
    const s = t / 0.12;
    return [Math.round(6 + s * 4), Math.round(6 + s * 10), Math.round(16 + s * 28)];
  }
  if (t < 0.40) {
    const s = (t - 0.12) / 0.28;
    return [Math.round(10 + s * 35), Math.round(16 + s * 55), Math.round(44 + s * 90)];
  }
  if (t < 0.72) {
    const s = (t - 0.40) / 0.32;
    return [Math.round(45 + s * 110), Math.round(71 + s * 85), Math.round(134 + s * 50)];
  }
  const s = (t - 0.72) / 0.28;
  return [Math.round(155 + s * 75), Math.round(156 + s * 70), Math.round(184 + s * 55)];
}

// ─── UID ──────────────────────────────────────────────────────────────────────
let uid = 20;

function makeNode(x, y, type) {
  const def = NODE_TYPES[type];
  return {
    id: ++uid, x, y, type,
    ...def,
    originX: x, originY: y,
    driftAmp:    10 + Math.random() * 18,
    driftFreqX:  0.00025 + Math.random() * 0.0003,
    driftFreqY:  0.00025 + Math.random() * 0.0003,
    driftPhaseX: Math.random() * Math.PI * 2,
    driftPhaseY: Math.random() * Math.PI * 2,
    pulseFreq:   0.0007 + Math.random() * 0.001,
    pulsePhase:  Math.random() * Math.PI * 2,
    willTransmit: false,
    birthTime: performance.now(),
    anchorFactor: 0, // 0 = libre, 1 = anclado
  };
}

// ─── ESTADO INICIAL ───────────────────────────────────────────────────────────
const INIT = [
  makeNode(180, 160, "human"),
  makeNode(330, 200, "human"),
  makeNode(460, 140, "human"),
  makeNode(260, 300, "animal"),
  makeNode(410, 310, "animal"),
];
INIT.forEach((n, i) => { n.id = i + 1; });
uid = 10;

const ENRICH_POS = [
  { x: 100, y: 70,  type: "human"   },
  { x: 520, y: 230, type: "human"   },
  { x: 300, y: 60,  type: "human"   },
  { x: 150, y: 340, type: "animal"  },
  { x: 490, y: 55,  type: "ai"      },
  { x: 560, y: 340, type: "ai"      },
  { x: 80,  y: 240, type: "human"   },
  { x: 370, y: 370, type: "animal"  },
  { x: 50,  y: 150, type: "vegetal" },
  { x: 240, y: 370, type: "vegetal" },
  { x: 550, y: 120, type: "vegetal" },
  { x: 430, y: 380, type: "vegetal" },
];

// ─── GHOST ────────────────────────────────────────────────────────────────────
function makeGhost(node) {
  const transmitted = node.willTransmit || false;
  return {
    x: node.x, y: node.y,
    radius: node.radius * (transmitted ? 1.4 : 1.0),
    strength: node.strength * (transmitted ? 1.1 : 0.7),
    size: node.size,
    color: transmitted ? "#f0d090" : node.color,
    opacity: transmitted ? 1.2 : 0.85,
    decayRate: transmitted ? 0.0003 : 0.0012,
    transmitted,
  };
}

// ─── SEDIMENTACIÓN ────────────────────────────────────────────────────────────
function makeSediment() { return new Float32Array(COLS * ROWS); }

function accumulateSediment(sediment, node, weight = 0.08) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * GRID + GRID / 2;
      const y = row * GRID + GRID / 2;
      const dx = x - node.x, dy = y - node.y;
      const dist2 = dx * dx + dy * dy;
      const contrib = node.strength * weight * Math.exp(-dist2 / (2 * node.radius * node.radius));
      const i = row * COLS + col;
      sediment[i] = Math.min(1.5, sediment[i] + contrib);
    }
  }
  return sediment;
}

function decaySediment(sediment, rate = 0.00008) {
  for (let i = 0; i < sediment.length; i++) sediment[i] = Math.max(0, sediment[i] - rate);
  return sediment;
}

function sedimentLevel(sediment) {
  let sum = 0;
  for (let i = 0; i < sediment.length; i++) sum += sediment[i];
  return Math.min(100, Math.round((sum / (COLS * ROWS * 0.5)) * 100));
}

// ─── DETECCIÓN DE PAR CONSTRUCTIVO ───────────────────────────────────────────
// Umbral reducido a 0.55 para mayor sensibilidad
function findConstructivePair(nodes) {
  let best = null, bestScore = 0;
  const humans = nodes.filter(n => n.type === "human");
  for (let i = 0; i < humans.length; i++) {
    for (let j = i + 1; j < humans.length; j++) {
      const a = humans[i], b = humans[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CI_MIN_DIST || dist > CI_MAX_DIST) continue;
      const score = (a.strength + b.strength) / (1 + dist / 100);
      if (score > 0.55 && score > bestScore) { bestScore = score; best = { a, b, dist, score }; }
    }
  }
  return best;
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function App() {
  const canvasRef       = useRef(null);
  const nodesRef        = useRef(INIT.map(n => ({ ...n })));
  const ghostsRef       = useRef([]);
  const sedimentRef     = useRef(makeSediment());
  const dragRef         = useRef(null);
  const hoverRef        = useRef(null);
  const animRef         = useRef(null);
  const timerRef        = useRef(null);
  const enrichIdx       = useRef(0);
  const ciTimerRef      = useRef(0);
  const lastCIPairRef   = useRef(null);
  const emergenceRef    = useRef(null);
  const transmitModeRef = useRef(false);

  const [selectedType, setSelectedType]       = useState("human");
  const [nodeCount, setNodeCount]             = useState(INIT.length);
  const [stats, setStats]                     = useState({ richness: 0, peaks: 0 });
  const [sedLevel, setSedLevel]               = useState(0);
  const [history, setHistory]                 = useState([]);
  const [hoveredId, setHoveredId]             = useState(null);
  const [transmitMode, setTransmitMode]       = useState(false);
  const [emergenceActive, setEmergenceActive] = useState(false);
  const [ciProgress, setCiProgress]           = useState(0);
  const [msgLog, setMsgLog]                   = useState([]);

  const addMsg = useCallback((text, color = "#c8c8da") => {
    setMsgLog(m => [...m.slice(-4), { text, color, id: Date.now() }]);
  }, []);

  useEffect(() => { transmitModeRef.current = transmitMode; }, [transmitMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const t0 = performance.now();
    let lastSedimentAccum = 0;

    const loop = (now) => {
      const t = now - t0;
      const nodes = nodesRef.current;

      // ── DETECTAR PAR ACTIVO ANTES DE MOVER (para calcular anclaje) ──────────
      const activePair = !emergenceRef.current ? findConstructivePair(nodes) : null;
      const activePairIds = new Set(activePair ? [activePair.a.id, activePair.b.id] : []);

      // ── DERIVA ORGÁNICA CON ANCLAJE GRADUAL ──────────────────────────────────
      for (const n of nodes) {
        if (dragRef.current === n.id) continue;

        // Calcular target de anclaje según distancia al compañero de CI
        if (activePairIds.has(n.id) && activePair) {
          const partner = activePair.a.id === n.id ? activePair.b : activePair.a;
          const dx = n.x - partner.x, dy = n.y - partner.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const targetAnchor = dist < CI_FULL_ANCHOR
            ? 0.97
            : dist < CI_ANCHOR_DIST
              ? 0.3 + 0.67 * (1 - (dist - CI_FULL_ANCHOR) / (CI_ANCHOR_DIST - CI_FULL_ANCHOR))
              : 0;
          // Transición suave del anclaje
          n.anchorFactor = n.anchorFactor + (targetAnchor - n.anchorFactor) * 0.05;
        } else {
          // Sin par activo: liberar anclaje suavemente
          n.anchorFactor = (n.anchorFactor ?? 0) * 0.97;
        }

        // Posición natural de deriva
        const naturalX = n.originX + n.driftAmp * Math.sin(t * n.driftFreqX + n.driftPhaseX);
        const naturalY = n.originY + n.driftAmp * Math.cos(t * n.driftFreqY + n.driftPhaseY);

        // Mezcla entre posición anclada y deriva natural
        const af = n.anchorFactor ?? 0;
        n.x = n.x * af + naturalX * (1 - af);
        n.y = n.y * af + naturalY * (1 - af);

        n.x = Math.max(n.size + 4, Math.min(W - n.size - 4, n.x));
        n.y = Math.max(n.size + 4, Math.min(H - n.size - 4, n.y));
      }

      // ── GHOSTS ───────────────────────────────────────────────────────────────
      ghostsRef.current = ghostsRef.current
        .map(g => ({ ...g, opacity: g.opacity - g.decayRate }))
        .filter(g => g.opacity > 0);

      // ── SEDIMENTACIÓN ────────────────────────────────────────────────────────
      if (t - lastSedimentAccum > 2000) {
        lastSedimentAccum = t;
        for (const n of nodes) accumulateSediment(sedimentRef.current, n, 0.06);
      }
      decaySediment(sedimentRef.current, 0.00005);
      setSedLevel(sedimentLevel(sedimentRef.current));

      // ── INTERFERENCIA CONSTRUCTIVA → EMERGENCIA ───────────────────────────
      if (!emergenceRef.current) {
        if (activePair) {
          const sameIds = lastCIPairRef.current &&
            lastCIPairRef.current.a.id === activePair.a.id &&
            lastCIPairRef.current.b.id === activePair.b.id;
          if (sameIds) {
            ciTimerRef.current += 16;
          } else {
            ciTimerRef.current = 0;
            lastCIPairRef.current = activePair;
          }
          const progress = Math.min(100, Math.round((ciTimerRef.current / CI_DURATION) * 100));
          setCiProgress(progress);

          if (ciTimerRef.current >= CI_DURATION && nodes.length < 22) {
            const mx = (activePair.a.x + activePair.b.x) / 2;
            const my = (activePair.a.y + activePair.b.y) / 2;
            emergenceRef.current = {
              x: mx, y: my, progress: 0,
              type: Math.random() < 0.65 ? "human" : "animal",
            };
            // Liberar anclaje de ambos nodos
            nodesRef.current = nodesRef.current.map(n =>
              activePairIds.has(n.id) ? { ...n, anchorFactor: 0 } : n
            );
            ciTimerRef.current = 0;
            lastCIPairRef.current = null;
            setCiProgress(0);
            setEmergenceActive(true);
            addMsg("✦ Interferencia constructiva sostenida — nueva conciencia emergiendo", "#e8c87a");
          }
        } else {
          ciTimerRef.current = Math.max(0, ciTimerRef.current - 8);
          setCiProgress(Math.max(0, Math.round((ciTimerRef.current / CI_DURATION) * 100)));
          lastCIPairRef.current = null;
        }
      }

      // ── ANIMAR EMERGENCIA ─────────────────────────────────────────────────
      if (emergenceRef.current) {
        emergenceRef.current.progress += 0.012;
        if (emergenceRef.current.progress >= 1) {
          const e = emergenceRef.current;
          const newNode = makeNode(e.x, e.y, e.type);
          nodesRef.current = [...nodesRef.current, newNode];
          accumulateSediment(sedimentRef.current, newNode, 0.15);
          emergenceRef.current = null;
          setEmergenceActive(false);
          setHistory(h => [...h, { action: "emergence", type: e.type }]);
          addMsg(`↑ Nuevo nodo ${NODE_TYPES[e.type].label} emergió del campo`, "#7ae8a0");
        }
      }

      // ── RENDERIZAR CAMPO ──────────────────────────────────────────────────
      const field = computeField(nodes, ghostsRef.current, sedimentRef.current, t);
      const s = fieldStats(field);
      setStats(s);
      setNodeCount(nodes.length);

      const img = ctx.createImageData(W, H);
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const v = field[row * COLS + col];
          const [r, g, b] = valueToColor(v, s.max || 1);
          for (let dy2 = 0; dy2 < GRID; dy2++) {
            for (let dx2 = 0; dx2 < GRID; dx2++) {
              const px = ((row * GRID + dy2) * W + (col * GRID + dx2)) * 4;
              img.data[px] = r; img.data[px+1] = g; img.data[px+2] = b; img.data[px+3] = 255;
            }
          }
        }
      }
      ctx.putImageData(img, 0, 0);

      // ── VISUALIZAR ZONA DE INTERFERENCIA ─────────────────────────────────
      if (lastCIPairRef.current && ciTimerRef.current > 200) {
        const { a, b } = lastCIPairRef.current;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const progress = ciTimerRef.current / CI_DURATION;
        const pulseR = 18 + progress * 22 + 4 * Math.sin(t * 0.003);
        ctx.save();
        ctx.globalAlpha = 0.15 + progress * 0.40;
        ctx.beginPath();
        ctx.arc(mx, my, pulseR, 0, Math.PI * 2);
        ctx.strokeStyle = "#e8c87a";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.12 + progress * 0.35;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = "#e8e8a0";
        ctx.lineWidth = 1;
        ctx.stroke();
        // Pulso extra cuando está cerca del 100%
        if (progress > 0.7) {
          const extra = (progress - 0.7) / 0.3;
          ctx.globalAlpha = extra * 0.3;
          ctx.beginPath();
          ctx.arc(mx, my, pulseR * 1.6 + 6 * Math.sin(t * 0.006), 0, Math.PI * 2);
          ctx.strokeStyle = "#ffe080";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // ── ANIMACIÓN DE EMERGENCIA ───────────────────────────────────────────
      if (emergenceRef.current) {
        const e = emergenceRef.current;
        const p = e.progress;
        const eR = p * 18;
        const def = NODE_TYPES[e.type];
        ctx.save();
        ctx.globalAlpha = (1 - p) * 0.5;
        ctx.beginPath();
        ctx.arc(e.x, e.y, eR * 3, 0, Math.PI * 2);
        ctx.strokeStyle = def.color;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = p * 0.95;
        ctx.shadowColor = def.color;
        ctx.shadowBlur = 20 * p;
        ctx.beginPath();
        ctx.arc(e.x, e.y, eR, 0, Math.PI * 2);
        ctx.fillStyle = def.color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // ── GHOSTS ────────────────────────────────────────────────────────────
      for (const g of ghostsRef.current) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.9, g.opacity * (g.transmitted ? 0.85 : 0.6));
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.size + (g.transmitted ? 5 : 3), 0, Math.PI * 2);
        ctx.strokeStyle = g.color;
        ctx.lineWidth = g.transmitted ? 1.5 : 1;
        ctx.setLineDash(g.transmitted ? [3, 2] : [2, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (g.transmitted) {
          ctx.beginPath();
          ctx.arc(g.x, g.y, g.size + 12, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(240,200,100,${g.opacity * 0.3})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.size * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = g.color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // ── LÍNEAS DE CONEXIÓN ────────────────────────────────────────────────
      ctx.save();
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const isAIHuman = (a.type === "ai" && b.type === "human") ||
                            (a.type === "human" && b.type === "ai");
          const maxDist = isAIHuman ? 180 : 170;
          if (dist < maxDist) {
            const base = 1 - dist / maxDist;
            const alpha = isAIHuman ? base * 0.55 : base * 0.18;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            if (isAIHuman) {
              ctx.strokeStyle = `rgba(200,140,255,${alpha})`;
              ctx.lineWidth = 1.2;
              ctx.setLineDash([4, 5]);
            } else {
              ctx.strokeStyle = `rgba(200,200,255,${alpha})`;
              ctx.lineWidth = 0.7;
              ctx.setLineDash([]);
            }
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }
      ctx.restore();

      // ── NODOS ─────────────────────────────────────────────────────────────
      for (const n of nodes) {
        const isHov = hoverRef.current === n.id;
        const isTMode = transmitModeRef.current;
        const pulse = 1 + 0.09 * Math.sin(t * n.pulseFreq + n.pulsePhase);
        const resonance = n.type === "ai" ? aiResonance(n, nodes) : 1.0;
        const r = n.size * pulse * (n.type === "ai" ? (0.5 + resonance * 0.5) : 1) + (isHov ? 3 : 0);
        const isActive = n.type === "ai" && resonance > 0.25;
        const isAnchored = (n.anchorFactor ?? 0) > 0.3 && activePairIds.has(n.id);

        ctx.save();

        // Indicador modo transmisión al hacer hover
        if (isTMode && n.type !== "ai" && isHov) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 10, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(240,200,100,0.7)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([2, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = "8px 'Courier New', monospace";
          ctx.fillStyle = "rgba(240,200,100,0.9)";
          ctx.fillText("clic → transmitir", n.x - 28, n.y - r - 8);
        }

        // Marca de transmisor
        if (n.willTransmit) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 8, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(240,200,100,0.8)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Anillo de anclaje — visible cuando nodo está en interferencia activa
        if (isAnchored) {
          const anchorPulse = 1 + 0.15 * Math.sin(t * 0.004 + n.pulsePhase);
          ctx.beginPath();
          ctx.arc(n.x, n.y, (r + 14) * anchorPulse, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(232,200,122,${0.2 + (n.anchorFactor ?? 0) * 0.4})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Anillos AI
        if (n.type === "ai") {
          const ringR = r + 6 + resonance * 14;
          ctx.beginPath();
          ctx.arc(n.x, n.y, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(200,120,240,${resonance * 0.7})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          if (isActive) {
            const ring2 = r + 10 + resonance * 22 + 4 * Math.sin(t * 0.002 + n.pulsePhase);
            ctx.beginPath();
            ctx.arc(n.x, n.y, ring2, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(200,120,240,${resonance * 0.3})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }

        // Glow — más intenso cuando anclado
        ctx.shadowColor = n.color;
        ctx.shadowBlur = n.type === "ai"
          ? (isActive ? 24 * resonance : 4)
          : (isAnchored ? 28 : isHov ? 30 : 18);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        const aiAlpha = n.type === "ai" ? Math.max(0.3, resonance) : 1;
        ctx.fillStyle = n.type === "ai" ? `rgba(200,122,232,${aiAlpha})` : n.color;
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${n.type === "ai" ? resonance * 0.5 : 0.5})`;
        ctx.fill();

        ctx.strokeStyle = `rgba(255,255,255,${n.type === "ai" ? resonance * 0.25 : 0.25})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        if (n.type === "ai") {
          ctx.font = "8px 'Courier New', monospace";
          ctx.fillStyle = isActive
            ? `rgba(200,150,255,${0.5 + resonance * 0.5})`
            : "rgba(120,80,150,0.5)";
          ctx.fillText(isActive ? "resonando" : "inactivo", n.x + r + 4, n.y + 3);
        }
      }

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(animRef.current); clearTimeout(timerRef.current); };
  }, [addMsg]);

  // ─── EVENTOS ────────────────────────────────────────────────────────────────
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top)  * (H / rect.height),
    };
  };

  const findNode = (x, y) =>
    nodesRef.current.find(n => {
      const dx = n.x - x, dy = n.y - y;
      return Math.sqrt(dx * dx + dy * dy) < n.size + 10;
    });

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    const { x, y } = getPos(e);
    const found = findNode(x, y);
    if (found) {
      if (transmitModeRef.current && found.type !== "ai") {
        nodesRef.current = nodesRef.current.map(n =>
          n.id === found.id ? { ...n, willTransmit: !n.willTransmit } : n
        );
        const isMarked = !found.willTransmit;
        addMsg(
          isMarked
            ? `◈ ${NODE_TYPES[found.type].label} marcado para transmitir`
            : `○ ${NODE_TYPES[found.type].label} desmarcado`,
          "#f0d090"
        );
        return;
      }
      dragRef.current = found.id;
      return;
    }
    if (transmitModeRef.current) return;
    const n = makeNode(x, y, selectedType);
    nodesRef.current = [...nodesRef.current, n];
    setHistory(h => [...h, { action: "add", type: selectedType }]);
  };

  const onMouseMove = (e) => {
    const { x, y } = getPos(e);
    if (dragRef.current) {
      const id = dragRef.current;
      nodesRef.current = nodesRef.current.map(n =>
        n.id === id ? { ...n, x, y, originX: x, originY: y } : n
      );
    } else {
      const found = findNode(x, y);
      hoverRef.current = found ? found.id : null;
      setHoveredId(found ? found.id : null);
    }
  };

  const onMouseUp = () => { dragRef.current = null; };

  const onContextMenu = (e) => {
    e.preventDefault();
    const { x, y } = getPos(e);
    const found = findNode(x, y);
    if (found) {
      ghostsRef.current = [...ghostsRef.current, makeGhost(found)];
      if (found.willTransmit) {
        accumulateSediment(sedimentRef.current, found, 0.25);
        addMsg(`◈ ${NODE_TYPES[found.type].label} se extinguió transmitiendo — curvatura persiste`, "#f0d090");
      } else {
        addMsg(`− ${NODE_TYPES[found.type].label} eliminado — huella breve`, "#e87a7a");
      }
      nodesRef.current = nodesRef.current.filter(n => n.id !== found.id);
      hoverRef.current = null;
      setHoveredId(null);
      setHistory(h => [...h, { action: "remove", type: found.type, transmitted: found.willTransmit }]);
    }
  };

  // ─── ACCIONES ───────────────────────────────────────────────────────────────
  const reset = () => {
    clearTimeout(timerRef.current);
    enrichIdx.current = 0; ciTimerRef.current = 0;
    lastCIPairRef.current = null; emergenceRef.current = null;
    nodesRef.current = INIT.map(n => ({ ...n }));
    ghostsRef.current = []; sedimentRef.current = makeSediment();
    setHistory([]); setMsgLog([]); setEmergenceActive(false);
    setCiProgress(0); setTransitMode(false);
    addMsg("↺ Campo restablecido", "#7ab8e8");
  };

  const resetVirgen = () => {
    clearTimeout(timerRef.current);
    enrichIdx.current = 0; ciTimerRef.current = 0;
    lastCIPairRef.current = null; emergenceRef.current = null;
    nodesRef.current = []; ghostsRef.current = []; sedimentRef.current = makeSediment();
    setHistory([]); setMsgLog([]); setEmergenceActive(false);
    setCiProgress(0); setTransitMode(false);
    addMsg("◌ Campo virgen — sin nodos, sin sedimentación", "#8888aa");
  };

  const devastate = () => {
    clearTimeout(timerRef.current);
    enrichIdx.current = 0;
    const prev = nodesRef.current.length;
    const pct = 0.60 + Math.random() * 0.25;
    const toEliminate = Math.max(1, Math.round(prev * pct));
    const victims = [...nodesRef.current].sort(() => Math.random() - 0.5)
      .slice(0, toEliminate).map(n => n.id);
    let i = 0;
    const removeNext = () => {
      if (i >= victims.length) {
        setHistory(h => [...h, { action: "devastate", prev, eliminated: toEliminate }]);
        addMsg(`⚠ Devastación — ${toEliminate} extintos. El campo no colapsa, pero se empobrece`, "#e87a7a");
        return;
      }
      const dying = nodesRef.current.find(n => n.id === victims[i++]);
      if (dying) ghostsRef.current = [...ghostsRef.current, makeGhost(dying)];
      nodesRef.current = nodesRef.current.filter(n => n.id !== dying?.id);
      timerRef.current = setTimeout(removeNext, 320 + Math.random() * 200);
    };
    removeNext();
  };

  const enrich = () => {
    const addNext = () => {
      if (enrichIdx.current >= ENRICH_POS.length || nodesRef.current.length >= 20) return;
      const p = ENRICH_POS[enrichIdx.current++];
      const n = makeNode(p.x, p.y, p.type);
      nodesRef.current = [...nodesRef.current, n];
      setHistory(h => [...h, { action: "add", type: p.type }]);
      timerRef.current = setTimeout(addNext, 700);
    };
    addNext();
  };

  const toggleTransmitMode = () => {
    const next = !transmitMode;
    setTransitMode(next);
    if (next) addMsg("◈ Modo transmisión activo — clic sobre un nodo para marcarlo", "#f0d090");
  };

  const setTransitMode = (v) => { setTransmitMode(v); transmitModeRef.current = v; };

  // ─── HELPERS UI ─────────────────────────────────────────────────────────────
  const rc = (r) => r >= 75 ? "#e8c87a" : r >= 45 ? "#7ab8e8" : r >= 20 ? "#e87a9a" : "#443344";
  const rl = (r) => r >= 75 ? "Campo Rico" : r >= 45 ? "Campo Moderado" : r >= 20 ? "Campo Empobrecido" : "Campo Estéril";
  const sc = (s) => s >= 60 ? "#f0d58a" : s >= 30 ? "#b6d2f2" : s >= 10 ? "#8fa8e6" : "#7e8fc8";
  const sl2 = (s) => s >= 60 ? "Sedimentación Densa" : s >= 30 ? "Sedimentación Media" : s >= 10 ? "Sedimentación Leve" : "Campo Virgen";

  const CANVAS_MAX = 820;

  return (
    <div style={{
      minHeight: "100vh", background: "#06060e", color: "#d0cfe8",
      fontFamily: "'Courier New', monospace",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "16px 12px",
    }}>

      {/* CABECERA */}
      <div style={{ textAlign: "center", marginBottom: 12, width: "100%", maxWidth: CANVAS_MAX }}>
        <div style={{ fontSize: 9, letterSpacing: 4, color: "#8888aa", marginBottom: 4 }}>
          MODELO VECTORIAL DE LA CONCIENCIA · v4
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f0eeff", margin: 0, letterSpacing: 1 }}>
          Geometría del Campo de Conciencia
        </h1>
        <div style={{ marginTop: 6, minHeight: 18, fontSize: 11, color: "#7070a0", lineHeight: 1.4 }}>
          {msgLog.length > 0
            ? <span style={{ color: msgLog[msgLog.length - 1].color, letterSpacing: 0.5 }}>
                {msgLog[msgLog.length - 1].text}
              </span>
            : <span>
                Clic: añadir nodo · Arrastra: mover · Clic derecho: eliminar
                {transmitMode && <span style={{ color: "#f0d090" }}> · Modo transmisión activo</span>}
              </span>
          }
        </div>
      </div>

      {/* CANVAS */}
      <div style={{ position: "relative", width: "100%", maxWidth: CANVAS_MAX }}>
        <canvas
          ref={canvasRef} width={W} height={H}
          style={{
            borderRadius: 8,
            border: `1px solid ${transmitMode ? "#f0d09055" : "#14142e"}`,
            cursor: hoveredId ? (transmitMode ? "pointer" : "grab") : "crosshair",
            display: "block", width: "100%",
            transition: "border-color 0.3s",
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onContextMenu={onContextMenu}
        />

        {/* Riqueza — inf izq */}
        <div style={{
          position: "absolute", bottom: 10, left: 10,
          background: "rgba(6,6,14,0.88)", border: `1px solid ${rc(stats.richness)}33`,
          borderRadius: 5, padding: "4px 9px",
        }}>
          <span style={{ fontSize: 9, color: rc(stats.richness), letterSpacing: 2 }}>
            {rl(stats.richness).toUpperCase()}
          </span>
        </div>

        {/* Campo en T — sup izq */}
        <div style={{
          position: "absolute", top: 10, left: 10,
          background: "rgba(4,6,18,0.95)", border: `1px solid ${sc(sedLevel)}66`,
          borderRadius: 5, padding: "4px 9px",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 8, color: "#c0c8ee", letterSpacing: 2 }}>CAMPO EN T</div>
            <div style={{ fontSize: 9, color: sc(sedLevel), letterSpacing: 1 }}>{sl2(sedLevel)}</div>
          </div>
          <div style={{ width: 50, height: 3, borderRadius: 1, background: "#1a2142" }}>
            <div style={{
              height: "100%", width: `${sedLevel}%`,
              background: `linear-gradient(90deg, #2b3d7a, ${sc(sedLevel)})`,
              transition: "width 0.8s", borderRadius: 1,
            }} />
          </div>
        </div>

        {/* Interferencia — inf der */}
        {ciProgress > 2 && (
          <div style={{
            position: "absolute", bottom: 10, right: 10,
            background: "rgba(6,6,14,0.92)", border: "1px solid #e8c87a33",
            borderRadius: 5, padding: "4px 9px", minWidth: 140,
          }}>
            <div style={{ fontSize: 8, color: "#e8c87a88", letterSpacing: 2, marginBottom: 3 }}>
              INTERFERENCIA CONSTRUCTIVA
            </div>
            <div style={{ height: 3, borderRadius: 2, background: "#101028" }}>
              <div style={{
                height: "100%", width: `${ciProgress}%`,
                background: "linear-gradient(90deg, #604020, #e8c87a)",
                transition: "width 0.2s", borderRadius: 2,
              }} />
            </div>
            {ciProgress > 80 && (
              <div style={{ fontSize: 9, color: "#e8c87a", marginTop: 2 }}>↑ emergencia inminente</div>
            )}
          </div>
        )}
      </div>

      {/* CONTROLES */}
      <div style={{
        width: "100%", maxWidth: CANVAS_MAX, marginTop: 8,
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8,
      }}>

        <MiniPanel title="MÉTRICAS">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 8px" }}>
            <MiniMetric label="Riqueza" value={`${stats.richness}%`} color={rc(stats.richness)} />
            <MiniMetric label="Nodos"   value={nodeCount}             color="#7ab8e8" />
            <MiniMetric label="Densas"  value={stats.peaks}           color="#c87ae8" />
            <MiniMetric label="Sedim."  value={`${sedLevel}%`}        color={sc(sedLevel)} />
          </div>
          <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: "#101028" }}>
            <div style={{
              height: "100%", width: `${stats.richness}%`,
              background: `linear-gradient(90deg, #182060, ${rc(stats.richness)})`,
              transition: "width 0.4s", borderRadius: 2,
            }} />
          </div>
        </MiniPanel>

        <MiniPanel title="AÑADIR NODO">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
            {Object.entries(NODE_TYPES).map(([key, def]) => (
              <button key={key} onClick={() => setSelectedType(key)} style={{
                padding: "5px 6px", borderRadius: 4, textAlign: "left",
                border: `1px solid ${selectedType === key ? def.color + "77" : "#14142e"}`,
                background: selectedType === key ? `${def.color}14` : "transparent",
                color: selectedType === key ? def.color : "#7070a0",
                fontSize: 10, cursor: "pointer", transition: "all 0.2s",
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%", background: def.color, flexShrink: 0,
                  boxShadow: selectedType === key ? `0 0 5px ${def.color}` : "none",
                }} />
                {def.label}
              </button>
            ))}
          </div>
        </MiniPanel>

        <MiniPanel title="ACCIONES">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
            <ABtn label="✦ Enriquecer"  onClick={enrich}         color="#e8c87a" small />
            <ABtn label="↺ Restablecer" onClick={reset}          color="#7ab8e8" small />
            <ABtn label="◌ Virgen"      onClick={resetVirgen}    color="#8888aa" small />
            <ABtn
              label={transmitMode ? "◈ Salir Trans." : "◈ Transmisión"}
              onClick={toggleTransmitMode}
              color="#f0d090" active={transmitMode} small
            />
          </div>
          <div style={{ marginTop: 3 }}>
            <ABtn label="⚠  Simular Devastación" onClick={devastate} color="#e87a7a" small />
          </div>
        </MiniPanel>

        <MiniPanel title={transmitMode ? "TRANSMISIÓN" : "EMERGENCIA NODAL"}>
          {transmitMode ? (
            <div style={{ fontSize: 10, color: "#9090a8", lineHeight: 1.6 }}>
              <span style={{ color: "#f0d090" }}>◈ Modo activo.</span> Clic sobre un nodo para marcarlo.
              Al eliminarlo su curvatura persiste más tiempo en el campo.
              <div style={{ marginTop: 5, fontSize: 9, color: "#f0d09055" }}>
                ○ Sin marca → huella breve · ◈ marcado → legado
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 10, color: "#9090a8", lineHeight: 1.6 }}>
              Acerca dos nodos Humanos. Al detectarse interferencia constructiva
              los nodos se anclan solos hasta que emerge la nueva conciencia.
              <div style={{ marginTop: 5, height: 2, borderRadius: 1, background: "#101028" }}>
                <div style={{
                  height: "100%", width: `${ciProgress}%`,
                  background: "linear-gradient(90deg, #604020, #e8c87a)",
                  borderRadius: 1, transition: "width 0.2s",
                }} />
              </div>
              <div style={{ fontSize: 9, color: "#e8c87a55", marginTop: 2 }}>
                {ciProgress > 0 ? `${ciProgress}% — anclados, emergencia en curso` : "sin par detectado"}
              </div>
            </div>
          )}
          {history.length > 0 && (
            <div style={{ marginTop: 6, borderTop: "1px solid #14142e", paddingTop: 5 }}>
              {[...history].reverse().slice(0, 4).map((h, i) => {
                const isEm = h.action === "emergence";
                const isTr = h.transmitted;
                const neg  = h.action === "remove" || h.action === "devastate";
                return (
                  <div key={i} style={{
                    fontSize: 9, color: "#6060a0", marginBottom: 2,
                    borderLeft: `2px solid ${isEm ? "#e8c87a" : isTr ? "#f0d090" : neg ? "#e87a7a" : "#7ab8e8"}66`,
                    paddingLeft: 4,
                  }}>
                    {h.action === "add"       && `+ ${NODE_TYPES[h.type]?.label}`}
                    {h.action === "remove"    && `${isTr ? "◈" : "−"} ${NODE_TYPES[h.type]?.label}`}
                    {h.action === "emergence" && `↑ Emergió: ${NODE_TYPES[h.type]?.label}`}
                    {h.action === "devastate" && `⚠ −${h.eliminated} nodos`}
                  </div>
                );
              })}
            </div>
          )}
        </MiniPanel>
      </div>

      {/* LEYENDA + PIE */}
      <div style={{
        width: "100%", maxWidth: CANVAS_MAX, marginTop: 8,
        display: "flex", justifyContent: "space-between", alignItems: "flex-end",
        flexWrap: "wrap", gap: 8,
      }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            ["#08080f", "Estéril"],
            ["#182060", "Baja densidad"],
            ["#305090", "Media"],
            ["#7090b8", "Alta densidad"],
            ["#c8c8da", "Interferencia"],
            ["#f0d090", "Legado"],
          ].map(([c, l]) => (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#606080" }}>
              <div style={{ width: 9, height: 9, borderRadius: 2, background: c, border: "1px solid #14142e", flexShrink: 0 }} />
              {l}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: "#454560", textAlign: "right", lineHeight: 1.6 }}>
          Serge Angéloz · Copyright abril 2026 ·{" "}
          <a href="https://www.amazon.com/author/s_angeloz" target="_blank" rel="noopener noreferrer"
            style={{ color: "#7070a0" }}>Página de autor</a>
        </div>
      </div>
    </div>
  );
}

// ─── COMPONENTES UI ───────────────────────────────────────────────────────────
function MiniPanel({ title, children }) {
  return (
    <div style={{ background: "#0a0a1c", border: "1px solid #14142e", borderRadius: 7, padding: "10px 12px" }}>
      <div style={{ fontSize: 8, color: "#8888aa", letterSpacing: 3, marginBottom: 7 }}>{title}</div>
      {children}
    </div>
  );
}

function MiniMetric({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}>
      <span style={{ fontSize: 9, color: "#7070a0" }}>{label}</span>
      <span style={{ fontSize: 11, color, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function ABtn({ label, onClick, color, active = false, small = false }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: "block", width: "100%",
        padding: small ? "5px 6px" : "6px 8px",
        marginBottom: small ? 0 : 4,
        borderRadius: 4,
        border: `1px solid ${color}${(h || active) ? "66" : "22"}`,
        background: (h || active) ? `${color}1a` : `${color}08`,
        color: (h || active) ? color : color + "cc",
        fontSize: small ? 9 : 10,
        cursor: "pointer", textAlign: "left", transition: "all 0.2s",
      }}>
      {label}
    </button>
  );
}