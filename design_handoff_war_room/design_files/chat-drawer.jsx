/* global React, PERSONAS, Avatar, StatusDot, Pill, SectionLabel */

function ChatDrawer({ role, open, onClose }) {
  const p = role ? PERSONAS[role] : null;
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const scrollRef = React.useRef(null);
  const storageKey = role ? `warroom.chat.${role}` : null;

  React.useEffect(() => {
    if (!role) return;
    try {
      const raw = localStorage.getItem(storageKey);
      setMessages(raw ? JSON.parse(raw) : []);
    } catch { setMessages([]); }
  }, [role]);

  React.useEffect(() => {
    if (!role) return;
    try { localStorage.setItem(storageKey, JSON.stringify(messages.slice(-40))); } catch {}
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, role]);

  async function send() {
    if (!input.trim() || busy || !role) return;
    const userMsg = { who: "Salah", text: input.trim(), ts: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const systemPrompt = PERSONAS[role].prompt +
        " You are speaking in a chat drawer inside Salah's War Room command center. Stay in character.";
      const transcript = next.slice(-12)
        .map(m => `${m.who}: ${m.text}`).join("\n");
      const reply = await window.claude.complete({
        messages: [
          { role: "user", content: `[System voice: ${systemPrompt}]\n\nConversation so far:\n${transcript}\n\nRespond as ${role}.` },
        ],
      });
      setMessages(m => [...m, { who: role, text: reply.trim(), ts: Date.now() }]);
    } catch {
      setMessages(m => [...m, { who: role, text: "[connection dropped — try again]", ts: Date.now(), error: true }]);
    } finally {
      setBusy(false);
    }
  }

  if (!role) return null;
  const colorVar = `var(${p.var})`;
  const emptyStateLine = {
    Tariq: "He won't be nice about it.",
    Layla: "She'll roast your corporate copy.",
    Kareem: "He'll audit your answer.",
    Rashid: "He's scouting right now, but always has a minute for you.",
    Yusuf: "He's you — speak openly.",
  }[role];

  return (
    <>
      <div onClick={onClose} style={{
        position: "absolute", inset: 0,
        background: "oklch(0 0 0 / 0.4)",
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
        transition: "opacity 0.25s", zIndex: 50,
      }} />
      <div style={{
        position: "absolute", top: 0, right: 0, bottom: 0,
        width: 440,
        background: "var(--bg-2)",
        borderLeft: `1px solid ${colorVar}`,
        boxShadow: `-20px 0 60px oklch(0 0 0 / 0.4), -1px 0 0 0 ${colorVar}`,
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.35s cubic-bezier(0.65, 0, 0.35, 1)",
        display: "flex", flexDirection: "column", zIndex: 60,
      }}>
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          background: `linear-gradient(180deg, oklch(from ${colorVar} l c h / 0.15), transparent)`,
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <Avatar role={role} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: colorVar, lineHeight: 1.1 }}>{p.latin}</div>
            <div className="mono" style={{
              marginTop: 3, fontSize: 10, letterSpacing: "0.2em",
              color: "var(--fg-faint)", textTransform: "uppercase",
            }}>{p.role} · {p.age}{p.sex}</div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, background: "transparent", color: "var(--fg-dim)",
            border: "1px solid var(--border)", borderRadius: 6,
            cursor: "pointer", fontSize: 14,
          }}>✕</button>
        </div>

        <div ref={scrollRef} className="scrollbar-slim" style={{
          flex: 1, overflowY: "auto", padding: "16px 20px",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          {messages.length === 0 && (
            <div style={{
              margin: "auto 0", textAlign: "center", padding: 20,
              fontSize: 13, color: "var(--fg-faint)", lineHeight: 1.6,
            }}>
              <div style={{ fontSize: 14, color: colorVar, marginBottom: 6, fontWeight: 500 }}>
                Direct line to {p.latin}
              </div>
              Ask anything. {emptyStateLine}
            </div>
          )}
          {messages.map((m, i) => <ChatBubble key={i} msg={m} agentRole={role} />)}
          {busy && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", paddingLeft: 44 }}>
              <span className="mono" style={{ fontSize: 10, color: colorVar, letterSpacing: "0.2em" }}>{p.latin.toUpperCase()} IS TYPING</span>
              <span style={{ display: "flex", gap: 3 }}>
                {[0,1,2].map(i => <span key={i} style={{
                  width: 4, height: 4, borderRadius: 999, background: colorVar,
                  animation: `blink 1s infinite`, animationDelay: `${i*0.15}s`,
                }} />)}
              </span>
            </div>
          )}
        </div>

        <div style={{ padding: 14, borderTop: "1px solid var(--border)" }}>
          <div style={{
            display: "flex", gap: 8, padding: 8,
            background: "var(--panel-2)",
            border: "1px solid var(--border)", borderRadius: 10,
          }}>
            <input value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder={`Message ${p.latin}…`}
              disabled={busy}
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: "var(--fg)", fontSize: 13, fontFamily: "var(--font-ui)",
              }} />
            <button onClick={send} disabled={busy || !input.trim()} style={{
              padding: "6px 14px",
              background: input.trim() ? colorVar : "var(--border)",
              color: "var(--bg)",
              border: "none", borderRadius: 6,
              cursor: input.trim() && !busy ? "pointer" : "default",
              fontSize: 12, fontWeight: 600, fontFamily: "var(--font-mono)",
              letterSpacing: "0.1em", textTransform: "uppercase",
              opacity: busy ? 0.5 : 1,
            }}>Send</button>
          </div>
        </div>
      </div>
    </>
  );
}

function ChatBubble({ msg, agentRole }) {
  const isUser = msg.who === "Salah";
  const p = PERSONAS[agentRole];
  const colorVar = `var(${p.var})`;
  return (
    <div style={{ display: "flex", gap: 10, flexDirection: isUser ? "row-reverse" : "row", alignItems: "flex-start" }}>
      {!isUser && <Avatar role={agentRole} size={28} ring={false} />}
      {isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "var(--panel-2)", border: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, color: "var(--fg-dim)", fontFamily: "var(--font-mono)",
        }}>S</div>
      )}
      <div style={{
        maxWidth: 300, padding: "8px 12px",
        background: isUser ? "var(--panel)" : `oklch(from ${colorVar} l c h / 0.1)`,
        border: `1px solid ${isUser ? "var(--border)" : `oklch(from ${colorVar} l c h / 0.3)`}`,
        borderRadius: 10,
        fontSize: 13, lineHeight: 1.5, color: "var(--fg)",
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>{msg.text}</div>
    </div>
  );
}

function RadioChatter({ log }) {
  return (
    <div style={{
      height: 110, padding: "10px 16px",
      background: "var(--bg-deep)",
      border: "1px solid var(--border)", borderRadius: 10,
      display: "flex", flexDirection: "column", gap: 4,
      overflow: "hidden", position: "relative",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        paddingBottom: 4, borderBottom: "1px dashed var(--border)",
      }}>
        <div className="mono" style={{
          fontSize: 9, letterSpacing: "0.3em",
          color: "var(--fg-faint)", textTransform: "uppercase",
        }}>Radio Chatter</div>
        <div className="mono" style={{ fontSize: 9, color: "#10b981" }}>● LIVE</div>
      </div>
      <div style={{
        flex: 1, display: "flex", flexDirection: "column-reverse",
        gap: 2, overflow: "hidden", fontFamily: "var(--font-mono)",
        fontSize: 11, lineHeight: 1.45,
      }}>
        {log.slice(-6).reverse().map((m, i) => {
          const from = PERSONAS[m.from];
          return (
            <div key={m.id} style={{
              display: "flex", gap: 8, alignItems: "baseline",
              opacity: 1 - i * 0.13,
            }}>
              <span style={{ color: "var(--fg-faint)", minWidth: 56 }}>{m.time}</span>
              <span style={{ color: `var(${from.var})`, fontWeight: 600, minWidth: 62 }}>{from.latin}</span>
              <span style={{ color: "var(--fg-faint)" }}>→</span>
              <span style={{ color: "var(--fg-dim)", minWidth: 56 }}>
                {m.to === "Salah" ? "Salah" : PERSONAS[m.to].latin}
              </span>
              <span style={{ color: "var(--fg)", flex: 1 }}>{m.text}</span>
            </div>
          );
        })}
        {log.length === 0 && (
          <div style={{ color: "var(--fg-faint)", fontStyle: "italic", fontSize: 11 }}>
            No chatter yet — trigger a chain or raise intensity.
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ChatDrawer, RadioChatter });
