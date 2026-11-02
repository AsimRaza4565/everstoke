import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FadeEdges, GradientMeshBackground, clampInterp, resolvePalette, type Palette } from "../lib/primitives";

/**
 * FAMILY: finance-explainers
 * Neutral, configurable financial storytelling primitives. These visuals explain
 * relationships and assumptions; they are not investment advice.
 */
export type FinanceVariant =
  | "budget-flow"
  | "compound-growth"
  | "cash-flow"
  | "portfolio-mix"
  | "savings-goal"
  | "debt-paydown"
  | "market-cycle"
  | "unit-economics"
  | "revenue-funnel"
  | "risk-return";

export interface FinanceDatum {
  label: string;
  value: number;
  secondary?: number;
  color?: string;
}

export interface FinanceProps {
  variant: FinanceVariant;
  title: string;
  subtitle: string;
  paletteName: string;
  currency?: string;
  prefix?: string;
  suffix?: string;
  amounts?: number[];
  values?: number[];
  labels?: string[];
  data?: FinanceDatum[];
  series?: FinanceDatum[];
  assumptions?: string[];
  disclaimer?: string;
  accentColor?: string;
  target?: number;
  principal?: number;
  rate?: number;
  years?: number;
  monthlyContribution?: number;
  debt?: number;
  income?: number;
  expenses?: number;
}

const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';
const MONO = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
const FALLBACK = [
  { label: "Housing", value: 1800 },
  { label: "Living", value: 860 },
  { label: "Goals", value: 540 },
  { label: "Flex", value: 300 },
];

const safe = (value: unknown, fallback = 0): number => {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return n;
};
const positive = (value: unknown, fallback = 1): number => Math.max(0, safe(value, fallback));
const list = (p: FinanceProps): FinanceDatum[] => {
  const input = p.data?.length ? p.data : p.series?.length ? p.series : [];
  if (input.length) return input.map((d, i) => ({ label: d.label || `Item ${i + 1}`, value: safe(d.value), secondary: safe(d.secondary), color: d.color }));
  if (p.values?.length) return p.values.map((value, i) => ({ label: p.labels?.[i] ?? `Item ${i + 1}`, value: safe(value) }));
  if (p.amounts?.length) return p.amounts.map((value, i) => ({ label: p.labels?.[i] ?? `Item ${i + 1}`, value: safe(value) }));
  return FALLBACK;
};
const colors = (pal: Palette, accent?: string): string[] => [accent ?? pal.primary, pal.secondary, pal.accent, "#a78bfa", "#22d3ee", "#fbbf24"];
const money = (value: number, p: FinanceProps, compact = false): string => {
  const n = safe(value);
  const abs = Math.abs(n);
  let body: string;
  if (compact && abs >= 1_000_000) body = `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  else if (compact && abs >= 1_000) body = `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  else body = Math.round(n).toLocaleString("en-US");
  return `${p.prefix ?? p.currency ?? "$"}${body}${p.suffix ?? ""}`;
};
const pct = (value: number): string => `${Math.round(safe(value) * 100)}%`;
const ease = (frame: number, start: number, end: number): number => clampInterp(frame, [start, end], [0, 1]);
const maxOf = (items: FinanceDatum[], fallback = 1): number => Math.max(fallback, ...items.map((d) => positive(d.value)));
const fmtLabel = (label: string): string => label.length > 18 ? `${label.slice(0, 17)}…` : label;

const Frame: React.FC<{ p: FinanceProps; pal: Palette; children: React.ReactNode }> = ({ p, pal, children }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ padding: "76px 106px 68px", color: pal.text, fontFamily: FONT }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", height: 122 }}>
        <div>
          <div style={{ fontSize: 48, lineHeight: 1.03, fontWeight: 800, letterSpacing: "-0.04em" }}>{p.title}</div>
          <div style={{ marginTop: 14, color: `${pal.text}91`, fontSize: 22 }}>{p.subtitle}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 11, color: `${pal.text}74`, fontSize: 15, textTransform: "uppercase", letterSpacing: "0.15em" }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: p.accentColor ?? pal.accent, boxShadow: `0 0 18px ${p.accentColor ?? pal.accent}`, opacity: 0.65 + Math.sin(frame * 0.1) * 0.2 }} />
          Scenario model
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
      <div style={{ position: "absolute", left: 106, right: 106, bottom: 25, display: "flex", justifyContent: "space-between", color: `${pal.text}55`, fontSize: 13, letterSpacing: "0.06em" }}>
        <span>{p.disclaimer ?? "Illustrative scenario · not financial advice"}</span>
        <span>{(p.assumptions?.[0] ?? "Adjust assumptions to fit your model")}</span>
      </div>
    </AbsoluteFill>
  );
};

const Panel: React.FC<{ pal: Palette; children: React.ReactNode; style?: React.CSSProperties }> = ({ pal, children, style }) => (
  <div style={{ height: "100%", borderRadius: 30, border: `1px solid ${pal.text}1c`, background: `linear-gradient(145deg, ${pal.text}0d, ${pal.text}04)`, boxShadow: `0 28px 70px ${pal.bg}aa`, padding: 34, ...style }}>{children}</div>
);

const Background: React.FC<{ pal: Palette }> = ({ pal }) => (
  <>
    <AbsoluteFill style={{ background: `radial-gradient(circle at 82% 16%, ${pal.primary}24, transparent 35%), radial-gradient(circle at 15% 90%, ${pal.accent}19, transparent 34%), ${pal.bg}` }} />
    <GradientMeshBackground palette={pal} blobs={3} speed={0.2} />
    <AbsoluteFill style={{ opacity: 0.18, backgroundImage: `linear-gradient(${pal.text}0a 1px, transparent 1px), linear-gradient(90deg, ${pal.text}0a 1px, transparent 1px)`, backgroundSize: "72px 72px", maskImage: "linear-gradient(to bottom, transparent, black 35%, transparent)" }} />
  </>
);

const Bars: React.FC<{ items: FinanceDatum[]; pal: Palette; p: FinanceProps; horizontal?: boolean; max?: number }> = ({ items, pal, p, horizontal = false, max }) => {
  const frame = useCurrentFrame();
  const palette = colors(pal, p.accentColor);
  const hi = max ?? maxOf(items);
  return (
    <div style={{ display: "flex", flexDirection: horizontal ? "column" : "row", alignItems: horizontal ? "stretch" : "flex-end", gap: horizontal ? 18 : 28, height: "100%", width: "100%" }}>
      {items.map((item, i) => {
        const t = ease(frame, 10 + i * 5, 50 + i * 5);
        const ratio = Math.min(1, positive(item.value) / hi) * t;
        return <div key={`${item.label}-${i}`} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: horizontal ? "row" : "column", alignItems: horizontal ? "center" : "stretch", gap: horizontal ? 18 : 10, opacity: t, transform: horizontal ? `translateX(${(1 - t) * 24}px)` : undefined }}>
          <div style={{ width: horizontal ? 178 : "100%", color: `${pal.text}a6`, fontSize: 17, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtLabel(item.label)}</div>
          <div style={{ flex: 1, height: horizontal ? 22 : `${Math.max(3, ratio * 78)}%`, minHeight: horizontal ? 22 : 4, borderRadius: 10, background: `linear-gradient(90deg, ${item.color ?? palette[i % palette.length]}, ${item.color ?? palette[i % palette.length]}77)`, transformOrigin: horizontal ? "left" : "bottom", boxShadow: `0 12px 28px ${item.color ?? palette[i % palette.length]}28` }} />
          <div style={{ width: horizontal ? 106 : "100%", textAlign: horizontal ? "right" : "center", fontFamily: MONO, color: pal.text, fontSize: 19, fontWeight: 700 }}>{money(item.value * t, p, true)}</div>
        </div>;
      })}
    </div>
  );
};

const BudgetFlow: React.FC<{ p: FinanceProps; pal: Palette }> = ({ p, pal }) => {
  const items = list(p);
  const income = positive(p.income, Math.max(1, items.reduce((s, d) => s + positive(d.value), 0) * 1.22));
  const spent = items.reduce((s, d) => s + positive(d.value), 0);
  const save = Math.max(0, income - spent);
  const frame = useCurrentFrame();
  return <Panel pal={pal} style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 48 }}>
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
      <div style={{ color: `${pal.text}85`, fontSize: 17, letterSpacing: "0.16em", textTransform: "uppercase" }}>Monthly inflow</div>
      <div style={{ marginTop: 18, fontFamily: MONO, fontSize: 72, fontWeight: 800 }}>{money(income * ease(frame, 8, 62), p, true)}</div>
      <div style={{ width: 280, height: 280, borderRadius: "50%", marginTop: 30, background: `conic-gradient(${pal.primary} ${Math.min(100, spent / income * 100 * ease(frame, 8, 62))}%, ${pal.text}12 0)`, display: "grid", placeItems: "center" }}><div style={{ width: 205, height: 205, borderRadius: "50%", background: pal.bg, display: "grid", placeItems: "center", textAlign: "center" }}><div><div style={{ color: pal.secondary, fontFamily: MONO, fontSize: 35, fontWeight: 800 }}>{money(save * ease(frame, 8, 62), p, true)}</div><div style={{ color: `${pal.text}6e`, fontSize: 15, marginTop: 6 }}>available to save</div></div></div></div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 22 }}><div style={{ color: `${pal.text}74`, fontSize: 16, letterSpacing: "0.14em", textTransform: "uppercase" }}>Where it goes</div><div style={{ height: 460 }}><Bars items={items} pal={pal} p={p} horizontal max={income} /></div></div>
  </Panel>;
};

const CompoundGrowth: React.FC<{ p: FinanceProps; pal: Palette }> = ({ p, pal }) => {
  const frame = useCurrentFrame(); const { width } = useVideoConfig();
  const principal = positive(p.principal, positive(p.amounts?.[0], 1000)); const rate = Math.max(0, safe(p.rate, 0.08)); const years = Math.max(1, safe(p.years, 10)); const contribution = positive(p.monthlyContribution, 100);
  const values = Array.from({ length: 13 }, (_, i) => principal * Math.pow(1 + rate, i * years / 12) + contribution * i * years / 12);
  const progress = ease(frame, 10, 76); const hi = Math.max(...values) * 1.1; const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${(i / 12) * 1100},${550 - (v / hi) * 500}`).join(" ");
  return <Panel pal={pal} style={{ display: "grid", gridTemplateColumns: "1fr 0.34fr", gap: 34 }}><div style={{ position: "relative" }}><div style={{ position: "absolute", left: 18, top: 16, color: `${pal.text}70`, fontSize: 16 }}>Illustrative balance over time</div><svg viewBox="0 0 1160 650" width="100%" height="100%" style={{ overflow: "visible" }}><path d={`M0,550 L${progress * 1100},550 L${progress * 1100},${550 - (values[Math.min(12, Math.floor(progress * 12))] / hi) * 500} ${path}`} fill={`${pal.primary}22`} stroke="none" /><path d={path} fill="none" stroke={pal.primary} strokeWidth="9" strokeLinecap="round" strokeDasharray="1" pathLength="1" strokeDashoffset={1 - progress} /><line x1="0" y1="550" x2="1100" y2="550" stroke={`${pal.text}35`} strokeDasharray="8 12" />{[0, 4, 8, 12].map((i) => <text key={i} x={(i / 12) * 1100} y="600" fill={`${pal.text}73`} fontSize="19" textAnchor="middle" fontFamily={MONO}>{Math.round(i * years / 12)}y</text>)}</svg></div><div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 28 }}><div style={{ color: `${pal.text}78`, fontSize: 16, letterSpacing: "0.12em", textTransform: "uppercase" }}>At a glance</div><div><div style={{ color: `${pal.text}6e`, fontSize: 16 }}>Projected balance</div><div style={{ color: pal.text, fontFamily: MONO, fontSize: 44, fontWeight: 800 }}>{money(values[12] * progress, p, true)}</div></div><div><div style={{ color: `${pal.text}6e`, fontSize: 16 }}>Assumed annual rate</div><div style={{ color: pal.secondary, fontFamily: MONO, fontSize: 34, fontWeight: 750 }}>{(rate * 100).toFixed(1)}%</div></div><div style={{ borderLeft: `3px solid ${pal.accent}`, paddingLeft: 15, color: `${pal.text}75`, fontSize: 15, lineHeight: 1.5 }}>The result changes materially when contributions, rate, or time change.</div></div></Panel>;
};

const CashFlow: React.FC<{ p: FinanceProps; pal: Palette }> = ({ p, pal }) => {
  const items = list(p); const frame = useCurrentFrame(); const vals = items.slice(0, 7); const hi = Math.max(1, ...vals.map((d) => Math.abs(d.value))); let running = 0;
  return <Panel pal={pal}><div style={{ color: `${pal.text}75`, fontSize: 17, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 25 }}>Inflow → outflow bridge</div><div style={{ height: "78%", display: "flex", alignItems: "flex-end", gap: 23 }}>{vals.map((d, i) => { const before = running; running += d.value; const t = ease(frame, 8 + i * 5, 44 + i * 5); const positiveBar = d.value >= 0; const base = positiveBar ? before : running; return <div key={`${d.label}-${i}`} style={{ flex: 1, height: "100%", position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", opacity: t }}><div style={{ position: "absolute", bottom: `${Math.min(82, Math.max(3, (Math.max(0, base + (positiveBar ? d.value : 0)) / hi) * 62))}%`, height: `${Math.max(3, Math.abs(d.value) / hi * 62 * t)}%`, width: "74%", borderRadius: 12, background: d.color ?? (positiveBar ? pal.primary : pal.accent), transformOrigin: "bottom" }} /><div style={{ marginBottom: 15, fontFamily: MONO, fontSize: 19, fontWeight: 700 }}>{money(d.value * t, p, true)}</div><div style={{ color: `${pal.text}9a`, fontSize: 16, textAlign: "center", maxWidth: 125 }}>{fmtLabel(d.label)}</div></div>; })}</div><div style={{ marginTop: 28, height: 2, background: `${pal.text}28` }} /><div style={{ marginTop: 18, color: `${pal.text}68`, fontSize: 15 }}>Positive bars add to the running balance; negative bars subtract from it.</div></Panel>;
};

const PortfolioMix: React.FC<{ p: FinanceProps; pal: Palette }> = ({ p, pal }) => {
  const items = list(p).slice(0, 6); const total = Math.max(1, items.reduce((s, d) => s + positive(d.value), 0)); const t = ease(useCurrentFrame(), 8, 68); const palette = colors(pal, p.accentColor); let offset = 0;
  return <Panel pal={pal} style={{ display: "grid", gridTemplateColumns: "1fr 0.9fr", alignItems: "center", gap: 28 }}><div style={{ position: "relative", display: "grid", placeItems: "center" }}><svg width="520" height="520" viewBox="0 0 520 520" style={{ transform: "rotate(-90deg)" }}><circle cx="260" cy="260" r="190" fill="none" stroke={`${pal.text}12`} strokeWidth="70" />{items.map((d, i) => { const length = positive(d.value) / total * Math.PI * 2 * 190; const start = offset; offset += length; return <circle key={i} cx="260" cy="260" r="190" fill="none" stroke={d.color ?? palette[i % palette.length]} strokeWidth="70" strokeDasharray={`${length * t} ${Math.PI * 2 * 190 - length * t}`} strokeDashoffset={-start} strokeLinecap="round" />; })}</svg><div style={{ position: "absolute", textAlign: "center" }}><div style={{ fontFamily: MONO, fontSize: 42, fontWeight: 800 }}>{money(total * t, p, true)}</div><div style={{ color: `${pal.text}6f`, fontSize: 15 }}>modeled total</div></div></div><div style={{ display: "flex", flexDirection: "column", gap: 19 }}>{items.map((d, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "15px 1fr auto", gap: 13, alignItems: "center", opacity: t }}><span style={{ width: 12, height: 12, borderRadius: 3, background: d.color ?? palette[i % palette.length] }} /><span style={{ color: `${pal.text}b1`, fontSize: 20 }}>{fmtLabel(d.label)}</span><span style={{ fontFamily: MONO, fontWeight: 700 }}>{pct(d.value / total)}</span></div>)}</div></Panel>;
};

const SavingsGoal: React.FC<{ p: FinanceProps; pal: Palette }> = ({ p, pal }) => {
  const target = positive(p.target, 12000); const saved = positive(p.principal, positive(p.amounts?.[0], 4200)); const t = ease(useCurrentFrame(), 10, 68); const ratio = Math.min(1, saved / target) * t;
  return <Panel pal={pal} style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 56, alignItems: "center" }}><div style={{ display: "grid", placeItems: "center" }}><div style={{ width: 330, height: 330, borderRadius: "50%", background: `conic-gradient(${p.accentColor ?? pal.secondary} ${ratio * 360}deg, ${pal.text}12 0)`, display: "grid", placeItems: "center" }}><div style={{ width: 245, height: 245, borderRadius: "50%", background: pal.bg, display: "grid", placeItems: "center", textAlign: "center" }}><div><div style={{ fontFamily: MONO, fontSize: 50, fontWeight: 800 }}>{pct(ratio)}</div><div style={{ color: `${pal.text}76`, fontSize: 16 }}>toward goal</div></div></div></div></div><div><div style={{ color: `${pal.text}75`, fontSize: 17, letterSpacing: "0.13em", textTransform: "uppercase" }}>Savings milestone</div><div style={{ marginTop: 15, fontFamily: MONO, fontSize: 53, fontWeight: 800 }}>{money(saved * t, p, true)} <span style={{ color: `${pal.text}58`, fontSize: 31 }}>/ {money(target, p, true)}</span></div><div style={{ marginTop: 34, height: 18, borderRadius: 99, background: `${pal.text}13`, overflow: "hidden" }}><div style={{ width: `${ratio * 100}%`, height: "100%", borderRadius: 99, background: `linear-gradient(90deg, ${pal.primary}, ${pal.secondary})` }} /></div><div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, color: `${pal.text}72`, fontSize: 17 }}><span>Start</span><span>{p.assumptions?.[0] ?? "Adjust monthly deposit to change the timeline"}</span><span>Goal</span></div></div></Panel>;
};

const DebtPaydown: React.FC<{ p: FinanceProps; pal: Palette }> = ({ p, pal }) => {
  const debt = positive(p.debt, positive(p.principal, 18000)); const items = Array.from({ length: 6 }, (_, i) => ({ label: `Month ${i + 1}`, value: debt * Math.pow(0.86, i) })); const t = ease(useCurrentFrame(), 8, 70);
  return <Panel pal={pal}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}><div style={{ color: `${pal.text}76`, fontSize: 17, letterSpacing: "0.13em", textTransform: "uppercase" }}>Balance path</div><div style={{ fontFamily: MONO, fontSize: 27, color: pal.secondary }}>{money(debt * Math.pow(0.86, 5) * t, p, true)} remaining</div></div><div style={{ height: "70%" }}><Bars items={items} pal={pal} p={p} max={debt} /></div><div style={{ marginTop: 27, display: "flex", gap: 12, alignItems: "center", color: `${pal.text}73`, fontSize: 16 }}><span style={{ width: 11, height: 11, borderRadius: 99, background: pal.accent }} /> Principal decreases as each modeled payment lands.</div></Panel>;
};

const MarketCycle: React.FC<{ p: FinanceProps; pal: Palette }> = ({ p, pal }) => {
  const frame = useCurrentFrame(); const t = ease(frame, 8, 75); const width = 1320; const values = Array.from({ length: 50 }, (_, i) => 0.5 + Math.sin(i * 0.24) * 0.27 + Math.sin(i * 0.08) * 0.18); const path = values.map((v, i) => `${i ? "L" : "M"}${(i / 49) * width},${490 - v * 360}`).join(" "); const phases = ["Expansion", "Peak", "Contraction", "Recovery"];
  return <Panel pal={pal} style={{ position: "relative" }}><div style={{ position: "absolute", left: 34, right: 34, top: 62, display: "flex", justifyContent: "space-between", color: `${pal.text}73`, fontSize: 17 }}>{phases.map((x) => <span key={x}>{x}</span>)}</div><svg viewBox={`0 0 ${width} 580`} width="100%" height="100%" style={{ marginTop: 18 }}><path d="M0 490 H1320" stroke={`${pal.text}23`} strokeDasharray="8 12" /><path d={path} fill="none" stroke={pal.primary} strokeWidth="9" strokeLinecap="round" strokeDasharray="1" pathLength="1" strokeDashoffset={1 - t} /><path d={`M0,490 ${path.slice(1)} L1320,490 Z`} fill={`${pal.primary}12`} /></svg><div style={{ position: "absolute", left: 34, right: 34, bottom: 38, display: "flex", justifyContent: "space-between", color: `${pal.text}57`, fontSize: 15 }}><span>Illustrative cycle shape</span><span>Past movement does not predict future results</span></div></Panel>;
};

const UnitEconomics: React.FC<{ p: FinanceProps; pal: Palette }> = ({ p, pal }) => {
  const data = list(p); const customer = positive(data[0]?.value, 120); const ltv = positive(data[1]?.value, 680); const margin = positive(data[2]?.value, 0.42); const t = ease(useCurrentFrame(), 10, 62); const cards = [{ label: "Acquisition cost", value: money(customer * t, p, true), color: pal.accent }, { label: "Lifetime value", value: money(ltv * t, p, true), color: pal.secondary }, { label: "Gross margin", value: `${Math.round(margin * 100)}%`, color: pal.primary }];
  return <Panel pal={pal} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, alignItems: "stretch" }}>{cards.map((card, i) => <div key={card.label} style={{ borderRadius: 24, padding: 30, border: `1px solid ${card.color}35`, background: `${card.color}0b`, display: "flex", flexDirection: "column", justifyContent: "space-between", opacity: t, transform: `translateY(${(1 - t) * 25}px)` }}><div style={{ width: 42, height: 5, borderRadius: 9, background: card.color }} /><div><div style={{ color: `${pal.text}70`, fontSize: 18 }}>{card.label}</div><div style={{ marginTop: 14, color: pal.text, fontFamily: MONO, fontSize: 48, fontWeight: 800 }}>{card.value}</div></div><div style={{ color: `${pal.text}65`, fontSize: 16, lineHeight: 1.4 }}>{i === 0 ? "Cost to create one new customer" : i === 1 ? "Value retained across the relationship" : "Share left after direct costs"}</div></div>)}</Panel>;
};

const RevenueFunnel: React.FC<{ p: FinanceProps; pal: Palette }> = ({ p, pal }) => {
  const items = list(p).slice(0, 5); const fallback = [10000, 4200, 1600, 620, 210]; const rows = items.length > 1 ? items : fallback.map((value, i) => ({ label: ["Visitors", "Leads", "Trials", "Customers", "Revenue"][i], value })); const hi = maxOf(rows); const t = ease(useCurrentFrame(), 8, 70); const palette = colors(pal, p.accentColor);
  return <Panel pal={pal} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 13 }}>{rows.map((d, i) => { const width = (Math.max(0.16, d.value / hi) * 80) * t; return <div key={`${d.label}-${i}`} style={{ width: `${width}%`, minWidth: 210, flex: 1, borderRadius: 14, background: `linear-gradient(90deg, ${palette[i % palette.length]}cc, ${palette[i % palette.length]}55)`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 26px", opacity: t, transform: `translateY(${(1 - t) * 18}px)` }}><span style={{ fontSize: 19, fontWeight: 700 }}>{fmtLabel(d.label)}</span><span style={{ fontFamily: MONO, fontSize: 21 }}>{money(d.value * t, p, true)}</span></div>; })}</Panel>;
};

const RiskReturn: React.FC<{ p: FinanceProps; pal: Palette }> = ({ p, pal }) => {
  const items = list(p).slice(0, 7); const points = items.length > 1 ? items : [{ label: "Cash", value: 0.08, secondary: 0.02 }, { label: "Balanced", value: 0.24, secondary: 0.11 }, { label: "Growth", value: 0.48, secondary: 0.22 }, { label: "Speculative", value: 0.72, secondary: 0.41 }]; const t = ease(useCurrentFrame(), 10, 72); const palette = colors(pal, p.accentColor);
  return <Panel pal={pal} style={{ position: "relative" }}><div style={{ position: "absolute", left: 42, bottom: 47, right: 32, borderTop: `2px solid ${pal.text}45` }} /><div style={{ position: "absolute", left: 53, top: 40, bottom: 50, borderLeft: `2px solid ${pal.text}45` }} /><div style={{ position: "absolute", left: 50, bottom: 24, color: `${pal.text}69`, fontSize: 15 }}>Risk / volatility →</div><div style={{ position: "absolute", left: 10, top: 38, color: `${pal.text}69`, fontSize: 15, transform: "rotate(-90deg)", transformOrigin: "left top" }}>Potential return →</div>{points.map((d, i) => { const x = Math.min(92, 8 + positive(d.value, 0.2) * 100) * t; const y = Math.max(8, 88 - positive(d.secondary, d.value * 0.55) * 100) * t + 8 * (1 - t); return <div key={`${d.label}-${i}`} style={{ position: "absolute", left: `${x}%`, bottom: `${y}%`, width: 27, height: 27, borderRadius: 99, background: palette[i % palette.length], boxShadow: `0 0 0 8px ${palette[i % palette.length]}1d, 0 8px 22px ${palette[i % palette.length]}55`, transform: "translate(-50%, 50%)", opacity: t }}><div style={{ position: "absolute", left: 39, top: -9, whiteSpace: "nowrap", color: `${pal.text}c0`, fontSize: 16 }}>{fmtLabel(d.label)}</div></div>; })}</Panel>;
};

const VARIANTS: Record<FinanceVariant, React.FC<{ p: FinanceProps; pal: Palette }>> = {
  "budget-flow": BudgetFlow,
  "compound-growth": CompoundGrowth,
  "cash-flow": CashFlow,
  "portfolio-mix": PortfolioMix,
  "savings-goal": SavingsGoal,
  "debt-paydown": DebtPaydown,
  "market-cycle": MarketCycle,
  "unit-economics": UnitEconomics,
  "revenue-funnel": RevenueFunnel,
  "risk-return": RiskReturn,
};

export const FinanceExplainersTemplate: React.FC<FinanceProps> = (props) => {
  const pal = resolvePalette(props.paletteName);
  const Variant = VARIANTS[props.variant] ?? BudgetFlow;
  const { width, height } = useVideoConfig();
  const fit = Math.min(width / 1920, height / 1080);
  return <AbsoluteFill style={{ backgroundColor: pal.bg }}><Background pal={pal} /><FadeEdges inFrames={12} outFrames={14}><div style={{ position: "absolute", left: "50%", top: "50%", width: 1920, height: 1080, transform: `translate(-50%, -50%) scale(${fit})`, transformOrigin: "center center" }}><Frame p={props} pal={pal}><Variant p={props} pal={pal} /></Frame></div></FadeEdges></AbsoluteFill>;
};

const familyCast = (component: React.FC<FinanceProps>) => component as unknown as React.ComponentType<Record<string, unknown>>;
export const FAMILY_COMPONENTS: Record<string, React.ComponentType<Record<string, unknown>>> = {
  "finance-explainers-budget-flow": familyCast(FinanceExplainersTemplate),
  "finance-explainers-compound-growth": familyCast(FinanceExplainersTemplate),
  "finance-explainers-cash-flow": familyCast(FinanceExplainersTemplate),
  "finance-explainers-portfolio-mix": familyCast(FinanceExplainersTemplate),
  "finance-explainers-savings-goal": familyCast(FinanceExplainersTemplate),
  "finance-explainers-debt-paydown": familyCast(FinanceExplainersTemplate),
  "finance-explainers-market-cycle": familyCast(FinanceExplainersTemplate),
  "finance-explainers-unit-economics": familyCast(FinanceExplainersTemplate),
  "finance-explainers-revenue-funnel": familyCast(FinanceExplainersTemplate),
  "finance-explainers-risk-return": familyCast(FinanceExplainersTemplate),
};
