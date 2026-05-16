import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../supabase.server";
import { useState } from "react";
// No external chart library needed - using inline SVG
 
 
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
 
  try {
    const { data: videos } = await supabase
      .from("videos")
      .select("id, status, views, created_at, product_ids")
      .eq("shop_id", shop);
 
    const { data: events } = await supabase
      .from("video_events")
      .select("*")
      .eq("shop_id", shop)
      .order("created_at", { ascending: true });
 
    const total = videos?.length || 0;
    const live = videos?.filter(v => v.status === "live").length || 0;
    const totalViews = videos?.reduce((sum, v) => sum + (v.views || 0), 0) || 0;
    const withProducts = videos?.filter(v => v.product_ids?.length > 0).length || 0;
 
    // Build daily chart data from events (last 90 days)
    const eventsData = events || [];
    const dailyMap = {};
    eventsData.forEach(e => {
      const day = e.created_at?.slice(0, 10);
      if (!day) return;
      if (!dailyMap[day]) dailyMap[day] = { date: day, views: 0, clicks: 0, orders: 0, watch_seconds: 0 };
      if (e.event_type === "view")   dailyMap[day].views++;
      if (e.event_type === "click")  dailyMap[day].clicks++;
      if (e.event_type === "order")  dailyMap[day].orders++;
      if (e.event_type === "watch")  dailyMap[day].watch_seconds += (e.value || 0);
    });
 
    // Fill in views from videos.views if no events table yet
    // (graceful fallback: spread total views across all-time evenly)
    const chartData = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
 
    // Aggregate metrics from events
    const totalClicks      = eventsData.filter(e => e.event_type === "click").length;
    const totalOrders      = eventsData.filter(e => e.event_type === "order").length;
    const totalWatchSec    = eventsData.filter(e => e.event_type === "watch").reduce((s, e) => s + (e.value || 0), 0);
    const totalRevenue     = eventsData.filter(e => e.event_type === "order").reduce((s, e) => s + (e.value || 0), 0);
    const avgOrderValue    = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const conversionRate   = totalViews > 0 ? ((totalOrders / totalViews) * 100).toFixed(2) : "0.00";
    const watchHours       = (totalWatchSec / 3600).toFixed(1);
    const impressionSales  = totalRevenue;
 
    // Build chart from video_events if available, else show totalViews on today
    let finalChartData = chartData;
    if (finalChartData.length === 0 && totalViews > 0) {
      // No events table yet — show total views on today's date so graph isn't empty
      const today = new Date().toISOString().slice(0, 10);
      finalChartData = [{ date: today, views: totalViews, clicks: 0, orders: 0 }];
    }
 
    return {
      total, live, totalViews, withProducts,
      totalClicks, totalOrders, totalWatchSec,
      totalRevenue, avgOrderValue, conversionRate,
      watchHours, impressionSales,
      chartData: finalChartData,
    };
  } catch (e) {
    console.error("Dashboard loader error:", e);
    return {
      total: 0, live: 0, totalViews: 0, withProducts: 0,
      totalClicks: 0, totalOrders: 0, totalWatchSec: 0,
      totalRevenue: 0, avgOrderValue: 0, conversionRate: "0.00",
      watchHours: "0.0", impressionSales: 0,
      chartData: [],
    };
  }
};
 
 
const RANGES = [
  { label: "Last 7 days",  days: 7 },
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
  const data = useLoaderData();
  const navigate = useNavigate();
 
  const [activeRange, setActiveRange] = useState(1);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
 
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
 
 
  // Filter chartData by selected range
 
  const stats = [
    { label: "Total Videos",        value: fmtNum(data.total),         sub: `${data.live} live` },
    { label: "Total Views",          value: fmtNum(data.totalViews),     sub: "Cumulative" },
    { label: "Buy Now Clicks",       value: fmtNum(data.totalClicks),     sub: "Product taps" },
    { label: "Total Orders",         value: fmtNum(data.totalOrders),     sub: "From videos" },
    { label: "Watch Time",           value: data.watchHours + " hrs",     sub: "Total watched" },
  ];
 
  const engagement = [
    { label: "Total Engagement",       value: fmtNum((data.totalViews || 0) + (data.totalClicks || 0)) },
    { label: "Product Clicks",         value: fmtNum(data.totalClicks) },
    { label: "Impression Sales",       value: fmtINR(data.impressionSales) },
    { label: "Avg Order Value",        value: fmtINR(data.avgOrderValue) },
    { label: "Video Watched Sessions", value: fmtNum(data.totalViews) },
    { label: "Video Conversion Rate",  value: data.conversionRate + "%" },
  ];
  const s = {
    page: {
      padding: "28px 32px",
      background: "#f8f9fb",
      fontFamily: "'Inter', system-ui, sans-serif" ,
      minHeight: "100vh",
    },
    header: {
      display: "flex", justifyContent: "space-between",
      alignItems: "center", marginBottom: "28px",
    },
    title: { margin: 0, fontSize: "20px", fontWeight: "500", color: "#000" },
    manageBtn: {
      padding: "10px 22px", background: "#485861", color: "#fff",
      border: "#0a0a0a", borderRadius: "8px", cursor: "pointer",
      fontSize: "14px", fontWeight: "500",
    },

    // Range selector
    rangeWrap: {
      display: "flex", alignItems: "center",
    gap: "6px", marginBottom: "24px",
    flexWrap: "wrap", padding: "12px 16px",
    background: "#fafaf8", borderRadius: "10px",
    border: "1px solid #f0f0ee"
    },
    rangeLabel: { fontSize: "13px", fontWeight: "600", color: "#64748b", marginRight: "4px" },
    rangeBtn: (active) => ({
      padding: "6px 12px", borderRadius: "20px", border: "none",
      cursor: "pointer", fontSize: "12px", fontWeight: "500",
      background: active ? "#485861" : "#fff",
      color: active ? "#fff" : "#6b6b66",
      transition: "all 0.15s",
    }),
    dateInput: {
      padding: "7px 12px", border: "1.5px solid #e2e8f0",
      borderRadius: "8px", fontSize: "13px", color: "#0f172a",
      background: "#fff", cursor: "pointer",
    },
    dateSep: { color: "#94a3b8", fontSize: "14px" },

    // Stat cards row
    statsRow: {
      display: "grid",
      gridTemplateColumns: "repeat(5, 1fr)",
      gap: "16px", marginBottom: "28px",
    },
    statCard: {
      background: "#fff", borderRadius: "10px",
      padding: "20px 18px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
      border: "1px solid #f1f5f9", borderTop: "1px solid #485861"
    },
    statLabel: { fontSize: "12px", fontWeight: "500", color: "#9a9a93", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" },
    statValue: { fontSize: "28px", fontWeight: "300", color: "#0a0a0a", lineHeight: 1 },
    statSub:   { fontSize: "11px", color: "#9a9a93", marginTop: "6px" },

    // Chart card
    chartCard: {
      background: "#fff", borderRadius: "14px",
      padding: "24px", marginBottom: "28px",
      border: "1px solid #f1f5f9",
      borderTop: "1px solid #485861"
    },
    chartHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" },
    chartTitle: { margin: 0, fontSize: "16px", fontWeight: "500", color: "#0f172a" },
    metricBtns: { display: "flex", gap: "8px" },
    metricBtn: (active, color) => ({
      padding: "6px 16px", borderRadius: "20px", border: "2px solid",
      borderColor: active ? color : "#485861",
      background: active ? color : "#fff",
      color: active ? "#fff" : "#485861",
      cursor: "pointer", fontSize: "13px", fontWeight: "500",
      transition: "all 0.15s",
    }),

    // Engagement grid
    engTitle: { fontSize: "17px", fontWeight: "700", color: "#0f172a", marginBottom: "16px" },
    engGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "16px",
    },
    engCard: {
      background: "#fff", borderRadius: "14px",
      padding: "20px 22px",
      border: "1px solid #f1f5f9",
      borderTop: "1px solid #485861"
    },
    engLabel: { fontSize: "12px", fontWeight: "600", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" },
    engValue: { fontSize: "16px", fontWeight: "500", color: "#0f172a" },
  };

  const activeMetricObj = METRICS.find(m => m.key === activeMetric);
 
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
 
      {/* Top Stats Row */}
      <div style={s.statsRow}>
        {stats.map(st => (
          <div key={st.label} style={s.statCard}>
            <div style={s.statLabel}>{st.label}</div>
            <div style={s.statValue}>{st.value}</div>
            <div style={s.statSub}>{st.sub}</div>
          </div>
        ))}
      </div>
 
      {/* Engagement Metrics */}
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