import { useLoaderData, Form, useNavigation, useNavigate, useFetcher } from "react-router";
import { useState, useRef, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { supabase } from "../supabase.server";

/* ── S3 / R2 client ── */


/* ── LOADER ── */
export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const { data: videos } = await supabase
    .from("videos").select("*").eq("shop_id", shop)
    .order("created_at", { ascending: false });

  let products = [];
  try {
    const res = await admin.graphql(`
      query {
        products(first: 250, sortKey: TITLE) {
          edges { node { id title handle featuredImage { url } variants(first:1){ edges { node { price } } } } }
        }
      }
    `);
    const pData = await res.json();
    products = pData.data.products.edges.map(e => ({
      id: e.node.id, title: e.node.title, handle: e.node.handle,
      image: e.node.featuredImage?.url,
      price: e.node.variants.edges[0]?.node.price,
    }));
  } catch (e) { console.error("Failed to fetch products:", e); }

  return { videos: videos || [], products };
};

/* ── ACTION ── */
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("action");

  try {
    /* Import from URL or file — delegated to api.upload route */
    if (actionType === "import_url" || actionType === "import_file") {
      formData.set("type", actionType === "import_url" ? "url" : "file");
      const uploadRes = await fetch(new URL("/api/upload", request.url).toString(), {
        method: "POST",
        headers: { cookie: request.headers.get("cookie") || "" },
        body: formData,
      });
      const result = await uploadRes.json();
      if (result.error) return { importError: result.error };
      return { importSuccess: true };
    }

        /* Video management actions */
    const id = formData.get("id");
    if (actionType === "delete") {
      await supabase.from("videos").delete().eq("id", id).eq("shop_id", shop);
    }
    if (actionType === "toggle_status") {
      const { data } = await supabase.from("videos").select("status").eq("id", id).single();
      await supabase.from("videos").update({ status: data.status === "live" ? "draft" : "live" }).eq("id", id);
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
  } catch (e) { console.error("Action error:", e); return { importError: e.message }; }

  return { ok: true };
};

/* ══════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════ */
export default function Videos() {
  const { videos, products } = useLoaderData();
  const navigation = useNavigation();
  const fetcher = useFetcher();

  /* Import modal state */
  const [showImport, setShowImport] = useState(false);
  const [importTab, setImportTab] = useState("url");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  const thumbnailInputRef = useRef(null);
  const [thumbPreview, setThumbPreview] = useState(null);

  // Extract first frame from a video File or URL as a JPEG blob
  const extractFrame = (src) => new Promise((resolve) => {
    const vid = document.createElement("video");
    vid.crossOrigin = "anonymous";
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = "metadata";
    vid.onloadeddata = () => {
      vid.currentTime = 0.1; // seek slightly in to avoid pure black frames
    };
    vid.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = vid.videoWidth || 640;
      canvas.height = vid.videoHeight || 360;
      canvas.getContext("2d").drawImage(vid, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
    };
    vid.onerror = () => resolve(null);
    if (typeof src === "string") {
      vid.src = src;
    } else {
      vid.src = URL.createObjectURL(src);
    }
    vid.load();
  });

  // Called when file is selected — extract frame immediately for preview + upload
  const handleFileSelect = async (file) => {
    if (!file) return;
    setSelectedFile(file);
    const blob = await extractFrame(file);
    if (blob) {
      setThumbPreview(URL.createObjectURL(blob));
      // Store blob in a DataTransfer so we can attach it to a hidden input
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "thumbnail.jpg", { type: "image/jpeg" }));
      if (thumbnailInputRef.current) thumbnailInputRef.current.files = dt.files;
    }
  };

  // Called when URL is typed — extract frame from URL
  const handleUrlThumb = async (url) => {
    if (!url || !url.startsWith("http")) return;
    setThumbPreview(null);
    const blob = await extractFrame(url);
    if (blob) {
      setThumbPreview(URL.createObjectURL(blob));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "thumbnail.jpg", { type: "image/jpeg" }));
      if (thumbnailInputRef.current) thumbnailInputRef.current.files = dt.files;
    }
  };

  /* Tag modal state */
  const [tagModal, setTagModal] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProducts, setSelectedProducts] = useState([]);

  // fetcher drives both import forms — state tracks in-flight, data has result
  const isImporting = fetcher.state !== "idle";

  // Close modal + reset when import succeeds
  useEffect(() => {
    if (fetcher.data?.importSuccess) {
      setShowImport(false);
      setSelectedFile(null);
    }
  }, [fetcher.data]);

  const C = {
    bg: "#f8f9fb", card: "#fff", border: "#f0f0ee",
    accent: "#485861", text: "#0a0a0a", muted: "#9a9a93",
    live: "#2d6a4f", liveBg: "#d8f3dc",
    draft: "#6b6b66", draftBg: "#f0f0ee",
    home: "#6d4c7d", homeBg: "#ede7f6",
    danger: "#c0392b", dangerBg: "#fdecea",
  };

  const openTagModal = (video) => { setTagModal(video); setSelectedProducts(video.product_ids || []); setSearchQuery(""); };
  const closeTagModal = () => { setTagModal(null); setSelectedProducts([]); };
  const toggleProduct = (id) => setSelectedProducts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const filteredProducts = searchQuery ? products.filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase())) : products;
  const isOnHomepage = (v) => Array.isArray(v.show_on) && v.show_on.includes("home");

  /* ── Check if URL from /app/videos/new should open modal ── */
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname.endsWith("/new")) {
      setShowImport(true);
    }
  }, []);

  return (
    <div style={{ padding: "28px 32px", background: C.bg, minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "600", color: C.text }}>Video Manager</h1>
          <p style={{ margin: "4px 0 0", color: C.muted, fontSize: "13px" }}>
            {videos.length} total · {videos.filter(v => v.status === "live").length} live
          </p>
        </div>
        <button onClick={() => { setShowImport(true); setImportTab("url"); setSelectedFile(null); }} style={{
          padding: "10px 20px", background: C.accent, color: "#fff",
          border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "500", fontSize: "14px",
        }}>
          + Import Video
        </button>
      </div>

      {/* Empty state */}
      {videos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 40px", color: C.muted }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎬</div>
          <h2 style={{ color: C.text, fontWeight: "500" }}>No videos yet</h2>
          <p style={{ fontSize: "14px", marginBottom: "20px" }}>Import your first video to get started</p>
          <button onClick={() => setShowImport(true)} style={{
            padding: "12px 28px", background: C.accent, color: "#fff",
            border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "14px", fontWeight: "500"
          }}>+ Import Video</button>
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
                    poster={video.thumbnail_url || undefined}
                    style={{ width: "100%", height: "100%", objectFit: "cover", background: "#1a1a1a" }}
                    muted playsInline preload="none"
                    onMouseEnter={e => e.target.play()} onMouseLeave={e => { e.target.pause(); e.target.currentTime = 0; }}
                  />
                  <div style={{
                    position: "absolute", top: "8px", left: "8px",
                    background: video.status === "live" ? C.liveBg : C.draftBg,
                    color: video.status === "live" ? C.live : C.draft,
                    fontSize: "10px", fontWeight: "700", padding: "3px 8px", borderRadius: "20px"
                  }}>{video.status === "live" ? "● LIVE" : "● DRAFT"}</div>
                  {onHomepage && (
                    <div style={{
                      position: "absolute", top: "8px", right: "8px",
                      background: C.homeBg, color: C.home,
                      fontSize: "10px", fontWeight: "700", padding: "3px 8px", borderRadius: "20px"
                    }}>🏠 Homepage</div>
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
                    }}>🏷️ {taggedProducts.length > 0 ? `${taggedProducts.length} Product${taggedProducts.length > 1 ? "s" : ""} Tagged` : "Tag Products"}</button>

                    <Form method="post">
                      <input type="hidden" name="id" value={video.id} />
                      <input type="hidden" name="action" value={onHomepage ? "remove_from_homepage" : "add_to_homepage"} />
                      <button type="submit" style={{
                        width: "100%", padding: "7px 12px",
                        background: onHomepage ? C.homeBg : "#f5f3ff", color: onHomepage ? C.home : "#5b21b6",
                        border: "1px solid #c4b5fd", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "500"
                      }}>{onHomepage ? "✓ On Homepage" : "+ Add to Homepage"}</button>
                    </Form>

                    <div style={{ display: "flex", gap: "6px" }}>
                      <Form method="post" style={{ flex: 1 }}>
                        <input type="hidden" name="id" value={video.id} />
                        <input type="hidden" name="action" value="toggle_status" />
                        <button type="submit" style={{
                          width: "100%", padding: "6px", background: C.border, color: C.muted,
                          border: `1px solid ${C.border}`, borderRadius: "6px", cursor: "pointer", fontSize: "12px"
                        }}>{video.status === "live" ? "→ Draft" : "→ Live"}</button>
                      </Form>
                      <Form method="post">
                        <input type="hidden" name="id" value={video.id} />
                        <input type="hidden" name="action" value="delete" />
                        <button type="submit" onClick={e => { if (!confirm("Delete this video?")) e.preventDefault(); }} style={{
                          padding: "6px 10px", background: C.dangerBg, color: C.danger,
                          border: "1px solid #f5c6cb", borderRadius: "6px", cursor: "pointer", fontSize: "12px"
                        }}>🗑</button>
                      </Form>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ══════ IMPORT MODAL ══════ */}
      {showImport && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(10,10,10,0.55)",
          zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
        }} onClick={(e) => { if (e.target === e.currentTarget) setShowImport(false); }}>
          <div style={{
            background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "620px",
            boxShadow: "0 24px 80px rgba(0,0,0,0.25)", overflow: "hidden",
          }}>
            {/* Modal header */}
            <div style={{ padding: "24px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "600", color: C.text }}>Add New Media</h2>
              <button onClick={() => { setShowImport(false); setThumbPreview(null); setSelectedFile(null); }} style={{
                background: "none", border: "1px solid #e8e8e6", borderRadius: "50%",
                width: "32px", height: "32px", cursor: "pointer", fontSize: "16px",
                color: C.muted, display: "flex", alignItems: "center", justifyContent: "center",
              }}>✕</button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", padding: "16px 28px 0", borderBottom: "1px solid #f0f0ee", gap: "0" }}>
              {[{ id: "url", label: "🔗 Import from URL" }, { id: "file", label: "💻 Upload from Computer" }].map(t => (
                <button key={t.id} onClick={() => setImportTab(t.id)} style={{
                  padding: "10px 16px", background: "none", border: "none",
                  borderBottom: importTab === t.id ? `2px solid ${C.accent}` : "2px solid transparent",
                  cursor: "pointer", fontSize: "14px",
                  fontWeight: importTab === t.id ? "600" : "400",
                  color: importTab === t.id ? C.accent : C.muted,
                  marginBottom: "-1px", transition: "all 0.15s",
                }}>{t.label}</button>
              ))}
            </div>

            {/* Error */}
            {fetcher.data?.importError && (
              <div style={{ margin: "14px 28px 0", padding: "10px 14px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#dc2626", fontSize: "13px" }}>
                ❌ {fetcher.data.importError}
              </div>
            )}

            {/* ── URL tab ── */}
            {importTab === "url" && (
              <fetcher.Form method="post" style={{ padding: "24px 28px 28px" }}>
                <input type="hidden" name="action" value="import_url" />
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: C.text, marginBottom: "6px" }}>
                    Video Title <span style={{ color: C.muted, fontWeight: "400" }}>(optional)</span>
                  </label>
                  <input name="title" type="text" placeholder="e.g. Summer Collection Reel" style={{
                    width: "100%", padding: "10px 14px", border: `1.5px solid ${C.border}`, borderRadius: "8px",
                    fontSize: "14px", outline: "none", boxSizing: "border-box", color: C.text, fontFamily: "inherit",
                  }} />
                </div>
                <div style={{ marginBottom: "24px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: C.text, marginBottom: "6px" }}>
                    Direct Video URL <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input name="source_url" type="url" required placeholder="https://example.com/video.mp4"
                    onBlur={(e) => handleUrlThumb(e.target.value)}
                    style={{
                      width: "100%", padding: "10px 14px", border: `1.5px solid ${C.border}`, borderRadius: "8px",
                      fontSize: "14px", outline: "none", boxSizing: "border-box", color: C.text, fontFamily: "inherit",
                    }} />
                  <p style={{ margin: "6px 0 0", fontSize: "12px", color: C.muted }}>Must be a direct .mp4 or .mov link.</p>
                  {/* Hidden thumbnail input — populated by extractFrame */}
                  <input ref={thumbnailInputRef} type="file" name="thumbnail" style={{ display: "none" }} />
                  {thumbPreview && (
                    <div style={{ marginTop: "12px", borderRadius: "8px", overflow: "hidden", border: `1px solid ${C.border}` }}>
                      <img src={thumbPreview} alt="Cover preview" style={{ width: "100%", maxHeight: "140px", objectFit: "cover", display: "block" }} />
                      <p style={{ margin: "6px 8px", fontSize: "11px", color: C.muted }}>✅ Cover image extracted from first frame</p>
                    </div>
                  )}
                </div>
                <button type="submit" disabled={isImporting} style={{
                  width: "100%", padding: "12px", background: isImporting ? "#8a9da5" : C.accent,
                  color: "#fff", border: "none", borderRadius: "8px",
                  cursor: isImporting ? "not-allowed" : "pointer",
                  fontSize: "14px", fontWeight: "600", fontFamily: "inherit",
                }}>
                  {isImporting ? "⏳ Uploading..." : "Import Video"}
                </button>
                {isImporting && <p style={{ textAlign: "center", color: C.muted, marginTop: "10px", fontSize: "12px" }}>This may take a minute for large files...</p>}
              </fetcher.Form>
            )}

            {/* ── File upload tab ── */}
            {importTab === "file" && (
              <fetcher.Form method="post" encType="multipart/form-data" style={{ padding: "24px 28px 28px" }}>
                <input type="hidden" name="action" value="import_file" />
                <div style={{ marginBottom: "16px" }}>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: C.text, marginBottom: "6px" }}>
                    Video Title <span style={{ color: C.muted, fontWeight: "400" }}>(optional)</span>
                  </label>
                  <input name="title" type="text" placeholder="e.g. Product Launch Reel" style={{
                    width: "100%", padding: "10px 14px", border: `1.5px solid ${C.border}`, borderRadius: "8px",
                    fontSize: "14px", outline: "none", boxSizing: "border-box", color: C.text, fontFamily: "inherit",
                  }} />
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault(); setDragOver(false);
                    const f = e.dataTransfer.files[0];
                    if (f) handleFileSelect(f);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragOver ? C.accent : "#d0d0cc"}`,
                    borderRadius: "12px", padding: "40px 20px",
                    textAlign: "center", cursor: "pointer", marginBottom: "20px",
                    background: dragOver ? "#f0f4f5" : "#fafaf8", transition: "all 0.2s",
                  }}
                >
                  <input ref={fileInputRef} type="file" name="video_file"
                    accept="video/mp4,video/mov,video/quicktime,.mp4,.mov"
                    onChange={(e) => handleFileSelect(e.target.files[0])}
                    style={{ display: "none" }}
                  />
                  {/* Hidden thumbnail input — populated by extractFrame */}
                  <input ref={thumbnailInputRef} type="file" name="thumbnail" style={{ display: "none" }} />
                  <div style={{ fontSize: "32px", marginBottom: "10px" }}>{selectedFile ? "🎬" : "☁️"}</div>
                  {selectedFile ? (
                    <>
                      <p style={{ margin: "0 0 4px", fontWeight: "600", fontSize: "14px", color: C.text }}>{selectedFile.name}</p>
                      <p style={{ margin: 0, fontSize: "12px", color: C.muted }}>{(selectedFile.size / 1024 / 1024).toFixed(1)} MB · Click to change</p>
                    </>
                  ) : (
                    <>
                      <p style={{ margin: "0 0 4px", fontWeight: "600", fontSize: "14px", color: C.text }}>Drop file here or click to browse</p>
                      <p style={{ margin: 0, fontSize: "12px", color: C.muted }}>Supports MP4, MOV · Max 1 GB per file</p>
                    </>
                  )}
                </div>
                {thumbPreview && (
                  <div style={{ marginBottom: "16px", borderRadius: "8px", overflow: "hidden", border: `1px solid ${C.border}` }}>
                    <img src={thumbPreview} alt="Cover preview" style={{ width: "100%", maxHeight: "140px", objectFit: "cover", display: "block" }} />
                    <p style={{ margin: "6px 8px", fontSize: "11px", color: C.muted }}>✅ Cover image extracted from first frame</p>
                  </div>
                )}

                <button type="submit" disabled={isImporting || !selectedFile} style={{
                  width: "100%", padding: "12px",
                  background: isImporting ? "#8a9da5" : (!selectedFile ? "#c8ced1" : C.accent),
                  color: "#fff", border: "none", borderRadius: "8px",
                  cursor: (isImporting || !selectedFile) ? "not-allowed" : "pointer",
                  fontSize: "14px", fontWeight: "600", fontFamily: "inherit",
                }}>
                  {isImporting ? "⏳ Uploading..." : "Upload Video"}
                </button>
                {isImporting && <p style={{ textAlign: "center", color: C.muted, marginTop: "10px", fontSize: "12px" }}>Please don't close this tab while uploading...</p>}
              </fetcher.Form>
            )}
          </div>
        </div>
      )}

      {/* ══════ TAG PRODUCTS MODAL ══════ */}
      {tagModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{
            background: "#fff", borderRadius: "12px", width: "100%", maxWidth: "540px",
            maxHeight: "80vh", display: "flex", flexDirection: "column",
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)", border: `1px solid ${C.border}`, borderTop: `3px solid ${C.accent}`,
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
                <button onClick={closeTagModal} style={{ padding: "8px 16px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: "6px", cursor: "pointer", fontSize: "13px", color: C.text }}>Cancel</button>
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