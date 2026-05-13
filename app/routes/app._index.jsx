import { useLoaderData, Link } from "react-router";
import { json } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../supabase.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const { data: videos } = await supabase
    .from("videos")
    .select("id, status, views")
    .eq("shop_id", shop);

  const total = videos?.length || 0;
  const live = videos?.filter(v => v.status === "live").length || 0;
  const totalViews = videos?.reduce((sum, v) => sum + (v.views || 0), 0) || 0;

  return json({ total, live, totalViews });
};

export default function Index() {
  const { total, live, totalViews } = useLoaderData();

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>NQ-Shoppable Dashboard</h1>
      <div style={{ display: "flex", gap: "20px", marginTop: "20px" }}>
        <div style={{ background: "#f4f6f8", padding: "20px", borderRadius: "8px", minWidth: "150px" }}>
          <h3>Total Videos</h3>
          <p style={{ fontSize: "32px", fontWeight: "bold" }}>{total}</p>
        </div>
        <div style={{ background: "#f4f6f8", padding: "20px", borderRadius: "8px", minWidth: "150px" }}>
          <h3>Live Videos</h3>
          <p style={{ fontSize: "32px", fontWeight: "bold" }}>{live}</p>
        </div>
        <div style={{ background: "#f4f6f8", padding: "20px", borderRadius: "8px", minWidth: "150px" }}>
          <h3>Total Views</h3>
          <p style={{ fontSize: "32px", fontWeight: "bold" }}>{totalViews}</p>
        </div>
      </div>
      <div style={{ marginTop: "30px" }}>
        <Link to="/app/videos">
          <button style={{ padding: "10px 20px", background: "#008060", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "16px" }}>
            Manage Videos →
          </button>
        </Link>
      </div>
    </div>
  );
}
