import { useLoaderData, Form, useNavigation, useNavigate } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { supabase } from "../supabase.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const { data: videos } = await supabase
    .from("videos")
    .select("*")
    .eq("shop_id", shop)
    .order("created_at", { ascending: false });

  let products = [];
  try {
    const res = await admin.graphql(`
      query {
        products(first: 250, sortKey: TITLE) {
          edges {
            node {
              id
              title
              handle
              featuredImage { url }
              variants(first: 1) {
                edges { node { price } }
              }
            }
          }
        }
      }
    `);
    const pData = await res.json();
    products = pData.data.products.edges.map(e => ({
      id: e.node.id,
      title: e.node.title,
      handle: e.node.handle,
      image: e.node.featuredImage?.url,
      price: e.node.variants.edges[0]?.node.price,
    }));
  } catch (e) {
    console.error("Failed to fetch products:", e);
  }

  return { videos: videos || [], products };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const id = formData.get("id");
  const actionType = formData.get("action");

  try {
    if (actionType === "delete") {
      await supabase.from("videos").delete().eq("id", id).eq("shop_id", shop);
    }
    if (actionType === "toggle_status") {
      const { data } = await supabase.from("videos").select("status").eq("id", id).single();
      const newStatus = data.status === "live" ? "draft" : "live";
      await supabase.from("videos").update({ status: newStatus }).eq("id", id);
    }
    if (actionType === "add_to_homepage") {
      const { data } = await supabase.from("videos").select("show_on").eq("id", id).single();
      const showOn = Array.isArray(data.show_on) ? data.show_on : [];
      if (!showOn.includes("home")) {
        await supabase.from("videos").update({ show_on: [...showOn, "home"], status: "live" }).eq("id", id);
      }
    }
    if (actionType === "remove_from_homepage") {
      const { data } = await supabase.from("videos").select("show_on").eq("id", id).single();
      const showOn = Array.isArray(data.show_on) ? data.show_on : [];
      await supabase.from("videos").update({ show_on: showOn.filter(p => p !== "home") }).eq("id", id);
    }
    if (actionType === "tag_products") {
      const productIds = formData.getAll("product_ids");
      await supabase.from("videos").update({ product_ids: productIds, status: "live" }).eq("id", id).eq("shop_id", shop);
    }
  } catch (e) {
    console.error("Action error:", e);
  }

  return { ok: true };
};

export default function Videos() {
  const { videos, products } = useLoaderData();
  const navigate = useNavigate();
  const [tagModal, setTagModal] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProducts, setSelectedProducts] = useState([]);

  const C = {
    bg: "#f8f9fb", card: "#ffffff", border: "#f0f0ee",
    accent: "#485861", text: "#0a0a0a", muted: "#9a9a93",
    live: "#2d6a4f", liveBg: "#d8f3dc",
    draft: "#6b6b66", draftBg: "#f0f0ee",
    home: "#6d4c7d", homeBg: "#ede7f6",
    danger: "#c0392b", dangerBg: "#fdecea",
  };

  const openTagModal = (video) => { setTagModal(video); setSelectedProducts(video.product_ids || []); setSearchQuery(""); };
  const closeTagModal = () => { setTagModal(null); setSelectedProducts([]); };
  const toggleProduct = (id) => setSelectedProducts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const filteredProducts = searchQuery.length === 0
    ? products
    : products.filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const isOnHomepage = (v) => Array.isArray(v.show_on) && v.show_on.includes("home");

  return (
    <div style={{ padding: "28px 32px", background: C.bg, minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "600", color: C.text }}>Video Manager</h1>
          <p style={{ margin: "4px 0 0", color: C.muted, fontSize: "13px" }}>
            {videos.length} total · {videos.filter(v => v.status === "live").length} live
          </p>
        </div>
        <button
          onClick={() => navigate("/app/videos/new")}
          style={{
            padding: "10px 20px", background: C.accent, color: "#fff",
            border: "none", borderRadius: "8px", cursor: "pointer",
            fontWeight: "500", fontSize: "14px",
          }}>
          + Import Video
        </button>
      </div>

      {videos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 40px", color: C.muted }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎬</div>
          <h2 style={{ color: C.text, fontWeight: "500" }}>No videos yet</h2>
          <p style={{ fontSize: "14px", marginBottom: "20px" }}>Import your first video to get started</p>
          <button onClick={() => navigate("/app/videos/new")} style={{
            padding: "12px 28px", background: C.accent, color: "#fff",
            border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "500"
          }}>
            + Import Video
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "20px" }}>
          {videos.map((video) => {
            const onHomepage = isOnHomepage(video);
            const taggedProducts = products.filter(p => (video.product_ids || []).includes(p.id));
            return (
              <div key={video.id} style={{
                background: C.card, borderRadius: "10px", overflow: "hidden",
                border: `1px solid ${C.border}`, borderTop: `2px solid ${C.accent}`,
              }}>
                <div style={{ position: "relative", height: "260px", background: "#111" }}>
                  <video src={video.r2_url}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    muted playsInline
                    onMouseEnter={e => e.target.play()}
                    onMouseLeave={e => { e.target.pause(); e.target.currentTime = 0; }}
                  />
                  <div style={{
                    position: "absolute", top: "8px", left: "8px",
                    background: video.status === "live" ? C.liveBg : C.draftBg,
                    color: video.status === "live" ? C.live : C.draft,
                    fontSize: "10px", fontWeight: "700", padding: "3px 8px", borderRadius: "20px"
                  }}>
                    {video.status === "live" ? "● LIVE" : "● DRAFT"}
                  </div>
                  {onHomepage && (
                    <div style={{
                      position: "absolute", top: "8px", right: "8px",
                      background: C.homeBg, color: C.home,
                      fontSize: "10px", fontWeight: "700", padding: "3px 8px", borderRadius: "20px"
                    }}>
                      🏠 Homepage
                    </div>
                  )}
                </div>

                <div style={{ padding: "14px 12px" }}>
                  <p style={{ fontWeight: "600", margin: "0 0 2px", fontSize: "14px", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {video.title || "Untitled"}
                  </p>
                  <p style={{ margin: "0 0 10px", fontSize: "12px", color: C.muted }}>👁 {video.views || 0} views</p>

                  {taggedProducts.length > 0 && (
                    <div style={{ marginBottom: "10px" }}>
                      {taggedProducts.slice(0, 2).map(p => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          {p.image && <img src={p.image} alt={p.title} style={{ width: "22px", height: "22px", borderRadius: "4px", objectFit: "cover" }} />}
                          <span style={{ fontSize: "11px", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                        </div>
                      ))}
                      {taggedProducts.length > 2 && <span style={{ fontSize: "11px", color: C.muted }}>+{taggedProducts.length - 2} more</span>}
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <button onClick={() => openTagModal(video)} style={{
                      padding: "7px 12px", background: "#fff", color: C.text,
                      border: `1px solid ${C.border}`, borderRadius: "6px",
                      cursor: "pointer", fontSize: "12px", fontWeight: "500", textAlign: "left"
                    }}>
                      🏷️ {taggedProducts.length > 0 ? `${taggedProducts.length} Product${taggedProducts.length > 1 ? "s" : ""} Tagged` : "Tag Products"}
                    </button>

                    <Form method="post">
                      <input type="hidden" name="id" value={video.id} />
                      <input type="hidden" name="action" value={onHomepage ? "remove_from_homepage" : "add_to_homepage"} />
                      <button type="submit" style={{
                        width: "100%", padding: "7px 12px",
                        background: onHomepage ? C.homeBg : "#f5f3ff",
                        color: onHomepage ? C.home : "#5b21b6",
                        border: `1px solid #c4b5fd`,
                        borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "500"
                      }}>
                        {onHomepage ? "✓ On Homepage" : "+ Add to Homepage"}
                      </button>
                    </Form>

                    <div style={{ display: "flex", gap: "6px" }}>
                      <Form method="post" style={{ flex: 1 }}>
                        <input type="hidden" name="id" value={video.id} />
                        <input type="hidden" name="action" value="toggle_status" />
                        <button type="submit" style={{
                          width: "100%", padding: "6px",
                          background: C.border, color: C.muted,
                          border: `1px solid ${C.border}`, borderRadius: "6px",
                          cursor: "pointer", fontSize: "12px"
                        }}>
                          {video.status === "live" ? "→ Draft" : "→ Live"}
                        </button>
                      </Form>
                      <Form method="post">
                        <input type="hidden" name="id" value={video.id} />
                        <input type="hidden" name="action" value="delete" />
                        <button type="submit"
                          onClick={e => { if (!confirm("Delete this video?")) e.preventDefault(); }}
                          style={{
                            padding: "6px 10px", background: C.dangerBg, color: C.danger,
                            border: `1px solid #f5c6cb`, borderRadius: "6px", cursor: "pointer", fontSize: "12px"
                          }}>
                          🗑
                        </button>
                      </Form>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tag Products Modal */}
      {tagModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{
            background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "540px",
            maxHeight: "80vh", display: "flex", flexDirection: "column",
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            border: `1px solid ${C.border}`, borderTop: `3px solid ${C.accent}`,
          }}>
            <div style={{ padding: "20px 24px 14px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0, fontSize: "17px", fontWeight: "600", color: C.text }}>Tag Products</h2>
                <button onClick={closeTagModal} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: C.muted }}>✕</button>
              </div>
              <p style={{ margin: "4px 0 0", color: C.muted, fontSize: "13px" }}>Select products to link to this video</p>
            </div>
            <div style={{ padding: "14px 24px", borderBottom: `1px solid ${C.border}` }}>
              <input type="text" placeholder="Search products..." value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)} autoFocus
                style={{ width: "100%", padding: "9px 14px", border: `1.5px solid ${C.border}`, borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box", color: C.text }}
              />
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 24px" }}>
              {filteredProducts.length === 0 && (
                <p style={{ textAlign: "center", color: C.muted, padding: "20px", fontSize: "13px" }}>
                  {products.length === 0 ? "⏳ Loading products..." : "No products match your search"}
                </p>
              )}
              {filteredProducts.map(product => {
                const isSelected = selectedProducts.includes(product.id);
                return (
                  <div key={product.id} onClick={() => toggleProduct(product.id)} style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "10px 12px", margin: "4px 0", borderRadius: "8px", cursor: "pointer",
                    background: isSelected ? "#f0fdf4" : "#fff",
                    border: `1.5px solid ${isSelected ? "#86efac" : C.border}`,
                  }}>
                    <input type="checkbox" checked={isSelected} onChange={() => {}} style={{ cursor: "pointer", accentColor: C.accent }} />
                    {product.image && <img src={product.image} alt={product.title} style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "6px" }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: "500", fontSize: "13px", color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.title}</p>
                      {product.price && <p style={{ margin: "2px 0 0", fontSize: "12px", color: C.muted }}>₹{parseFloat(product.price).toLocaleString("en-IN")}</p>}
                    </div>
                    {isSelected && <span style={{ color: "#16a34a", fontSize: "16px" }}>✓</span>}
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: C.muted }}>{selectedProducts.length} selected</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={closeTagModal} style={{ padding: "8px 16px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: "6px", cursor: "pointer", fontSize: "13px", color: C.text }}>
                  Cancel
                </button>
                <Form method="post" onSubmit={closeTagModal}>
                  <input type="hidden" name="id" value={tagModal.id} />
                  <input type="hidden" name="action" value="tag_products" />
                  {selectedProducts.map(pid => <input key={pid} type="hidden" name="product_ids" value={pid} />)}
                  <button type="submit" style={{ padding: "8px 20px", background: C.accent, color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "500" }}>
                    Save {selectedProducts.length > 0 ? `(${selectedProducts.length})` : ""}
                  </button>
                </Form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}