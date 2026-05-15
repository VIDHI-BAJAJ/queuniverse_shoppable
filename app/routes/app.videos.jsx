import { useLoaderData, Link, Form, useNavigation } from "react-router";
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

  // Fetch products from Shopify
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
        await supabase.from("videos").update({
          show_on: [...showOn, "home"],
          status: "live",
        }).eq("id", id);
      }
    }

    if (actionType === "remove_from_homepage") {
      const { data } = await supabase.from("videos").select("show_on").eq("id", id).single();
      const showOn = Array.isArray(data.show_on) ? data.show_on : [];
      await supabase.from("videos").update({
        show_on: showOn.filter(p => p !== "home"),
      }).eq("id", id);
    }

    if (actionType === "tag_products") {
      const productIds = formData.getAll("product_ids");
      await supabase.from("videos").update({
        product_ids: productIds,
        status: "live",
      }).eq("id", id).eq("shop_id", shop);
    }
  } catch (e) {
    console.error("Action error:", e);
  }

  return { ok: true };
};

export default function Videos() {
  const { videos, products } = useLoaderData();
  const navigation = useNavigation();
  const [tagModal, setTagModal] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProducts, setSelectedProducts] = useState([]);

  const openTagModal = (video) => {
    setTagModal(video);
    setSelectedProducts(video.product_ids || []);
    setSearchQuery("");
  };

  const closeTagModal = () => {
    setTagModal(null);
    setSelectedProducts([]);
  };

  const toggleProduct = (productId) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const filteredProducts = searchQuery.length === 0
    ? products
    : products.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase())
      );

  const isOnHomepage = (video) => {
    const showOn = Array.isArray(video.show_on) ? video.show_on : [];
    return showOn.includes("home");
  };

  const isLoading = navigation.state !== "idle";

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", background: "#f9fafb", minHeight: "100vh" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px" }}>Video Manager</h1>
          <p style={{ margin: "4px 0 0", color: "#666", fontSize: "14px" }}>
            {videos.length} total · {videos.filter(v => v.status === "live").length} live
          </p>
        </div>
        <Link to="/app/videos/new">
          <button 
  onClick={() => navigate("/app/videos/new")}
  style={{ padding: "12px 24px", background: "#008060", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", marginTop: "12px" }}>
  + Import Video
</button>
        </Link>
      </div>

      {videos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#666" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎬</div>
          <h2>No videos yet</h2>
          <Link to="/app/videos/new">
            <button style={{ padding: "12px 24px", background: "#008060", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", marginTop: "12px" }}>
              + Import Video
            </button>
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "20px" }}>
          {videos.map((video) => {
            const onHomepage = isOnHomepage(video);
            const taggedProducts = products.filter(p => (video.product_ids || []).includes(p.id));

            return (
              <div key={video.id} style={{ background: "white", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", border: "1px solid #e5e7eb" }}>

                {/* Video preview */}
                <div style={{ position: "relative", height: "280px", background: "#111" }}>
                  <video
                    src={video.r2_url}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    muted playsInline
                    onMouseEnter={e => e.target.play()}
                    onMouseLeave={e => { e.target.pause(); e.target.currentTime = 0; }}
                  />
                  <div style={{
                    position: "absolute", top: "8px", left: "8px",
                    background: video.status === "live" ? "#008060" : "#6b7280",
                    color: "white", fontSize: "11px", fontWeight: "bold",
                    padding: "2px 8px", borderRadius: "20px"
                  }}>
                    {video.status === "live" ? "● LIVE" : "● DRAFT"}
                  </div>
                  {onHomepage && (
                    <div style={{
                      position: "absolute", top: "8px", right: "8px",
                      background: "#7c3aed", color: "white", fontSize: "11px",
                      fontWeight: "bold", padding: "2px 8px", borderRadius: "20px"
                    }}>
                      🏠 Homepage
                    </div>
                  )}
                </div>

                <div style={{ padding: "12px" }}>
                  <p style={{ fontWeight: "600", margin: "0 0 4px", fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {video.title || "Untitled"}
                  </p>
                  <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#666" }}>
                    👁 {video.views || 0} views
                  </p>

                  {/* Tagged products preview */}
                  {taggedProducts.length > 0 && (
                    <div style={{ marginBottom: "10px" }}>
                      {taggedProducts.slice(0, 2).map(p => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          {p.image && <img src={p.image} alt={p.title} style={{ width: "24px", height: "24px", borderRadius: "4px", objectFit: "cover" }} />}
                          <span style={{ fontSize: "11px", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                        </div>
                      ))}
                      {taggedProducts.length > 2 && (
                        <span style={{ fontSize: "11px", color: "#6b7280" }}>+{taggedProducts.length - 2} more</span>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>

                    {/* Tag Products */}
                    <button
                      onClick={() => openTagModal(video)}
                      style={{ padding: "7px 12px", background: "white", color: "#374151", border: "1.5px solid #e5e7eb", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "500", textAlign: "left" }}>
                      🏷️ {taggedProducts.length > 0 ? `${taggedProducts.length} Product${taggedProducts.length > 1 ? "s" : ""} Tagged` : "Tag Products"}
                    </button>

                    {/* Add/Remove Homepage */}
                    <Form method="post">
                      <input type="hidden" name="id" value={video.id} />
                      <input type="hidden" name="action" value={onHomepage ? "remove_from_homepage" : "add_to_homepage"} />
                      <button type="submit" style={{
                        width: "100%", padding: "7px 12px",
                        background: onHomepage ? "#fef3c7" : "#ede9fe",
                        color: onHomepage ? "#92400e" : "#5b21b6",
                        border: `1.5px solid ${onHomepage ? "#fcd34d" : "#c4b5fd"}`,
                        borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "500"
                      }}>
                        {onHomepage ? "✓ On Homepage" : "+ Add to Homepage"}
                      </button>
                    </Form>

                    {/* Status + Delete */}
                    <div style={{ display: "flex", gap: "6px" }}>
                      <Form method="post" style={{ flex: 1 }}>
                        <input type="hidden" name="id" value={video.id} />
                        <input type="hidden" name="action" value="toggle_status" />
                        <button type="submit" style={{ width: "100%", padding: "6px", background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>
                          {video.status === "live" ? "→ Draft" : "→ Live"}
                        </button>
                      </Form>
                      <Form method="post">
                        <input type="hidden" name="id" value={video.id} />
                        <input type="hidden" name="action" value="delete" />
                        <button type="submit"
                          onClick={e => { if (!confirm("Delete this video?")) e.preventDefault(); }}
                          style={{ padding: "6px 10px", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "white", borderRadius: "12px", width: "100%", maxWidth: "560px", maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>

            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0, fontSize: "18px" }}>Tag Products</h2>
                <button onClick={closeTagModal} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#6b7280" }}>✕</button>
              </div>
              <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: "14px" }}>Search and select products from your store</p>
            </div>

            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e5e7eb" }}>
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", border: "1.5px solid #e5e7eb", borderRadius: "8px", fontSize: "14px", outline: "none", boxSizing: "border-box" }}
                autoFocus
              />
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "8px 24px" }}>
              {products.length === 0 ? (
                <p style={{ textAlign: "center", color: "#6b7280", padding: "20px" }}>⏳ Loading products...</p>
              ) : filteredProducts.length === 0 ? (
                <p style={{ textAlign: "center", color: "#6b7280", padding: "20px" }}>No products match your search</p>
              ) : null}
              {filteredProducts.map(product => {
                const isSelected = selectedProducts.includes(product.id);
                return (
                  <div key={product.id} onClick={() => toggleProduct(product.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      padding: "10px 12px", margin: "4px 0", borderRadius: "8px",
                      cursor: "pointer",
                      background: isSelected ? "#f0fdf4" : "white",
                      border: `1.5px solid ${isSelected ? "#86efac" : "#f3f4f6"}`,
                    }}>
                    <input type="checkbox" checked={isSelected} onChange={() => {}} style={{ cursor: "pointer" }} />
                    {product.image && (
                      <img src={product.image} alt={product.title}
                        style={{ width: "44px", height: "44px", objectFit: "cover", borderRadius: "6px" }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: "500", fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {product.title}
                      </p>
                      {product.price && (
                        <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#6b7280" }}>
                          ₹{parseFloat(product.price).toLocaleString("en-IN")}
                        </p>
                      )}
                    </div>
                    {isSelected && <span style={{ color: "#008060", fontSize: "18px" }}>✓</span>}
                  </div>
                );
              })}
            </div>

            <div style={{ padding: "16px 24px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "14px", color: "#6b7280" }}>
                {selectedProducts.length} selected
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={closeTagModal}
                  style={{ padding: "8px 16px", background: "white", border: "1px solid #e5e7eb", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>
                  Cancel
                </button>
                <Form method="post" onSubmit={closeTagModal}>
                  <input type="hidden" name="id" value={tagModal.id} />
                  <input type="hidden" name="action" value="tag_products" />
                  {selectedProducts.map(pid => (
                    <input key={pid} type="hidden" name="product_ids" value={pid} />
                  ))}
                  <button type="submit"
                    style={{ padding: "8px 20px", background: "#008060", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }}>
                    Tag {selectedProducts.length > 0 ? selectedProducts.length + " " : ""}Products
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