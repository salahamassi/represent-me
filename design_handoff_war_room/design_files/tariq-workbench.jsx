/* global React, PERSONAS, Avatar, StatusDot, Pill, SectionLabel */

function CountdownBlock({ value, label, tone = "default" }) {
  const color = tone === "critical" ? "var(--tariq)" : tone === "warning" ? "var(--kareem)" : "var(--fg)";
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "10px 14px", minWidth: 70,
      background: "var(--panel-2)",
      border: `1px solid ${tone === "critical" ? "oklch(from var(--tariq) l c h / 0.4)" : "var(--border)"}`,
      borderRadius: 8,
    }}>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: 38, fontWeight: 600,
        lineHeight: 1, color, fontVariantNumeric: "tabular-nums",
        textShadow: tone === "critical" ? "0 0 20px oklch(from var(--tariq) l c h / 0.5)" : "none",
      }}>{String(value).padStart(2, "0")}</div>
      <div className="mono" style={{
        marginTop: 6, fontSize: 9, letterSpacing: "0.2em",
        textTransform: "uppercase", color: "var(--fg-faint)",
      }}>{label}</div>
    </div>
  );
}

function DeadlineRow({ d }) {
  const urgent = d.days <= 14;
  const warn = d.days <= 45 && !urgent;
  const barColor = urgent ? "var(--tariq)" : warn ? "var(--kareem)" : "var(--rashid)";
  const pct = Math.max(2, Math.min(100, (1 - d.days / 180) * 100));
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "18px 1fr auto",
      gap: 10, alignItems: "center", padding: "10px 12px",
      background: urgent ? "oklch(from var(--tariq) l c h / 0.07)" : "transparent",
      border: `1px solid ${urgent ? "oklch(from var(--tariq) l c h / 0.3)" : "var(--border)"}`,
      borderLeft: `3px solid ${barColor}`,
      borderRadius: 6,
    }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--fg-faint)", textAlign: "center" }}>{d.code}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>{d.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
          <div style={{ flex: 1, height: 3, background: "var(--grid-line)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: barColor }} />
          </div>
          <span className="mono" style={{ fontSize: 10, color: "var(--fg-faint)" }}>{d.date}</span>
        </div>
      </div>
      <div className="mono" style={{
        fontSize: 18, fontWeight: 600, color: barColor,
        fontVariantNumeric: "tabular-nums", minWidth: 48, textAlign: "right",
      }}>
        {d.days}<span style={{ fontSize: 10, marginLeft: 2, color: "var(--fg-faint)" }}>D</span>
      </div>
    </div>
  );
}

function TariqWorkbench() {
  const p = PERSONAS.Tariq;
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const target = React.useMemo(() => Date.now() + 38*86400000 + 5*3600000 + 42*60000, []);
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff/86400000);
  const hours = Math.floor((diff/3600000) % 24);
  const mins = Math.floor((diff/60000) % 60);
  const secs = Math.floor((diff/1000) % 60);

  const deadlines = [
    { code: "IELTS", title: "IELTS Academic — Band 7.0", date: "Jun 01, 2026", days: 38 },
    { code: "CHEV",  title: "Chevening Scholarship — app window", date: "Nov 05, 2026", days: 195 },
    { code: "DAAD",  title: "DAAD EPOS — supervisor confirmation", date: "May 15, 2026", days: 21 },
    { code: "GATE",  title: "Gates Cambridge — reference letters", date: "May 03, 2026", days: 9 },
    { code: "VISA",  title: "UK Skilled Worker — CoS expires", date: "Jul 20, 2026", days: 87 },
  ];

  return (
    <div style={{
      width: 960, height: 640, padding: 28,
      display: "flex", flexDirection: "column", gap: 18,
      background: `
        radial-gradient(ellipse 60% 40% at 80% 0%, oklch(from var(--tariq) l c h / 0.12), transparent),
        linear-gradient(180deg, var(--bg-2), var(--bg-deep))
      `,
      border: "1px solid var(--border)",
      borderRadius: 18, position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: "linear-gradient(90deg, transparent, var(--tariq), transparent)",
        opacity: 0.6,
      }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Avatar role="Tariq" size={96} ring={true} />
          <div>
            <span lang="ar" dir="rtl" className="ar-display" style={{
              fontSize: 96, color: "var(--tariq)", lineHeight: 0.85,
              textShadow: "0 0 40px oklch(from var(--tariq) l c h / 0.25)",
            }}>{p.ar}</span>
            <div className="mono" style={{
              marginTop: 4, fontSize: 11, letterSpacing: "0.3em", color: "var(--tariq)",
            }}>TARIQ · طارق</div>
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 8, color: "var(--fg)" }}>
              Deadline Enforcer
            </div>
            <div className="mono" style={{
              marginTop: 4, fontSize: 10, letterSpacing: "0.2em",
              color: "var(--fg-faint)", textTransform: "uppercase",
            }}>45 · male · countdown war-room</div>
            <div style={{
              marginTop: 10, fontSize: 12, color: "var(--fg-dim)",
              maxWidth: 400, lineHeight: 1.5, fontStyle: "italic",
            }}>
              "I don't remind. I count down. When the clock hits zero,
              that door closes whether you're ready or not."
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <Pill color="var(--tariq)" border="oklch(from var(--tariq) l c h / 0.4)" bg="oklch(from var(--tariq) l c h / 0.1)">
            <StatusDot status="running" /> ENFORCING
          </Pill>
          <div className="mono" style={{ fontSize: 10, color: "var(--fg-faint)", letterSpacing: "0.15em" }}>
            5 ACTIVE · 0 MISSED · 23 YTD
          </div>
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: 18, background: "var(--panel-2)",
        border: "1px solid oklch(from var(--tariq) l c h / 0.3)",
        borderRadius: 12,
      }}>
        <div>
          <SectionLabel color="var(--tariq)">Primary Target · <span lang="ar" dir="rtl" className="ar-body" style={{ fontSize: 12 }}>الهدف الأول</span></SectionLabel>
          <div style={{ fontSize: 20, fontWeight: 600, marginTop: 6, color: "var(--fg)" }}>
            IELTS Academic — Band 7.0
          </div>
          <div style={{ fontSize: 12, color: "var(--fg-dim)", marginTop: 4 }}>
            British Council, Casablanca · Saturday 01 June, 09:00
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <CountdownBlock value={days} label="Days" tone="critical" />
          <CountdownBlock value={hours} label="Hours" />
          <CountdownBlock value={mins} label="Minutes" />
          <CountdownBlock value={secs} label="Seconds" />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <SectionLabel>Deadline Stack</SectionLabel>
            <span className="mono" style={{ fontSize: 10, color: "var(--fg-faint)" }}>SORTED BY URGENCY</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }} className="scrollbar-slim">
            {deadlines.sort((a,b) => a.days - b.days).map((d, i) => <DeadlineRow key={i} d={d} />)}
          </div>
        </div>

        <div style={{
          display: "flex", flexDirection: "column", gap: 8,
          padding: 14, background: "var(--panel-2)",
          border: "1px solid var(--border)", borderRadius: 10,
        }}>
          <SectionLabel>If Today Slips</SectionLabel>
          {[
            { item: "Gates references", cost: "−1 scholarship track" },
            { item: "DAAD supervisor", cost: "−€12,400 / mo stipend" },
            { item: "IELTS prep −1 day", cost: "−0.25 band risk" },
          ].map((t, i) => (
            <div key={i} style={{
              paddingBottom: 8,
              borderBottom: i < 2 ? "1px solid var(--border)" : "none",
            }}>
              <div style={{ fontSize: 12, color: "var(--fg)" }}>{t.item}</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--tariq)", marginTop: 3 }}>{t.cost}</div>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <button style={{
            marginTop: 4, padding: "8px 12px",
            fontSize: 11, fontFamily: "var(--font-mono)",
            letterSpacing: "0.15em", textTransform: "uppercase",
            background: "oklch(from var(--tariq) l c h / 0.12)",
            color: "var(--tariq)",
            border: "1px solid oklch(from var(--tariq) l c h / 0.4)",
            borderRadius: 6, cursor: "pointer",
          }}>Escalate to Yusuf →</button>
        </div>
      </div>
    </div>
  );
}

function TariqCard() {
  const p = PERSONAS.Tariq;
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

  return (
    <div style={{
      width: 380, minHeight: 520,
      display: "flex", flexDirection: "column",
      background: "var(--panel)", backdropFilter: "blur(24px)",
      border: "1px solid oklch(from var(--tariq) l c h / 0.3)",
      borderRadius: 14,
      boxShadow: "0 0 0 1px oklch(from var(--tariq) l c h / 0.2), 0 0 40px oklch(from var(--tariq) l c h / 0.12)",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
            <Avatar role="Tariq" size={56} />
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span lang="ar" dir="rtl" className="ar-display" style={{
                  fontSize: 30, color: "var(--tariq)",
                }}>{p.ar}</span>
                <span className="mono" style={{
                  fontSize: 11, letterSpacing: "0.2em", color: "var(--tariq)",
                }}>{p.latin}</span>
              </div>
              <div className="mono" style={{
                marginTop: 4, fontSize: 10, letterSpacing: "0.18em",
                color: "var(--fg-faint)", textTransform: "uppercase",
              }}>Deadline Enforcer · 45M</div>
            </div>
          </div>
          <Pill color="var(--tariq)" border="oklch(from var(--tariq) l c h / 0.4)" bg="oklch(from var(--tariq) l c h / 0.1)">
            <StatusDot status="running" /> ENFORCING
          </Pill>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--fg-dim)", fontStyle: "italic" }}>
          "I don't remind. I count down."
        </div>
      </div>

      <div style={{
        margin: "0 18px", height: 1,
        background: "linear-gradient(90deg, transparent, var(--tariq), transparent)",
        opacity: 0.4, animation: "blink 1.8s infinite",
      }} />

      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
        <SectionLabel color="var(--tariq)">Active · Gates Cambridge refs</SectionLabel>
        <div style={{
          display: "flex", gap: 6, padding: 14,
          background: "var(--panel-2)",
          border: "1px solid oklch(from var(--tariq) l c h / 0.25)",
          borderRadius: 8,
        }}>
          {[[days, "DAYS"], [hours, "HRS"], [mins, "MIN"], [secs, "SEC"]].map(([v, l], i) => (
            <React.Fragment key={i}>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div className="mono" style={{
                  fontSize: 28, fontWeight: 600,
                  color: i === 0 ? "var(--tariq)" : "var(--fg)",
                  fontVariantNumeric: "tabular-nums", lineHeight: 1,
                  textShadow: i === 0 ? "0 0 20px oklch(from var(--tariq) l c h / 0.5)" : "none",
                }}>{String(v).padStart(2, "0")}</div>
                <div className="mono" style={{
                  marginTop: 4, fontSize: 9, letterSpacing: "0.22em", color: "var(--fg-faint)",
                }}>{l}</div>
              </div>
              {i < 3 && <div style={{ color: "var(--fg-faint)", fontSize: 20, alignSelf: "center" }}>:</div>}
            </React.Fragment>
          ))}
        </div>

        <SectionLabel>Next in Queue · 4 active</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {[
            { t: "DAAD supervisor confirmation", d: 21, c: "var(--kareem)" },
            { t: "IELTS Academic — Band 7.0", d: 38, c: "var(--tariq)" },
            { t: "UK Skilled Worker — CoS", d: 87, c: "var(--rashid)" },
            { t: "Chevening window opens", d: 195, c: "var(--fg-faint)" },
          ].map((r, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1fr auto",
              alignItems: "center", gap: 10, padding: "7px 10px",
              borderLeft: `2px solid ${r.c}`,
              background: "oklch(from var(--fg) l c h / 0.03)",
              borderRadius: 4,
            }}>
              <span style={{ fontSize: 11.5, color: "var(--fg)" }}>{r.t}</span>
              <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: r.c }}>{r.d}D</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", padding: "10px 12px" }}>
        <button style={{
          width: "100%", padding: "8px 12px", fontSize: 12,
          background: "oklch(from var(--tariq) l c h / 0.08)",
          color: "var(--tariq)",
          border: "1px solid oklch(from var(--tariq) l c h / 0.3)",
          borderRadius: 6, cursor: "pointer",
        }}>
          Chat with <span lang="ar" dir="rtl" className="ar-display" style={{ fontSize: 16 }}>طارق</span>
          <span style={{ opacity: 0.6, marginLeft: 4 }}>(Tariq)</span>
        </button>
      </div>
    </div>
  );
}

window.TariqWorkbench = TariqWorkbench;
window.TariqCard = TariqCard;
