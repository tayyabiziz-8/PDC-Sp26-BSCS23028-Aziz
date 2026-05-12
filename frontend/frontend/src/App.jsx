import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000";

const TEAMS = {
  "Al-Hilal": { color: "#1a5bc4", accent: "#4d8ef0" },
  "Al-Nassr": { color: "#f5c518", accent: "#f0a500" },
  "Barcelona": { color: "#a50044", accent: "#004d98" },
  "Real Madrid": { color: "#00529f", accent: "#ffffff" },
  "Liverpool": { color: "#c8102e", accent: "#f6eb61" },
  "Man City": { color: "#6cabdd", accent: "#1c2c5b" },
};

const EVENT_ICONS = {
  goal: "⚽",
  foul: "🟨",
  card: "🟥",
  substitution: "🔄",
  shot: "🎯",
};

const PRESET_EVENTS = [
  { event_type: "goal", player: "Cristiano Ronaldo", team: "Al-Nassr", description: "Powerful header from corner", match_id: "match_001", minute: null },
  { event_type: "shot", player: "Neymar Jr", team: "Al-Hilal", description: "Curling effort from outside the box", match_id: "match_001", minute: null },
  { event_type: "foul", player: "Lamine Yamal", team: "Barcelona", description: "Sliding tackle on the wing", match_id: "match_002", minute: null },
  { event_type: "goal", player: "Vinicius Jr", team: "Real Madrid", description: "Solo run and finish", match_id: "match_002", minute: null },
  { event_type: "substitution", player: "Salah", team: "Liverpool", description: "Brought on for final push", match_id: "match_003", minute: null },
];

function CircuitBreakerPanel({ cbStatus, llmDown, onToggleLlm, onReset }) {
  const stateColors = {
    CLOSED: "#00e87a",
    OPEN: "#ff4444",
    HALF_OPEN: "#f5c518",
  };
  const color = stateColors[cbStatus?.state] || "#888";

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${color}33`,
      borderRadius: 16,
      padding: "20px 24px",
      marginBottom: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{
          width: 12, height: 12, borderRadius: "50%",
          background: color,
          boxShadow: `0 0 12px ${color}`,
          animation: cbStatus?.state === "OPEN" ? "pulse 1s ease infinite" : "none",
        }} />
        <span style={{ fontFamily: "monospace", fontSize: 13, color: "#aaa", letterSpacing: 2 }}>CIRCUIT BREAKER</span>
        <span style={{
          marginLeft: "auto",
          fontFamily: "monospace",
          fontSize: 12,
          color,
          background: `${color}18`,
          padding: "3px 10px",
          borderRadius: 20,
          border: `1px solid ${color}44`,
          letterSpacing: 1,
        }}>{cbStatus?.state}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        {[
          { label: "Failures", val: cbStatus?.failure_count ?? 0, max: cbStatus?.failure_threshold },
          { label: "Threshold", val: cbStatus?.failure_threshold ?? 3 },
          { label: cbStatus?.recovery_in_seconds != null ? "Recovers in" : "Successes", val: cbStatus?.recovery_in_seconds != null ? `${cbStatus.recovery_in_seconds}s` : (cbStatus?.success_count ?? 0) },
        ].map(({ label, val, max }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "monospace" }}>{val}</div>
            <div style={{ fontSize: 10, color: "#666", letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onToggleLlm}
          style={{
            flex: 1,
            padding: "9px 0",
            borderRadius: 10,
            border: `1px solid ${llmDown ? "#ff444466" : "#00e87a44"}`,
            background: llmDown ? "rgba(255,68,68,0.1)" : "rgba(0,232,122,0.08)",
            color: llmDown ? "#ff6666" : "#00e87a",
            cursor: "pointer",
            fontFamily: "monospace",
            fontSize: 12,
            letterSpacing: 1,
          }}
        >
          {llmDown ? "💥 LLM DOWN" : "✅ LLM UP"} — TOGGLE
        </button>
        <button
          onClick={onReset}
          style={{
            padding: "9px 16px",
            borderRadius: 10,
            border: "1px solid #ffffff22",
            background: "rgba(255,255,255,0.05)",
            color: "#888",
            cursor: "pointer",
            fontFamily: "monospace",
            fontSize: 12,
            letterSpacing: 1,
          }}
        >
          RESET
        </button>
      </div>
    </div>
  );
}

function MatchCard({ match }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      borderRadius: 14,
      padding: "14px 18px",
      marginBottom: 10,
      border: "1px solid rgba(255,255,255,0.07)",
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: match.status === "LIVE" ? "#00e87a" : "#555",
        boxShadow: match.status === "LIVE" ? "0 0 8px #00e87a" : "none",
        animation: match.status === "LIVE" ? "pulse 1.5s ease infinite" : "none",
        flexShrink: 0,
      }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#ddd" }}>{match.home}</span>
          <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 10px" }}>
            {match.score_home} – {match.score_away}
          </span>
          <span style={{ fontSize: 13, color: "#ddd" }}>{match.away}</span>
        </div>
        <div style={{ fontSize: 10, color: "#555", marginTop: 4, letterSpacing: 1 }}>
          {match.league} · {match.status === "LIVE" ? `${match.minute}'` : match.status}
        </div>
      </div>
    </div>
  );
}

function EventFeed({ events }) {
  if (!events.length) {
    return (
      <div style={{ textAlign: "center", color: "#444", padding: "40px 0", fontSize: 13, letterSpacing: 1 }}>
        No events yet — fire a match event to start
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {[...events].reverse().map((ev) => (
        <div key={ev.id} style={{
          background: ev.is_fallback ? "rgba(255,68,68,0.06)" : "rgba(0,232,122,0.04)",
          borderRadius: 12,
          padding: "12px 16px",
          border: `1px solid ${ev.is_fallback ? "rgba(255,68,68,0.2)" : "rgba(0,232,122,0.12)"}`,
          animation: "fadeIn 0.3s ease",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>{EVENT_ICONS[ev.event_type] || "📌"}</span>
            <span style={{ fontWeight: 600, color: "#fff", fontSize: 13 }}>{ev.player}</span>
            <span style={{ color: "#555", fontSize: 12 }}>·</span>
            <span style={{ color: "#777", fontSize: 12 }}>{ev.team}</span>
            <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 11, color: "#555" }}>{ev.minute}'</span>
          </div>
          <div style={{ fontSize: 12, color: ev.is_fallback ? "#ff8888" : "#aaa", lineHeight: 1.5, fontStyle: ev.is_fallback ? "italic" : "normal" }}>
            {ev.commentary}
          </div>
          {ev.is_fallback && (
            <div style={{ marginTop: 6, fontSize: 10, color: "#ff6666", letterSpacing: 1 }}>⚡ FALLBACK RESPONSE</div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [matches, setMatches] = useState([]);
  const [events, setEvents] = useState([]);
  const [cbStatus, setCbStatus] = useState(null);
  const [llmDown, setLlmDown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState("match_001");
  const [log, setLog] = useState([]);

  const addLog = (msg, type = "info") => {
    setLog(prev => [...prev.slice(-8), { msg, type, ts: Date.now() }]);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const [mRes, cbRes] = await Promise.all([
        fetch(`${API}/matches`),
        fetch(`${API}/circuit-breaker/status`),
      ]);
      const mData = await mRes.json();
      const cbData = await cbRes.json();
      setMatches(mData.matches);
      setCbStatus(cbData.circuit_breaker);
      setLlmDown(cbData.llm_is_down);
    } catch (e) {
      addLog("Could not reach backend — is it running?", "error");
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API}/events/${selectedMatch}`);
      const data = await res.json();
      setEvents(data.events);
    } catch {}
  }, [selectedMatch]);

  useEffect(() => {
    fetchStatus();
    fetchEvents();
    const interval = setInterval(() => { fetchStatus(); fetchEvents(); }, 2000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchEvents]);

  const fireEvent = async (preset) => {
    setLoading(true);
    const minute = Math.floor(Math.random() * 90) + 1;
    const payload = { ...preset, minute, match_id: selectedMatch };
    const start = Date.now();

    try {
      addLog(`Firing: ${preset.player} — ${preset.event_type}...`, "info");
      const res = await fetch(`${API}/events/commentary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const ms = Date.now() - start;
      const fb = data.event.is_fallback;
      addLog(`${fb ? "⚡ Fallback" : "✅ AI"} response in ${ms}ms — CB: ${data.circuit_breaker.state}`, fb ? "warn" : "success");
      setCbStatus(data.circuit_breaker);
      setEvents(prev => [...prev, data.event]);
    } catch (e) {
      addLog(`❌ Request failed after ${Date.now() - start}ms`, "error");
    } finally {
      setLoading(false);
    }
  };

  const toggleLlm = async () => {
    await fetch(`${API}/simulate/llm-down`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ down: !llmDown }),
    });
    setLlmDown(!llmDown);
    addLog(`LLM API ${!llmDown ? "taken down 💥" : "restored ✅"}`, !llmDown ? "error" : "success");
  };

  const resetCb = async () => {
    await fetch(`${API}/circuit-breaker/reset`, { method: "POST" });
    addLog("Circuit breaker manually reset", "info");
    fetchStatus();
  };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0f; color: #fff; font-family: 'Helvetica Neue', Arial, sans-serif; min-height: 100vh; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <div style={{
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        padding: "16px 32px",
        display: "flex",
        alignItems: "center",
        gap: 20,
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(10px)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, color: "#fff" }}>
            Pitch<span style={{ color: "#00e87a" }}>Pulse</span>
          </div>
          <div style={{ fontSize: 10, color: "#444", letterSpacing: 2, marginTop: 1 }}>MATCH ANALYSIS PLATFORM</div>
        </div>
        <div style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(255,255,255,0.04)",
          padding: "6px 14px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00e87a", animation: "pulse 2s ease infinite" }} />
          <span style={{ fontSize: 11, color: "#666", letterSpacing: 1 }}>Circuit Breaker Demo</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr 300px", gap: 0, height: "calc(100vh - 57px)" }}>

        {/* Left: Matches + Circuit Breaker */}
        <div style={{ borderRight: "1px solid rgba(255,255,255,0.07)", padding: 20, overflowY: "auto" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#555", marginBottom: 14 }}>LIVE MATCHES</div>
          {matches.map(m => (
            <div key={m.id} onClick={() => setSelectedMatch(m.id)} style={{ cursor: "pointer", opacity: selectedMatch === m.id ? 1 : 0.6, transition: "opacity 0.2s" }}>
              <MatchCard match={m} />
            </div>
          ))}

          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#555", marginBottom: 14 }}>FAULT TOLERANCE</div>
            <CircuitBreakerPanel
              cbStatus={cbStatus}
              llmDown={llmDown}
              onToggleLlm={toggleLlm}
              onReset={resetCb}
            />
          </div>

          {/* Log */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#555", marginBottom: 10 }}>SYSTEM LOG</div>
            <div style={{ fontFamily: "monospace", fontSize: 10 }}>
              {log.length === 0 && <div style={{ color: "#444" }}>No activity yet</div>}
              {log.map((l, i) => (
                <div key={l.ts + i} style={{
                  color: l.type === "error" ? "#ff6666" : l.type === "warn" ? "#f5c518" : l.type === "success" ? "#00e87a" : "#777",
                  marginBottom: 4,
                  lineHeight: 1.4,
                }}>{l.msg}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Center: Event Feed */}
        <div style={{ padding: 24, overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 20, gap: 12 }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#555" }}>EVENT FEED</div>
            <div style={{ fontSize: 10, color: "#444", marginLeft: "auto" }}>
              {events.filter(e => e.match_id === selectedMatch).length} events · auto-refreshing
            </div>
          </div>
          <EventFeed events={events.filter(e => e.match_id === selectedMatch)} />
        </div>

        {/* Right: Fire Events */}
        <div style={{ borderLeft: "1px solid rgba(255,255,255,0.07)", padding: 20, overflowY: "auto" }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: "#555", marginBottom: 14 }}>FIRE MATCH EVENT</div>
          <div style={{ fontSize: 11, color: "#444", marginBottom: 16, lineHeight: 1.6 }}>
            Each event calls the LLM API for AI commentary. The circuit breaker protects the server when the API is down.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PRESET_EVENTS.map((ev, i) => (
              <button
                key={i}
                disabled={loading}
                onClick={() => fireEvent(ev)}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: loading ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
                  color: loading ? "#444" : "#ccc",
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span>{EVENT_ICONS[ev.event_type]}</span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{ev.player}</span>
                </div>
                <div style={{ fontSize: 11, color: "#555" }}>{ev.description}</div>
              </button>
            ))}
          </div>

          <div style={{
            marginTop: 24,
            padding: "14px 16px",
            background: "rgba(0,232,122,0.04)",
            borderRadius: 12,
            border: "1px solid rgba(0,232,122,0.1)",
          }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#00e87a", marginBottom: 8 }}>HOW TO DEMO</div>
            <ol style={{ fontSize: 11, color: "#666", paddingLeft: 16, lineHeight: 1.8 }}>
              <li>Fire events — notice fast AI responses</li>
              <li>Toggle LLM DOWN, fire 3+ events</li>
              <li>Watch CB trip to OPEN state</li>
              <li>Subsequent events fail instantly (no hang!)</li>
              <li>Restore LLM, wait ~15s for HALF_OPEN</li>
              <li>Fire event — CB resets to CLOSED</li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}