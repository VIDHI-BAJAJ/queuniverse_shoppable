import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../supabase.server";
import { useState, useMemo } from "react";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const { data: videos } = await supabase
      .from("videos")
      .select("id, status, views, created_at, product_ids")
      .eq("shop_id", shop);

    // Fetch ALL events — we filter by date on the frontend
    const { data: events } = await supabase
      .from("video_events")
      .select("*")
      .eq("shop_id", shop)
      .order("created_at", { ascending: true });

    const total       = videos?.length || 0;
    const live        = videos?.filter(v => v.status === "live").length || 0;
    const totalViews  = videos?.reduce((sum, v) => sum + (v.views || 0), 0) || 0;
    const withProducts = videos?.filter(v => v.product_ids?.length > 0).length || 0;

    return {
      total, live, totalViews, withProducts,
      events: events || [],   // send ALL raw events to frontend
    };
  } catch (e) {
    console.error("Dashboard loader error:", e);
    return { total: 0, live: 0, totalViews: 0, withProducts: 0, events: [] };
  }
};

const RANGES = [
  { label: "Last 7 days",  days: 7  },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All time",     days: null },
];

function fmtINR(v) {
  return "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
function fmtNum(v) {
  return Number(v || 0).toLocaleString("en-IN");
}

export default function Index() {
  const data     = useLoaderData();
  const navigate = useNavigate();

  const [activeRange, setActiveRange] = useState(1); // default: Last 30 days
  const [customFrom, setCustomFrom]   = useState("");
  const [customTo,   setCustomTo]     = useState("");

  const todayStr = new Date().toISOString().slice(0, 10);

  // ── Compute date window ──────────────────────────────────────
  const { fromDate, toDate } = useMemo(() => {
    if (customFrom && customTo) {
      return { fromDate: customFrom, toDate: customTo };
    }
    const days = RANGES[activeRange].days;
    if (!days) return { fromDate: null, toDate: null }; // All time
    const from = new Date();
    from.setDate(from.getDate() - days);
    return { fromDate: from.toISOString().slice(0, 10), toDate: todayStr };
  }, [activeRange, customFrom, customTo, todayStr]);

  // ── Filter events by date window ─────────────────────────────
  const filteredEvents = useMemo(() => {
    return (data.events || []).filter(e => {
      if (!e.created_at) return false;
      const day = e.created_at.slice(0, 10);
      if (fromDate && day < fromDate) return false;
      if (toDate   && day > toDate)   return false;
      return true;
    });
  }, [data.events, fromDate, toDate]);

  // ── Compute metrics from filtered events ─────────────────────
  const metrics = useMemo(() => {
    const clicks     = filteredEvents.filter(e => e.event_type === "click").length;
    const orders     = filteredEvents.filter(e => e.event_type === "order").length;
    const watchSec   = filteredEvents.filter(e => e.event_type === "watch")
                         .reduce((s, e) => s + (e.value || 0), 0);
    const revenue    = filteredEvents.filter(e => e.event_type === "order")
                         .reduce((s, e) => s + (e.value || 0), 0);
    const views      = filteredEvents.filter(e => e.event_type === "view").length;

    // Fall back to videos.views total if no view events recorded yet
    const displayViews   = views > 0 ? views : data.totalViews;
    const watchHours     = (watchSec / 3600).toFixed(1);
    const avgOrderValue  = orders > 0 ? revenue / orders : 0;
    const conversionRate = displayViews > 0 ? ((orders / displayViews) * 100).toFixed(2) : "0.00";

    return { clicks, orders, watchSec, watchHours, revenue, displayViews, avgOrderValue, conversionRate };
  }, [filteredEvents, data.totalViews]);

  // ── Stats cards ──────────────────────────────────────────────
  const stats = [
    { label: "Total Videos",   value: fmtNum(data.total),           sub: `${data.live} live` },
    { label: "Total Views",    value: fmtNum(metrics.displayViews),  sub: "Cumulative" },
    { label: "Buy Now Clicks", value: fmtNum(metrics.clicks),        sub: "Shop Now tag" },
    { label: "Total Orders",   value: fmtNum(metrics.orders),        sub: "From videos" },
    { label: "Watch Time",     value: metrics.watchHours + " hrs",   sub: "Total watched" },
  ];

  const engagement = [
    { label: "Total Engagement",       value: fmtNum((metrics.displayViews || 0) + (metrics.clicks || 0)) },
    { label: "Product Clicks",         value: fmtNum(metrics.clicks) },
    { label: "Impression Sales",       value: fmtINR(metrics.revenue) },
    { label: "Avg Order Value",        value: fmtINR(metrics.avgOrderValue) },
    { label: "Video Watched Sessions", value: fmtNum(metrics.displayViews) },
    { label: "Video Conversion Rate",  value: metrics.conversionRate + "%" },
  ];

  // ── Styles ───────────────────────────────────────────────────
  const s = {
    page: { padding: "28px 32px", fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100vh" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px" },
    title: { margin: 0, fontSize: "20px", fontWeight: "500", color: "#000" },
    manageBtn: { padding: "10px 22px", background: "#485861", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "500" },
    rangeWrap: { display: "flex", alignItems: "center", gap: "6px", marginBottom: "24px", flexWrap: "wrap", padding: "12px 16px", background: "#fafaf8", borderRadius: "10px", border: "1px solid #f0f0ee" },
    rangeLabel: { fontSize: "13px", fontWeight: "600", color: "#64748b", marginRight: "4px" },
    rangeBtn: (active) => ({ padding: "6px 12px", borderRadius: "20px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "500", background: active ? "#485861" : "#fff", color: active ? "#fff" : "#6b6b66", transition: "all 0.15s" }),
    dateInput: { padding: "7px 12px", border: "1.5px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", color: "#0f172a", background: "#fff", cursor: "pointer" },
    dateSep: { color: "#94a3b8", fontSize: "14px" },
    statsRow: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px", marginBottom: "28px" },
    statCard: { background: "#fff", borderRadius: "10px", padding: "20px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", border: "1px solid #f1f5f9", borderTop: "3px solid #485861" },
    statLabel: { fontSize: "12px", fontWeight: "500", color: "#9a9a93", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" },
    statValue: { fontSize: "28px", fontWeight: "300", color: "#0a0a0a", lineHeight: 1 },
    statSub:   { fontSize: "11px", color: "#9a9a93", marginTop: "6px" },
    engTitle: { fontSize: "17px", fontWeight: "700", color: "#0f172a", marginBottom: "16px" },
    engGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" },
    engCard: { background: "#fff", borderRadius: "14px", padding: "20px 22px", border: "1px solid #f1f5f9", borderTop: "3px solid #485861" },
    engLabel: { fontSize: "12px", fontWeight: "600", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" },
    engValue: { fontSize: "16px", fontWeight: "500", color: "#0f172a" },
  };

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <h1 style={s.title}>NQ-Shoppable Dashboard</h1>
        <button style={s.manageBtn} onClick={() => navigate("/app/videos")}>
          Manage Videos →
        </button>
      </div>

      {/* Date Range Selector */}
      <div style={s.rangeWrap}>
        <span style={s.rangeLabel}>RANGE</span>
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            style={s.rangeBtn(activeRange === i && !customFrom)}
            onClick={() => { setActiveRange(i); setCustomFrom(""); setCustomTo(""); }}
          >
            {r.label}
          </button>
        ))}
        <input
          type="date" style={s.dateInput}
          value={customFrom} max={todayStr}
          onChange={e => { setCustomFrom(e.target.value); setCustomTo(""); }}
        />
        <span style={s.dateSep}>→</span>
        <input
          type="date" style={s.dateInput}
          value={customTo} min={customFrom} max={todayStr}
          onChange={e => setCustomTo(e.target.value)}
        />
      </div>

      {/* Top Stats */}
      <div style={s.statsRow}>
        {stats.map(st => (
          <div key={st.label} style={s.statCard}>
            <div style={s.statLabel}>{st.label}</div>
            <div style={s.statValue}>{st.value}</div>
            <div style={s.statSub}>{st.sub}</div>
          </div>
        ))}
      </div>

      {/* Engagement */}
      <div style={s.engTitle}>Engagement Overview</div>
      <div style={s.engGrid}>
        {engagement.map(e => (
          <div key={e.label} style={s.engCard}>
            <div style={s.engLabel}>{e.label}</div>
            <div style={s.engValue}>{e.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}