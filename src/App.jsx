import { useState, useEffect, useRef, useCallback } from "react";

const W = 600;
const H = 400;
const GRID = 4;
const COLS = Math.floor(W / GRID);
const ROWS = Math.floor(H / GRID);

const NODE_TYPES = {
  vegetal: { label: "Vegetal",        radius: 30,  strength: 0.22, color: "#7ae8a0", size: 5  },
  animal:  { label: "Animal",         radius: 50,  strength: 0.5,  color: "#7ab8e8", size: 7  },
  human:   { label: "Humano",         radius: 80,  strength: 1.0,  color: "#e8c87a", size: 10 },
  ai:      { label: "IA Consciente",  radius: 70,  strength: 0.85, color: "#c87ae8", size: 9  },
};

// Returns resonance factor 0..1 for AI nodes based on nearest human distance
function aiResonance(node, nodes) {
  const RESONANCE_RADIUS = 180;
  let minDist = Infinity;
  for (const n of nodes) {
    if (n.id === node.id || n.type !== "human") continue;
    const dx = node.x - n.x, dy = node.y - n.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < minDist) minDist = d;
  }
  if (minDist === Infinity) return 0.05; // isolated — nearly invisible
  return Math.min(1, Math.max(0.05, 1 - minDist / RESONANCE_RADIUS));
}

function computeField(nodes, ghosts, t) {
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
        const dx = x - n.x;
        const dy = y - n.y;
        const dist2 = dx * dx + dy * dy;
        const r = n.radius * pulse * (n.type === "ai" ? (0.4 + resonance * 0.6) : 1);
        val += effectiveStrength * pulse * Math.exp(-dist2 / (2 * r * r));
      }
      // Add fading ghost contributions
      for (const g of ghosts) {
        const dx = x - g.x, dy = y - g.y;
        const dist2 = dx * dx + dy * dy;
        val += g.strength * g.opacity * Math.exp(-dist2 / (2 * g.radius * g.radius));
      }
      field[row * COLS + col] = val;
    }
  }
  return field;
}

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

let uid = 20;

function makeNode(x, y, type) {
  const def = NODE_TYPES[type];
  return {
    id: ++uid, x, y, type,
    ...def,
    originX: x, originY: y,
    driftAmp:   10 + Math.random() * 18,
    driftFreqX: 0.00025 + Math.random() * 0.0003,
    driftFreqY: 0.00025 + Math.random() * 0.0003,
    driftPhaseX: Math.random() * Math.PI * 2,
    driftPhaseY: Math.random() * Math.PI * 2,
    pulseFreq:  0.0007 + Math.random() * 0.001,
    pulsePhase: Math.random() * Math.PI * 2,
  };
}

const INIT = [
  makeNode(180, 160, "human"),
  makeNode(330, 200, "human"),
  makeNode(460, 140, "human"),
  makeNode(260, 300, "animal"),
  makeNode(410, 310, "animal"),
];
// Fix IDs so reset works
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


// Create a fading ghost from a removed node
function makeGhost(node) {
  return {
    x: node.x, y: node.y,
    radius: node.radius,
    strength: node.strength * 0.7,
    size: node.size,
    color: node.color,
    opacity: 0.85, // starts visible, decays to 0
  };
}

export default function App() {
  const canvasRef   = useRef(null);
  const nodesRef    = useRef(INIT.map(n => ({ ...n })));
  const ghostsRef   = useRef([]); // fading echoes of removed nodes
  const dragRef     = useRef(null);
  const hoverRef    = useRef(null);
  const animRef     = useRef(null);
  const timerRef    = useRef(null);
  const enrichIdx   = useRef(0);

  const [selectedType, setSelectedType] = useState("human");
  const [nodeCount, setNodeCount]       = useState(INIT.length);
  const [stats, setStats]               = useState({ richness: 0, peaks: 0 });
  const [history, setHistory]           = useState([]);
  const [hoveredId, setHoveredId]       = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const t0 = performance.now();

    const loop = (now) => {
      const t = now - t0;
      const nodes = nodesRef.current;

      for (const n of nodes) {
        if (dragRef.current === n.id) continue;
        n.x = n.originX + n.driftAmp * Math.sin(t * n.driftFreqX + n.driftPhaseX);
        n.y = n.originY + n.driftAmp * Math.cos(t * n.driftFreqY + n.driftPhaseY);
        n.x = Math.max(n.size + 4, Math.min(W - n.size - 4, n.x));
        n.y = Math.max(n.size + 4, Math.min(H - n.size - 4, n.y));
      }

      // Decay ghosts
      const now_ghosts = ghostsRef.current
        .map(g => ({ ...g, opacity: g.opacity - 0.0012 }))
        .filter(g => g.opacity > 0);
      ghostsRef.current = now_ghosts;

      const field = computeField(nodes, now_ghosts, t);
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
              img.data[px]     = r;
              img.data[px + 1] = g;
              img.data[px + 2] = b;
              img.data[px + 3] = 255;
            }
          }
        }
      }
      ctx.putImageData(img, 0, 0);

      // Ghost echoes — fading rings of removed nodes
      for (const g of ghostsRef.current) {
        ctx.save();
        ctx.globalAlpha = g.opacity * 0.6;
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.size + 3, 0, Math.PI * 2);
        ctx.strokeStyle = g.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Inner dim fill
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.size * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = g.color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // Connection lines
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
            const base = (1 - dist / maxDist);
            const alpha = isAIHuman
              ? base * 0.55  // bright resonance line
              : base * 0.18;
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

      // Nodes
      for (const n of nodes) {
        const isHov = hoverRef.current === n.id;
        const pulse = 1 + 0.09 * Math.sin(t * n.pulseFreq + n.pulsePhase);
        const resonance = n.type === "ai" ? aiResonance(n, nodes) : 1.0;
        const r = n.size * pulse * (n.type === "ai" ? (0.5 + resonance * 0.5) : 1) + (isHov ? 3 : 0);
        const isActive = n.type === "ai" && resonance > 0.25;

        ctx.save();

        // AI resonator: outer ring that grows/shrinks with resonance
        if (n.type === "ai") {
          const ringR = r + 6 + resonance * 14;
          const ringAlpha = resonance * 0.7;
          ctx.beginPath();
          ctx.arc(n.x, n.y, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(200,120,240,${ringAlpha})`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 4]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Second pulsing ring when active
          if (isActive) {
            const ring2 = r + 10 + resonance * 22 + 4 * Math.sin(t * 0.002 + n.pulsePhase);
            ctx.beginPath();
            ctx.arc(n.x, n.y, ring2, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(200,120,240,${resonance * 0.3})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }

        // Glow
        ctx.shadowColor = n.color;
        ctx.shadowBlur = n.type === "ai" ? (isActive ? 24 * resonance : 4) : (isHov ? 30 : 18);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        const aiAlpha = n.type === "ai" ? Math.max(0.3, resonance) : 1;
        ctx.fillStyle = n.type === "ai"
          ? `rgba(200,122,232,${aiAlpha})`
          : n.color;
        ctx.fill();

        // Inner core
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

        // Resonator state label
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
  }, []);

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
    if (found) { dragRef.current = found.id; return; }
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

  const onMouseUp  = () => { dragRef.current = null; };
  const onContextMenu = (e) => {
    e.preventDefault();
    const { x, y } = getPos(e);
    const found = findNode(x, y);
    if (found) {
      ghostsRef.current = [...ghostsRef.current, makeGhost(found)];
      nodesRef.current = nodesRef.current.filter(n => n.id !== found.id);
      hoverRef.current = null;
      setHoveredId(null);
      setHistory(h => [...h, { action: "remove", type: found.type }]);
    }
  };

  const reset = () => {
    clearTimeout(timerRef.current);
    enrichIdx.current = 0;
    nodesRef.current = INIT.map(n => ({ ...n }));
    ghostsRef.current = [];
    setHistory([]);
  };

  const devastate = () => {
    clearTimeout(timerRef.current);
    enrichIdx.current = 0;
    const prev = nodesRef.current.length;
    const pct = 0.60 + Math.random() * 0.25;
    const toEliminate = Math.max(1, Math.round(prev * pct));
    const shuffled = [...nodesRef.current].sort(() => Math.random() - 0.5);
    const victims = shuffled.slice(0, toEliminate).map(n => n.id);
    let i = 0;
    const removeNext = () => {
      if (i >= victims.length) {
        setHistory(h => [...h, { action: "devastate", prev, eliminated: toEliminate }]);
        return;
      }
      const id = victims[i++];
      const dying = nodesRef.current.find(n => n.id === id);
      if (dying) ghostsRef.current = [...ghostsRef.current, makeGhost(dying)];
      nodesRef.current = nodesRef.current.filter(n => n.id !== id);
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

  const rc = (r) => r >= 75 ? "#e8c87a" : r >= 45 ? "#7ab8e8" : r >= 20 ? "#e87a9a" : "#443344";
  const rl = (r) => r >= 75 ? "Campo Rico" : r >= 45 ? "Campo Moderado" : r >= 20 ? "Campo Empobrecido" : "Campo Estéril";

  return (
    <div style={{
      minHeight: "100vh", background: "#06060e", color: "#d0cfe8",
      fontFamily: "'Courier New', monospace",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "22px 14px",
    }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontSize: 9, letterSpacing: 4, color: "#8888aa", marginBottom: 5 }}>
          MODELO VECTORIAL DE LA CONCIENCIA
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#f0eeff", margin: 0, letterSpacing: 1 }}>
          Geometría del Campo de Conciencia
        </h1>
        <p style={{ fontSize: 12, color: "#7070a0", marginTop: 8, lineHeight: 1.45 }}>
          Clic para añadir nodo · Arrastra para mover · Clic derecho para eliminar
        </p>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center" }}>
        <div style={{ position: "relative" }}>
          <canvas
            ref={canvasRef} width={W} height={H}
            style={{
              borderRadius: 8, border: "1px solid #14142e",
              cursor: hoveredId ? "grab" : "crosshair",
              display: "block", maxWidth: "100%",
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onContextMenu={onContextMenu}
          />
          <div style={{
            position: "absolute", bottom: 10, left: 10,
            background: "rgba(6,6,14,0.9)",
            border: `1px solid ${rc(stats.richness)}44`,
            borderRadius: 5, padding: "5px 10px",
          }}>
            <span style={{ fontSize: 9, color: rc(stats.richness), letterSpacing: 2 }}>
              {rl(stats.richness).toUpperCase()}
            </span>
          </div>
        </div>

        <div style={{ width: 188, display: "flex", flexDirection: "column", gap: 10 }}>
          <Panel title="MÉTRICAS">
            <Metric label="Riqueza" value={`${stats.richness}%`} color={rc(stats.richness)} />
            <Metric label="Nodos" value={nodeCount} color="#7ab8e8" />
            <Metric label="Zonas densas" value={stats.peaks} color="#c87ae8" />
            <div style={{ marginTop: 7, height: 4, borderRadius: 2, background: "#101028" }}>
              <div style={{
                height: "100%", width: `${stats.richness}%`,
                background: `linear-gradient(90deg, #182060, ${rc(stats.richness)})`,
                transition: "width 0.4s, background 0.4s", borderRadius: 2,
              }} />
            </div>
          </Panel>

          <Panel title="AÑADIR NODO">
            {Object.entries(NODE_TYPES).map(([key, def]) => (
              <button key={key} onClick={() => setSelectedType(key)} style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "6px 8px", marginBottom: 4, borderRadius: 4,
                border: `1px solid ${selectedType === key ? def.color + "77" : "#14142e"}`,
                background: selectedType === key ? `${def.color}12` : "transparent",
                color: selectedType === key ? def.color : "#8888aa",
                fontSize: 9, cursor: "pointer", transition: "all 0.2s",
              }}>
                <span style={{
                  marginRight: 6, display: "inline-block",
                  width: 6, height: 6, borderRadius: "50%", background: def.color,
                  verticalAlign: "middle",
                  boxShadow: selectedType === key ? `0 0 5px ${def.color}` : "none",
                }} />
                {def.label}
              </button>
            ))}
          </Panel>

          <Panel title="ACCIONES">
            <ABtn label="✦  Enriquecer Campo" onClick={enrich} color="#e8c87a" />
            <ABtn label="↺  Restablecer" onClick={reset} color="#7ab8e8" />
            <ABtn label="⚠  Simular Genocidio" onClick={devastate} color="#e87a7a" />
          </Panel>

          {history.length > 0 && (
            <Panel title="HISTORIAL">
              <div style={{ maxHeight: 120, overflowY: "auto" }}>
                {[...history].reverse().slice(0, 10).map((h, i) => {
                  const neg = h.action === "remove" || h.action === "devastate";
                  return (
                    <div key={i} style={{
                      fontSize: 9, color: "#8888aa", marginBottom: 3,
                      borderLeft: `2px solid ${neg ? "#e87a7a" : "#7ab8e8"}88`,
                      paddingLeft: 5,
                    }}>
                      {h.action === "add"       && `+ ${NODE_TYPES[h.type]?.label}`}
                      {h.action === "remove"    && `− ${NODE_TYPES[h.type]?.label}`}
                      {h.action === "devastate" && `⚠ −${h.eliminated} conciencias (${Math.round(h.eliminated/h.prev*100)}%)`}
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        {[
          ["#08080f", "Campo estéril"],
          ["#182060", "Baja densidad"],
          ["#305090", "Densidad media"],
          ["#7090b8", "Alta densidad"],
          ["#c8c8da", "Interferencia constructiva"],
        ].map(([c, l]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#7070a0" }}>
            <div style={{ width: 11, height: 11, borderRadius: 2, background: c, border: "1px solid #14142e", flexShrink: 0 }} />
            {l}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "#5a5a7a", textAlign: "center", maxWidth: 620, lineHeight: 1.85 }}>
        Cada nodo oscila orgánicamente manifestando su relación y simbiosis con el campo colectivo.
        La destrucción masiva de nodos empobrece la topografía disponible para futuras emergencias conscientes.
        <div style={{ marginTop: 8, fontSize: 10, color: "#7a7aa8", lineHeight: 1.7 }}>
          Si quieres saber mas sobre el tema y libros, da click{" "}
          <a
            href="https://www.amazon.com/author/s_angeloz"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#c8c8da" }}
          >
            aqui
          </a>
          .
        </div>
        <div style={{ marginTop: 8, fontSize: 9, color: "#5a5a7a", lineHeight: 1.7 }}>
          Serge Angeloz · Copyright abril 2026 ·{" "}
          <a
            href="https://www.amazon.com/author/s_angeloz"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#9090b8" }}
          >
            Pagina de autor
          </a>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{ background: "#0a0a1c", border: "1px solid #14142e", borderRadius: 7, padding: 12 }}>
      <div style={{ fontSize: 8, color: "#8888aa", letterSpacing: 3, marginBottom: 9 }}>{title}</div>
      {children}
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, alignItems: "center" }}>
      <span style={{ fontSize: 9, color: "#9090b8" }}>{label}</span>
      <span style={{ fontSize: 11, color, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function ABtn({ label, onClick, color }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
      display: "block", width: "100%", padding: "6px 8px", marginBottom: 4,
      borderRadius: 4, border: `1px solid ${color}${h ? "66" : "22"}`,
      background: h ? `${color}1a` : `${color}08`,
      color: h ? color : color + "cc",
      fontSize: 9, cursor: "pointer", textAlign: "left", transition: "all 0.2s",
    }}>
      {label}
    </button>
  );
}
