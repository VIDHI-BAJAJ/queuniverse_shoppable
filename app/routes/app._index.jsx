import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../supabase.server";
import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";

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

    return {
      total, live, totalViews, withProducts,
      totalClicks, totalOrders, totalWatchSec,
      totalRevenue, avgOrderValue, conversionRate,
      watchHours, impressionSales,
      chartData,
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

const METRICS = [
  { key: "views",  label: "Watch Time (Views)", color: "#485861;" },
  { key: "clicks", label: "Video Clicks",        color: "#485861;" },
  { key: "orders", label: "Orders",              color: "#485861;" },
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

  const [activeRange, setActiveRange] = useState(1); // default Last 30 days
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [activeMetric, setActiveMetric] = useState("views");

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Filter chartData by selected range
  const filteredChart = useMemo(() => {
    let from, to;
    if (customFrom && customTo) {
      from = customFrom; to = customTo;
    } else {
      const days = RANGES[activeRange].days;
      if (!days) return data.chartData;
      const d = new Date(today);
      d.setDate(d.getDate() - days + 1);
      from = d.toISOString().slice(0, 10);
      to   = todayStr;
    }
    return data.chartData.filter(r => r.date >= from && r.date <= to);
  }, [activeRange, customFrom, customTo, data.chartData]);

  const stats = [
    { label: "Total Videos",        value: fmtNum(data.total),          icon: "🎬", sub: `${data.live} live` },
    { label: "Total Views",          value: fmtNum(data.totalViews),     icon: "👁",  sub: "Cumulative" },
    { label: "Buy Now Clicks",       value: fmtNum(data.totalClicks),    icon: "🛒", sub: "Product taps" },
    { label: "Total Orders",         value: fmtNum(data.totalOrders),    icon: "📦", sub: "From videos" },
    { label: "Watch Time",           value: data.watchHours + " hrs",    icon: "⏱",  sub: "Total watched" },
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
 
      {/* Line Chart */}
      <div style={s.chartCard}>
        <div style={s.chartHeader}>
          <h2 style={s.chartTitle}>Performance Trend</h2>
          <div style={s.metricBtns}>
            {METRICS.map(m => (
              <button
                key={m.key}
                style={s.metricBtn(activeMetric === m.key, m.color)}
                onClick={() => setActiveMetric(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {(() => {
          // Always build a full date-range skeleton so axes always show
          const buildDisplayData = () => {
            let from, to;
            if (customFrom && customTo) {
              from = new Date(customFrom); to = new Date(customTo);
            } else {
              const days = RANGES[activeRange].days;
              to = new Date(today);
              from = days ? new Date(today) : null;
              if (from && days) from.setDate(from.getDate() - days + 1);
              if (!from) {
                // All time: use last 30 days as skeleton minimum
                from = new Date(today);
                from.setDate(from.getDate() - 29);
              }
            }
            // Build every date in range with zero fallback
            const map = {};
            filteredChart.forEach(r => { map[r.date] = r; });
            const result = [];
            const cur = new Date(from);
            while (cur <= to) {
              const key = cur.toISOString().slice(0, 10);
              result.push(map[key] || { date: key, views: 0, clicks: 0, orders: 0 });
              cur.setDate(cur.getDate() + 1);
            }
            return result;
          };
 
          const displayData = buildDisplayData();
          const hasRealData = filteredChart.length > 0;
 
          return (
            <>
              {!hasRealData && (
                <p style={{ textAlign: "center", fontSize: "12px", color: "#b0b0aa", marginBottom: "4px", marginTop: 0 }}>
                  No engagement data yet — axes show your selected date range
                </p>
              )}
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={displayData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0ee" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    tickFormatter={d => {
                      const dt = new Date(d);
                      return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    allowDecimals={false}
                    domain={[0, hasRealData ? "auto" : 10]}
                    tickCount={hasRealData ? undefined : 5}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "13px" }}
                    labelFormatter={d => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                    formatter={(value) => [value, activeMetricObj.label]}
                  />
                  <Line
                    type="monotone"
                    dataKey={activeMetric}
                    stroke={hasRealData ? "#485861" : "#e2e8f0"}
                    strokeWidth={hasRealData ? 2.5 : 1.5}
                    strokeDasharray={hasRealData ? "0" : "4 4"}
                    dot={false}
                    activeDot={hasRealData ? { r: 5 } : false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </>
          );
        })()}
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