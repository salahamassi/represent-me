/* global React, PERSONAS, Avatar */

function YusufBrief({ mode = "desktop" }) {
  if (mode === "mobile") {
    return (
      <div style={{
        width: 390, height: 844, padding: 16,
        background: "linear-gradient(180deg, var(--bg-2), var(--bg-deep))",
        border: "1px solid var(--border)", borderRadius: 44,
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div className="mono" style={{
          display: "flex", justifyContent: "space-between",
          fontSize: 11, color: "var(--fg-dim)", padding: "4px 12px",
        }}><span>9:41</span><span>●●●● LTE</span></div>

        <div style={{
          padding: 18,
          background: "linear-gradient(180deg, oklch(from var(--yusuf) l c h / 0.25), oklch(from var(--yusuf) l c h / 0.08))",
          border: "1px solid oklch(from var(--yusuf) l c h / 0.4)",
          borderRadius: 16,
        }}>
          <div className="mono" style={{
            fontSize: 10, letterSpacing: "0.3em",
            color: "var(--yusuf)", textTransform: "uppercase",
          }}>Yusuf · Supervisor</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
            <Avatar role="Yusuf" size={56} />
            <span lang="ar" dir="rtl" className="ar-display" style={{
              fontSize: 72, color: "var(--yusuf)", lineHeight: 0.85,
              textShadow: "0 0 24px oklch(from var(--yusuf) l c h / 0.4)",
            }}>يوسف</span>
          </div>
          <div style={{ marginTop: 12, fontSize: 22, fontWeight: 600, lineHeight: 1.2, color: "var(--fg)" }}>
            Apply to LifeMD today.
          </div>
          <div style={{ marginTop: 8, fontSize: 14, color: "var(--fg-dim)", lineHeight: 1.5 }}>
            94% match · kit ready · ATS 8.7/10. Hit it after the gym.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { role: "Tariq",  msg: "Gates refs due in 9D 14H. Ping professors tonight." },
            { role: "Rashid", msg: "2 new leads sitting — 78% and 82%. Review later." },
            { role: "Layla",  msg: "LinkedIn post drafted. No 'looking for work' vibe." },
          ].map((c, i) => {
            const p = PERSONAS[c.role];
            return (
              <div key={i} style={{
                display: "flex", gap: 10, padding: 12,
                background: "var(--panel)",
                border: "1px solid var(--border)", borderRadius: 12,
              }}>
                <Avatar role={c.role} size={40} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span lang="ar" dir="rtl" className="ar-display" style={{ fontSize: 18, color: `var(${p.var})` }}>{p.ar}</span>
                    <span className="mono" style={{ fontSize: 9, letterSpacing: "0.2em", color: `var(${p.var})`, textTransform: "uppercase" }}>{p.latin}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--fg)", marginTop: 3, lineHeight: 1.4 }}>{c.msg}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{
          display: "flex", justifyContent: "space-around",
          padding: "10px 0", borderTop: "1px solid var(--border)",
        }}>
          {["Brief", "Floor", "Team", "Logs"].map((t, i) => (
            <div key={i} className="mono" style={{
              fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase",
              color: i === 0 ? "var(--yusuf)" : "var(--fg-faint)",
            }}>{t}</div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: 1200, padding: 28,
      background: `
        radial-gradient(ellipse 60% 100% at 0% 0%, oklch(from var(--yusuf) l c h / 0.2), transparent 70%),
        linear-gradient(180deg, var(--bg-2), var(--bg-deep))
      `,
      border: "1px solid oklch(from var(--yusuf) l c h / 0.35)",
      borderRadius: 18,
      display: "grid", gridTemplateColumns: "auto auto 1fr auto", gap: 28,
      alignItems: "center",
    }}>
      <Avatar role="Yusuf" size={120} />
      <span lang="ar" dir="rtl" className="ar-display" style={{
        fontSize: 160, color: "var(--yusuf)", lineHeight: 0.85,
        textShadow: "0 0 60px oklch(from var(--yusuf) l c h / 0.4)",
      }}>يوسف</span>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="mono" style={{
            fontSize: 11, letterSpacing: "0.3em",
            color: "var(--yusuf)", textTransform: "uppercase",
          }}>Yusuf · Supervisor · Jarvis Brief</div>
          <div className="mono" style={{
            fontSize: 10, color: "var(--fg-faint)", letterSpacing: "0.15em",
          }}>THU 24 APR · 09:41 AM</div>
        </div>
        <div style={{
          marginTop: 10, fontSize: 36, fontWeight: 600, lineHeight: 1.15,
          letterSpacing: "-0.02em", color: "var(--fg)", textWrap: "pretty",
        }}>
          Apply to <span style={{ color: "var(--yusuf)" }}>LifeMD</span> today.
        </div>
        <div style={{ marginTop: 10, fontSize: 15, color: "var(--fg-dim)", lineHeight: 1.5, maxWidth: 580 }}>
          94% match on the Flutter Lead role. Kit is assembled — resume tailored,
          LinkedIn post ready, ATS 8.7/10. Gates references due in{" "}
          <span style={{ color: "var(--tariq)", fontFamily: "var(--font-mono)" }}>9D 14H</span>.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[
          ["LifeMD · Flutter Lead", "94%", "var(--rashid)"],
          ["Gates · references", "9D 14H", "var(--tariq)"],
          ["IELTS · target 7.0", "38D", "var(--kareem)"],
        ].map((row, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", gap: 16,
            padding: "8px 14px", background: "var(--panel-2)",
            border: "1px solid var(--border)", borderRadius: 8, minWidth: 240,
          }}>
            <span style={{ fontSize: 12, color: "var(--fg-dim)" }}>{row[0]}</span>
            <span className="mono" style={{ fontSize: 12, color: row[2], fontWeight: 600 }}>{row[1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

window.YusufBrief = YusufBrief;
