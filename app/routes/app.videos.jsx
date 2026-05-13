import { useLoaderData, Link } from "react-router";
import { json } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../supabase.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const { data: videos } = await supabase
    .from("videos")
    .select("*")
    .eq("shop_id", shop)
    .order("created_at", { ascending: false });

  return json({ videos: videos || [] });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const id = formData.get("id");
  const action = formData.get("action");

  if (action === "delete") {
    await supabase.from("videos").delete().eq("id", id).eq("shop_id", shop);
  }

  if (action === "toggle") {
    const { data } = await supabase
      .from("videos")
      .select("status")
      .eq("id", id)
      .single();
    const newStatus = data.status === "live" ? "draft" : "live";
    await supabase.from("videos").update({ status: newStatus }).eq("id", id);
  }

  return json({ ok: true });
};

export default function Videos() {
  const { videos } = useLoaderData();

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Video Manager</h1>
        <Link to="/app/videos/new">
          <button style={{ padding: "10px 20px", background: "#008060", color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}>
            + Import Video
          </button>
        </Link>
      </div>

      {videos.length === 0 ? (
        <div style={{ marginTop: "40px", textAlign: "center", color: "#666" }}>
          <p>No videos yet. Import your first video!</p>
          <Link to="/app/videos/new">
            <button style={{ padding: "10px 20px", background: "#008060", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", marginTop: "10px" }}>
              + Import Video
            </button>
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "20px", marginTop: "20px" }}>
          {videos.map((video) => (
            <div key={video.id} style={{ background: "#f4f6f8", borderRadius: "8px", overflow: "hidden" }}>
              {video.thumbnail_url && (
                <img src={video.thumbnail_url} alt={video.title} style={{ width: "100%", height: "150px", objectFit: "cover" }} />
              )}
              <div style={{ padding: "12px" }}>
                <p style={{ fontWeight: "bold", margin: "0 0 8px" }}>{video.title || "Untitled"}</p>
                <p style={{ margin: "0 0 8px", color: video.status === "live" ? "green" : "gray" }}>
                  ● {video.status}
                </p>
                <p style={{ margin: "0 0 12px", fontSize: "12px", color: "#666" }}>
                  👁 {video.views || 0} views
                </p>
                <div style={{ display: "flex", gap: "8px" }}>
                  <Link to={`/app/videos/${video.id}`}>
                    <button style={{ padding: "6px 12px", background: "#008060", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
                      Edit
                    </button>
                  </Link>
                  <form method="post">
                    <input type="hidden" name="id" value={video.id} />
                    <input type="hidden" name="action" value="toggle" />
                    <button type="submit" style={{ padding: "6px 12px", background: "#5c6ac4", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
                      {video.status === "live" ? "Draft" : "Live"}
                    </button>
                  </form>
                  <form method="post">
                    <input type="hidden" name="id" value={video.id} />
                    <input type="hidden" name="action" value="delete" />
                    <button type="submit" style={{ padding: "6px 12px", background: "#de3618", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
