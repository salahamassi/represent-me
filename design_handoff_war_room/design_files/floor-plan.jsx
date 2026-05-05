/* global React, PERSONAS, Avatar, StatusDot, Pill, SectionLabel, ChatDrawer, RadioChatter */

const DESKS = {
  Yusuf:  { x: 490, y: 110, w: 220, h: 120, label: "Command" },
  Rashid: { x: 160, y: 300, w: 240, h: 130, label: "Radar"   },
  Layla:  { x: 800, y: 300, w: 240, h: 130, label: "Drafting"},
  Kareem: { x: 800, y: 490, w: 240, h: 130, label: "Audit"   },
  Tariq:  { x: 160, y: 490, w: 240, h: 130, label: "Countdown"},
};

function Packet({ from, to, color, label, delay = 0 }) {
  const [stage, setStage] = React.useState("pending");
  React.useEffect(() => {
    const t1 = setTimeout(() => setStage("moving"), 30 + delay);
    const t2 = setTimeout(() => setStage("done"), 1600 + delay);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  const fromC = { x: DESKS[from].x + DESKS[from].w/2, y: DESKS[from].y + DESKS[from].h/2 };
  const toC   = { x: DESKS[to].x + DESKS[to].w/2,   y: DESKS[to].y + DESKS[to].h/2 };
  const pos = stage === "moving" ? toC : fromC;
  return (
    <div style={{
      position: "absolute", left: pos.x - 40, top: pos.y - 11,
      transition: "left 1.5s cubic-bezier(0.65,0,0.35,1), top 1.5s cubic-bezier(0.65,0,0.35,1), opacity 0.3s",
      opacity: stage === "done" ? 0 : stage === "moving" ? 1 : 0.4,
      pointerEvents: "none", zIndex: 20,
    }}>
      <div style={{
        padding: "3px 9px",
        fontFamily: "var(--font-mono)", fontSize: 9,
        letterSpacing: "0.1em", textTransform: "uppercase",
        color: "#0a0a0a", background: color,
        borderRadius: 4, fontWeight: 700,
        boxShadow: `0 0 24px ${color}, 0 4px 12px rgba(0,0,0,0.5)`,
        whiteSpace: "nowrap",
      }}>{label}</div>
    </div>
  );
}

function DeskLines({ active }) {
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 5 }}>
      {Object.entries(DESKS).flatMap(([fromRole, from]) =>
        Object.entries(DESKS).filter(([toRole]) => toRole !== fromRole).map(([toRole, to]) => {
          const isActive = active.some(([f,t]) => f === fromRole && t === toRole);
          const x1 = from.x + from.w/2, y1 = from.y + from.h/2;
          const x2 = to.x + to.w/2,     y2 = to.y + to.h/2;
          return (
            <line key={`${fromRole}-${toRole}`} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={isActive ? `var(${PERSONAS[fromRole].var})` : "var(--grid-line)"}
              strokeWidth={isActive ? 1.5 : 0.5}
              strokeDasharray={isActive ? "2 6" : "none"}
              style={isActive ? { animation: "blink 1.2s linear infinite" } : {}}
            />
          );
        })
      )}
    </svg>
  );
}

function Desk({ role, busy, task, notification, onClick }) {
  const p = PERSONAS[role];
  const d = DESKS[role];
  const colorVar = `var(${p.var})`;
  return (
    <div
      onClick={onClick}
      style={{
        position: "absolute",
        left: d.x, top: d.y, width: d.w, height: d.h,
        background: "var(--panel)",
        border: `1px solid ${busy ? colorVar : "var(--border)"}`,
        borderRadius: 12, padding: 10,
        boxShadow: busy
          ? `0 0 0 1px ${colorVar}, 0 0 40px oklch(from ${colorVar} l c h / 0.3), 0 16px 40px oklch(0 0 0 / 0.35)`
          : "0 12px 24px oklch(0 0 0 / 0.25)",
        backdropFilter: "blur(14px)",
        transition: "box-shadow 0.4s, border 0.4s, transform 0.2s",
        cursor: "pointer", zIndex: 10,
      }}
      onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
      onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
    >
      {busy && (
        <div style={{
          position: "absolute", inset: -2, borderRadius: 14,
          background: `radial-gradient(circle at 50% 0%, oklch(from ${colorVar} l c h / 0.25), transparent 70%)`,
          animation: "breathe 2.5s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}

      {notification && (
        <div style={{
          position: "absolute", top: -4, right: -4,
          width: 14, height: 14, borderRadius: 999,
          background: "#34d399",
          boxShadow: "0 0 0 3px var(--bg), 0 0 16px #34d399",
          animation: "breathe 1.5s ease-in-out infinite",
          zIndex: 15,
        }} />
      )}

      <div style={{
        position: "absolute", top: -9, left: 12,
        padding: "1px 8px", background: "var(--bg)",
        border: "1px solid var(--border)", borderRadius: 4,
        fontFamily: "var(--font-mono)", fontSize: 9,
        letterSpacing: "0.18em", textTransform: "uppercase",
        color: "var(--fg-faint)",
      }}>{d.label}</div>

      <div className="mono" style={{
        position: "absolute", top: -9, right: 12,
        padding: "1px 8px", background: "var(--bg)",
        border: "1px solid var(--border)", borderRadius: 4,
        fontSize: 8, letterSpacing: "0.2em",
        color: "var(--fg-faint)", textTransform: "uppercase",
        opacity: 0.8,
      }}>↗ OPEN</div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Avatar role={role} size={44} ring={busy} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{
              fontSize: 17, fontWeight: 600, color: colorVar, lineHeight: 1.1,
              textShadow: busy ? `0 0 12px oklch(from ${colorVar} l c h / 0.35)` : "none",
            }}>{p.latin}</div>
            <StatusDot status={busy ? "running" : "idle"} />
          </div>
          <div className="mono" style={{
            marginTop: 2, fontSize: 9, letterSpacing: "0.18em",
            color: "var(--fg-dim)", textTransform: "uppercase",
          }}>{p.role}</div>
        </div>
      </div>

      <div style={{
        marginTop: 10, fontSize: 11, color: busy ? "var(--fg)" : "var(--fg-dim)",
        lineHeight: 1.35,
        paddingTop: 7, borderTop: "1px solid var(--border)",
        minHeight: 30,
      }}>{task}</div>
    </div>
  );
}

function IntensityDial({ value, onChange }) {
  const modes = [
    { v: 0, label: "Silent",   sub: "Background only" },
    { v: 1, label: "Focus",    sub: "Essentials" },
    { v: 2, label: "Standard", sub: "Normal chatter" },
    { v: 3, label: "High",     sub: "Aggressive" },
  ];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "8px 12px",
      background: "var(--panel-2)",
      border: "1px solid var(--border)", borderRadius: 10,
    }}>
      <div>
        <div className="mono" style={{
          fontSize: 9, letterSpacing: "0.2em",
          color: "var(--fg-faint)", textTransform: "uppercase",
        }}>Intensity</div>
        <div style={{ fontSize: 12, color: "var(--fg)", marginTop: 2 }}>
          {modes[value].label}
          <span style={{ color: "var(--fg-faint)", marginLeft: 6, fontSize: 10 }}>· {modes[value].sub}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {modes.map(m => (
          <button key={m.v} onClick={() => onChange(m.v)} style={{
            width: 26, height: 26,
            border: `1px solid ${m.v === value ? "var(--tariq)" : "var(--border)"}`,
            background: m.v === value ? "oklch(from var(--tariq) l c h / 0.15)" : "transparent",
            color: m.v === value ? "var(--tariq)" : "var(--fg-faint)",
            borderRadius: 4,
            fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
            cursor: "pointer",
          }}>{m.v}</button>
        ))}
      </div>
    </div>
  );
}

function ThemeToggle({ theme, onChange }) {
  return (
    <div style={{
      display: "flex", padding: 3,
      background: "var(--panel-2)",
      border: "1px solid var(--border)", borderRadius: 999,
    }}>
      {["dark", "light"].map(t => (
        <button key={t} onClick={() => onChange(t)} style={{
          padding: "5px 12px",
          fontSize: 10, fontFamily: "var(--font-mono)",
          letterSpacing: "0.15em", textTransform: "uppercase",
          background: theme === t ? "var(--fg)" : "transparent",
          color: theme === t ? "var(--bg)" : "var(--fg-faint)",
          border: "none", borderRadius: 999,
          cursor: "pointer",
        }}>{t}</button>
      ))}
    </div>
  );
}

const CHAIN_SCRIPTS = [
  {
    name: "LifeMD Sprint",
    beats: [
      { from: "Rashid", to: "Yusuf",  text: "Hot one just dropped. LifeMD · Flutter Lead · 94% fit · remote/UK.", kind: "msg", edges: [["Rashid","Yusuf"]], busy: ["Rashid"], tasks: { Rashid: "Scouting · LifeMD Flutter Lead confirmed" } },
      { from: "Yusuf",  to: "Rashid", text: "Green light. @Layla @Kareem — spin up the kit.", kind: "msg", edges: [["Yusuf","Layla"],["Yusuf","Kareem"]], busy: ["Rashid","Layla","Kareem"], tasks: { Yusuf: "Orchestrating · LifeMD kit assembly" } },
      { from: "Layla",  to: "Kareem", text: "Drafting the LinkedIn post now. No 'seeking new challenges' energy 🙅‍♀️", kind: "msg", edges: [["Layla","Kareem"]], busy: ["Layla","Kareem"], tasks: { Layla: "Drafting post · tone: bold, voice-y" } },
      { from: "Kareem", to: "Layla",  text: "Ran JD against resume. Missing: Dart null-safety, Riverpod. Flag it.", kind: "msg", edges: [["Kareem","Layla"]], busy: ["Layla","Kareem"], tasks: { Kareem: "ATS scan · 8.4/10 · 2 gaps flagged" } },
      { from: "Kareem", to: "Tariq",  text: "Kit is clean. @Tariq your move — timebox this.", kind: "msg", edges: [["Kareem","Tariq"]], busy: ["Tariq"], tasks: { Kareem: "Passing kit downstream" }, packet: { from: "Kareem", to: "Tariq", color: "oklch(0.78 0.15 75)", label: "Kit ready" } },
      { from: "Tariq",  to: "Yusuf",  text: "Apply window: 72h. No extensions. Not asking.", kind: "msg", edges: [["Tariq","Yusuf"]], busy: ["Tariq","Yusuf"], tasks: { Tariq: "Enforcing · 72H window locked" } },
      { from: "Yusuf",  to: "Salah",  text: "Brief ready. Hit it after the gym — kit is on your desk.", kind: "msg", edges: [], busy: [], notifications: ["Layla","Kareem","Tariq"], tasks: { Yusuf: "Brief posted · awaiting Salah" } },
    ],
  },
  {
    name: "IELTS Pressure",
    beats: [
      { from: "Tariq",  to: "Salah",  text: "38 days. You've done 2 mock tests. Target: 12. Math isn't mathing.", kind: "msg", busy: ["Tariq"], tasks: { Tariq: "IELTS · 38D · behind pace" } },
      { from: "Tariq",  to: "Yusuf",  text: "@Yusuf prep shortfall. Need 10 more mocks in 38D. Clear his calendar.", kind: "msg", edges: [["Tariq","Yusuf"]], busy: ["Tariq","Yusuf"] },
      { from: "Yusuf",  to: "Layla",  text: "Mute LinkedIn posting for 2 weeks. Focus shifts to IELTS.", kind: "msg", edges: [["Yusuf","Layla"]], busy: ["Yusuf","Layla"], tasks: { Yusuf: "Rebalancing calendar · IELTS priority" } },
      { from: "Layla",  to: "Yusuf",  text: "roger. parking the Flutter thread. back to you when he breaks 7.0 🧠", kind: "msg", edges: [["Layla","Yusuf"]], busy: ["Layla"], tasks: { Layla: "Paused · content sprint" } },
    ],
  },
];

function FloorPlan({ theme, setTheme }) {
  const [intensity, setIntensity] = React.useState(2);
  const [packets, setPackets] = React.useState([]);
  const [activeEdges, setActiveEdges] = React.useState([]);
  const [busyDesks, setBusyDesks] = React.useState(new Set(["Yusuf"]));
  const [notifications, setNotifications] = React.useState(new Set());
  const [tasks, setTasks] = React.useState({
    Yusuf: "Monitoring · 3 open chains",
    Rashid: "Scanning · 42 feeds · 3 flagged",
    Layla: "Idle · draft queue empty",
    Kareem: "Idle · all kits audited",
    Tariq: "Enforcing · IELTS 38D · Gates 9D",
  });
  const [chatter, setChatter] = React.useState([]);
  const [expandedAgent, setExpandedAgent] = React.useState(null);
  const [chatAgent, setChatAgent] = React.useState(null);

  const timeStamp = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
  };

  const runChain = React.useCallback((scriptIdx = 0) => {
    const script = CHAIN_SCRIPTS[scriptIdx % CHAIN_SCRIPTS.length];
    script.beats.forEach((beat, i) => {
      setTimeout(() => {
        setActiveEdges(beat.edges || []);
        if (beat.busy) setBusyDesks(new Set(["Yusuf", ...beat.busy]));
        if (beat.tasks) setTasks(prev => ({ ...prev, ...beat.tasks }));
        if (beat.notifications) setNotifications(new Set(beat.notifications));
        if (beat.packet) {
          setPackets(prev => [...prev, {
            id: Date.now() + Math.random(),
            from: beat.packet.from, to: beat.packet.to,
            color: beat.packet.color, label: beat.packet.label,
          }]);
        }
        if (beat.kind === "msg") {
          setChatter(prev => [...prev, {
            id: Date.now() + Math.random(),
            from: beat.from, to: beat.to,
            text: beat.text, time: timeStamp(),
          }]);
        }
      }, i * 1400);
    });
    setTimeout(() => {
      setActiveEdges([]);
      setBusyDesks(new Set(["Yusuf"]));
      setPackets([]);
    }, script.beats.length * 1400 + 2500);
  }, []);

  React.useEffect(() => {
    if (intensity === 0) return;
    const every = { 1: 30000, 2: 15000, 3: 8000 }[intensity];
    let idx = 0;
    const id = setInterval(() => runChain(idx++), every);
    return () => clearInterval(id);
  }, [intensity, runChain]);

  function handleDeskClick(role) {
    setNotifications(prev => {
      const next = new Set(prev);
      next.delete(role);
      return next;
    });
    setExpandedAgent(role);
    setTimeout(() => setChatAgent(role), 350);
  }

  function closeChat() {
    setChatAgent(null);
    setTimeout(() => setExpandedAgent(null), 300);
  }

  return (
    <div style={{
      width: 1280, height: 900, padding: 20,
      display: "flex", flexDirection: "column", gap: 12,
      background: "linear-gradient(180deg, var(--bg-2), var(--bg-deep))",
      border: "1px solid var(--border)", borderRadius: 18,
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <div className="mono" style={{
              fontSize: 10, letterSpacing: "0.3em",
              color: "var(--fg-faint)", textTransform: "uppercase",
            }}>War Room</div>
            <div style={{ fontSize: 17, fontWeight: 600, marginTop: 3, color: "var(--fg)" }}>Floor Plan — Live</div>
          </div>
          <Pill color="#10b981" border="oklch(0.78 0.15 160 / 0.4)" bg="oklch(0.78 0.15 160 / 0.08)">
            <StatusDot status="running" /> 5 AGENTS ONLINE
          </Pill>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <ThemeToggle theme={theme} onChange={setTheme} />
          <button onClick={() => runChain(0)} style={{
            padding: "7px 14px", fontSize: 11, fontFamily: "var(--font-mono)",
            letterSpacing: "0.15em", textTransform: "uppercase",
            background: "oklch(from var(--rashid) l c h / 0.12)",
            color: "var(--rashid)", border: "1px solid oklch(from var(--rashid) l c h / 0.4)",
            borderRadius: 6, cursor: "pointer",
          }}>▶ LifeMD Sprint</button>
          <button onClick={() => runChain(1)} style={{
            padding: "7px 14px", fontSize: 11, fontFamily: "var(--font-mono)",
            letterSpacing: "0.15em", textTransform: "uppercase",
            background: "oklch(from var(--tariq) l c h / 0.12)",
            color: "var(--tariq)", border: "1px solid oklch(from var(--tariq) l c h / 0.4)",
            borderRadius: 6, cursor: "pointer",
          }}>▶ IELTS Pressure</button>
          <IntensityDial value={intensity} onChange={setIntensity} />
        </div>
      </div>

      <div style={{
        position: "relative", flex: 1,
        background: `
          radial-gradient(ellipse 50% 40% at 50% 35%, oklch(from var(--yusuf) l c h / 0.12), transparent 70%),
          linear-gradient(180deg, var(--bg-2), var(--bg-deep))
        `,
        border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `
            linear-gradient(var(--grid-line) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
          mask: "radial-gradient(ellipse at 50% 50%, black 50%, transparent 90%)",
          WebkitMask: "radial-gradient(ellipse at 50% 50%, black 50%, transparent 90%)",
        }} />

        <DeskLines active={activeEdges} />

        {Object.keys(DESKS).map(role => (
          <Desk key={role} role={role}
            busy={busyDesks.has(role)}
            task={tasks[role]}
            notification={notifications.has(role)}
            onClick={() => handleDeskClick(role)}
          />
        ))}

        {packets.map(pk => (
          <Packet key={pk.id} from={pk.from} to={pk.to}
            color={pk.color} label={pk.label} delay={pk.delay || 0} />
        ))}

        {["↖ NW · SCOUTING", "NE · CREATIVE ↗", "↙ SW · ENFORCEMENT", "SE · COMPLIANCE ↘"].map((t, i) => {
          const pos = [
            { left: 16, top: 14 }, { right: 16, top: 14 },
            { left: 16, bottom: 14 }, { right: 16, bottom: 14 },
          ][i];
          return <div key={i} className="mono" style={{
            position: "absolute", ...pos,
            fontSize: 9, letterSpacing: "0.3em",
            color: "var(--fg-faint)", textTransform: "uppercase",
          }}>{t}</div>;
        })}

        <ExpandedWorkbench role={expandedAgent} onClose={closeChat} />
        <ChatDrawer role={chatAgent} open={!!chatAgent} onClose={closeChat} />
      </div>

      <RadioChatter log={chatter} />
    </div>
  );
}

function ExpandedWorkbench({ role, onClose }) {
  const p = role ? PERSONAS[role] : null;
  if (!role) return null;
  const colorVar = `var(${p.var})`;

  return (
    <div style={{
      position: "absolute", inset: 0,
      display: "flex", alignItems: "flex-start", justifyContent: "flex-start",
      padding: 20, zIndex: 40, pointerEvents: "none",
    }}>
      <div style={{
        width: 700, maxWidth: "calc(100% - 460px)",
        height: "calc(100% - 40px)",
        background: "var(--bg-2)",
        border: `1px solid ${colorVar}`,
        borderRadius: 14,
        boxShadow: `0 0 0 1px ${colorVar}, 0 40px 80px oklch(0 0 0 / 0.5), 0 0 80px oklch(from ${colorVar} l c h / 0.25)`,
        padding: 24, overflow: "auto", pointerEvents: "auto",
        animation: "expandIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
          <Avatar role={role} size={84} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 38, fontWeight: 600, color: colorVar, lineHeight: 1.05,
              textShadow: `0 0 24px oklch(from ${colorVar} l c h / 0.25)`,
            }}>{p.latin}</div>
            <div className="mono" style={{
              marginTop: 6, fontSize: 11, letterSpacing: "0.25em", color: colorVar,
              textTransform: "uppercase",
            }}>{p.role}</div>
            <div className="mono" style={{
              marginTop: 4, fontSize: 10, letterSpacing: "0.18em",
              color: "var(--fg-faint)", textTransform: "uppercase",
            }}>{p.age} · {p.sex} · {p.dept}</div>
          </div>
          {/* Decorative Arabic calligraphy */}
          <div lang="ar" dir="rtl" className="ar-display" style={{
            fontSize: 80, color: `oklch(from ${colorVar} l c h / 0.2)`,
            lineHeight: 0.85, userSelect: "none", pointerEvents: "none",
          }}>{p.arDeco}</div>
        </div>

        <div style={{ marginTop: 20 }}>
          {role === "Tariq"
            ? <TariqInlineWorkbench />
            : <GenericWorkbench role={role} />}
        </div>
      </div>
    </div>
  );
}

function GenericWorkbench({ role }) {
  const p = PERSONAS[role];
  const colorVar = `var(${p.var})`;
  const content = {
    Yusuf: {
      now: "Prioritizing LifeMD application · 94% fit · kit ready",
      queue: ["Morning Brief · sent 09:41", "Rebalance IELTS vs apply sprint", "Draft weekly review for Salah"],
      metric: ["Chains active", "3"],
    },
    Rashid: {
      now: "Scanning 42 feeds · Flutter / Remote UK",
      queue: ["LifeMD · 94% · hot", "Remote.io · 82% · warm", "Startup AU · 78% · cold"],
      metric: ["Leads today", "8"],
    },
    Layla: {
      now: "Drafting LinkedIn post · tone: bold",
      queue: ["LifeMD post · v2 · 142 words", "Cover letter · LifeMD · in review", "Portfolio refresh · parked"],
      metric: ["Drafts this week", "11"],
    },
    Kareem: {
      now: "ATS scan in progress · LifeMD kit",
      queue: ["Resume v4 · 8.4/10 · 2 gaps", "Cover letter v1 · clean", "Visa CoS prep · pending"],
      metric: ["Audits YTD", "47"],
    },
  }[role];
  return (
    <>
      <div style={{
        padding: 16, background: "var(--panel-2)",
        border: `1px solid oklch(from ${colorVar} l c h / 0.3)`,
        borderRadius: 10, marginBottom: 16,
      }}>
        <SectionLabel color={colorVar}>Now Working On</SectionLabel>
        <div style={{ marginTop: 6, fontSize: 15, color: "var(--fg)" }}>{content.now}</div>
      </div>

      <SectionLabel>Queue · Last 3</SectionLabel>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        {content.queue.map((item, i) => (
          <div key={i} style={{
            padding: "10px 12px",
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderLeft: `2px solid ${colorVar}`,
            borderRadius: 6, fontSize: 13, color: "var(--fg)",
          }}>{item}</div>
        ))}
      </div>

      <div style={{
        marginTop: 16, padding: 14,
        background: `oklch(from ${colorVar} l c h / 0.08)`,
        border: `1px solid oklch(from ${colorVar} l c h / 0.25)`,
        borderRadius: 8,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: "0.2em", color: "var(--fg-dim)", textTransform: "uppercase" }}>
          {content.metric[0]}
        </span>
        <span className="mono" style={{ fontSize: 28, fontWeight: 600, color: colorVar }}>
          {content.metric[1]}
        </span>
      </div>
    </>
  );
}

function TariqInlineWorkbench() {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const target = React.useMemo(() => Date.now() + 9*86400000 + 14*3600000, []);
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff/86400000);
  const hours = Math.floor((diff/3600000) % 24);
  const mins = Math.floor((diff/60000) % 60);
  const secs = Math.floor((diff/1000) % 60);

  const deadlines = [
    { t: "Gates Cambridge · refs",  d: 9,   c: "var(--tariq)" },
    { t: "DAAD · supervisor",        d: 21,  c: "var(--kareem)" },
    { t: "IELTS · Band 7.0",          d: 38,  c: "var(--tariq)" },
    { t: "UK Skilled Worker · CoS",  d: 87,  c: "var(--rashid)" },
  ];

  return (
    <>
      <div style={{
        padding: 16,
        background: "oklch(from var(--tariq) l c h / 0.08)",
        border: "1px solid oklch(from var(--tariq) l c h / 0.35)",
        borderRadius: 10, marginBottom: 14,
      }}>
        <SectionLabel color="var(--tariq)">Closest Threat · Gates references</SectionLabel>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {[[days, "DAYS"], [hours, "HRS"], [mins, "MIN"], [secs, "SEC"]].map(([v, l], i) => (
            <div key={i} style={{ flex: 1, textAlign: "center",
              padding: "8px 0",
              background: "var(--panel-2)",
              border: `1px solid ${i === 0 ? "oklch(from var(--tariq) l c h / 0.5)" : "var(--border)"}`,
              borderRadius: 6,
            }}>
              <div className="mono" style={{
                fontSize: 28, fontWeight: 600,
                color: i === 0 ? "var(--tariq)" : "var(--fg)",
                fontVariantNumeric: "tabular-nums", lineHeight: 1,
                textShadow: i === 0 ? "0 0 18px oklch(from var(--tariq) l c h / 0.5)" : "none",
              }}>{String(v).padStart(2, "0")}</div>
              <div className="mono" style={{
                marginTop: 4, fontSize: 9, letterSpacing: "0.22em", color: "var(--fg-faint)",
              }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <SectionLabel>Deadline Stack</SectionLabel>
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
        {deadlines.map((r, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "1fr auto",
            padding: "10px 12px",
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderLeft: `3px solid ${r.c}`,
            borderRadius: 6, alignItems: "center",
          }}>
            <span style={{ fontSize: 13, color: "var(--fg)" }}>{r.t}</span>
            <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: r.c }}>{r.d}D</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, padding: 12, border: "1px dashed var(--border)", borderRadius: 6, fontSize: 12, color: "var(--fg-dim)", fontStyle: "italic", lineHeight: 1.5 }}>
        "I don't remind. I count down. Talk to me."
      </div>
    </>
  );
}

window.FloorPlan = FloorPlan;
