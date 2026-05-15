import { Form, useActionData, useNavigation, useNavigate } from "react-router";
import { useEffect, useState, useRef } from "react";
import { authenticate } from "../shopify.server";
import { supabase } from "../supabase.server";
import { uploadToR2 } from "../s3.server";

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const importType = formData.get("import_type");
  const title = formData.get("title") || "Untitled Video";

  try {
    if (importType === "url") {
      const sourceUrl = formData.get("source_url");
      if (!sourceUrl) return { error: "Please provide a video URL" };
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error("Failed to fetch video: " + response.status);
      const buffer = Buffer.from(await response.arrayBuffer());
      const { key, url: r2Url } = await uploadToR2(buffer, "video/mp4");
      const { error } = await supabase.from("videos").insert({
        shop_id: shop, title, r2_url: r2Url, r2_key: key,
        source_url: sourceUrl, status: "draft", views: 0, product_ids: [], show_on: [],
      });
      if (error) throw error;
      return { success: true };
    }

    if (importType === "file") {
      const file = formData.get("video_file");
      if (!file || file.size === 0) return { error: "Please select a video file" };
      const buffer = Buffer.from(await file.arrayBuffer());
      const { key, url: r2Url } = await uploadToR2(buffer, file.type || "video/mp4");
      const { error } = await supabase.from("videos").insert({
        shop_id: shop, title: title || file.name.replace(/\.[^.]+$/, ""),
        r2_url: r2Url, r2_key: key, status: "draft",
        views: 0, product_ids: [], show_on: [],
      });
      if (error) throw error;
      return { success: true };
    }

    return { error: "Unknown import type" };
  } catch (err) {
    return { error: err.message };
  }
};

export default function NewVideo() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const [tab, setTab] = useState("url");
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [thumbPreview, setThumbPreview] = useState(null);
  const fileInputRef = useRef(null);
  const thumbnailInputRef = useRef(null);
  const isLoading = navigation.state === "submitting";

  const C = {
    bg: "#f8f9fb", accent: "#485861", text: "#0a0a0a",
    muted: "#9a9a93", border: "#e8e8e6", card: "#fff",
  };

  useEffect(() => {
    if (actionData?.success) navigate("/app/videos");
  }, [actionData]);

  const extractFrame = (src) => new Promise((resolve) => {
    const vid = document.createElement("video");
    vid.crossOrigin = "anonymous";
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = "metadata";
    vid.onloadeddata = () => { vid.currentTime = 0.1; };
    vid.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = vid.videoWidth || 640;
      canvas.height = vid.videoHeight || 360;
      canvas.getContext("2d").drawImage(vid, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
    };
    vid.onerror = () => resolve(null);
    vid.src = typeof src === "string" ? src : URL.createObjectURL(src);
    vid.load();
  });

  const handleFileSelect = async (file) => {
    if (!file) return;
    setSelectedFile(file);
    const blob = await extractFrame(file);
    if (blob) {
      setThumbPreview(URL.createObjectURL(blob));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "thumbnail.jpg", { type: "image/jpeg" }));
      if (thumbnailInputRef.current) thumbnailInputRef.current.files = dt.files;
    }
  };

  const handleUrlThumb = async (url) => {
    if (!url || !url.startsWith("http")) return;
    const blob = await extractFrame(url);
    if (blob) {
      setThumbPreview(URL.createObjectURL(blob));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "thumbnail.jpg", { type: "image/jpeg" }));
      if (thumbnailInputRef.current) thumbnailInputRef.current.files = dt.files;
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(10,10,10,0.55)",
      zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', system-ui, sans-serif", padding: "20px",
    }}>
      <div style={{
        background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "620px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.25)", overflow: "hidden",
      }}>
        <div style={{ padding: "24px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "600", color: C.text }}>Add New Media</h2>
          <button onClick={() => navigate("/app/videos")} style={{
            background: "none", border: "1px solid #e8e8e6", borderRadius: "50%",
            width: "32px", height: "32px", cursor: "pointer", fontSize: "16px", color: C.muted,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        <div style={{ display: "flex", padding: "16px 28px 0", borderBottom: "1px solid #f0f0ee" }}>
          {[{ id: "url", label: "🔗 Import from URL" }, { id: "file", label: "💻 Upload from Computer" }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "10px 16px", background: "none", border: "none",
              borderBottom: tab === t.id ? `2px solid ${C.accent}` : "2px solid transparent",
              cursor: "pointer", fontSize: "14px",
              fontWeight: tab === t.id ? "600" : "400",
              color: tab === t.id ? C.accent : C.muted,
              marginBottom: "-1px",
            }}>{t.label}</button>
          ))}
        </div>

        {actionData?.error && (
          <div style={{ margin: "14px 28px 0", padding: "10px 14px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#dc2626", fontSize: "13px" }}>
            ❌ {actionData.error}
          </div>
        )}

        {tab === "url" && (
          <Form method="post" encType="multipart/form-data" style={{ padding: "24px 28px 28px" }}>
            <input type="hidden" name="import_type" value="url" />
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: C.text, marginBottom: "6px" }}>
                Video Title <span style={{ color: C.muted, fontWeight: "400" }}>(optional)</span>
              </label>
              <input name="title" type="text" placeholder="e.g. Summer Collection Reel" style={{
                width: "100%", padding: "10px 14px", border: `1.5px solid ${C.border}`, borderRadius: "8px",
                fontSize: "14px", outline: "none", boxSizing: "border-box", color: C.text,
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
                  fontSize: "14px", outline: "none", boxSizing: "border-box", color: C.text,
                }} />
              <p style={{ margin: "6px 0 0", fontSize: "12px", color: C.muted }}>Must be a direct .mp4 or .mov link.</p>
              <input ref={thumbnailInputRef} type="file" name="thumbnail" style={{ display: "none" }} />
              {thumbPreview && (
                <div style={{ marginTop: "12px", borderRadius: "8px", overflow: "hidden", border: `1px solid ${C.border}` }}>
                  <img src={thumbPreview} alt="Cover" style={{ width: "100%", maxHeight: "140px", objectFit: "cover", display: "block" }} />
                  <p style={{ margin: "6px 8px", fontSize: "11px", color: C.muted }}>✅ Cover extracted from first frame</p>
                </div>
              )}
            </div>
            <button type="submit" disabled={isLoading} style={{
              width: "100%", padding: "12px",
              background: isLoading ? "#8a9da5" : C.accent,
              color: "#fff", border: "none", borderRadius: "8px",
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: "14px", fontWeight: "600",
            }}>
              {isLoading ? "⏳ Uploading..." : "Import Video"}
            </button>
          </Form>
        )}

        {tab === "file" && (
          <Form method="post" encType="multipart/form-data" style={{ padding: "24px 28px 28px" }}>
            <input type="hidden" name="import_type" value="file" />
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: C.text, marginBottom: "6px" }}>
                Video Title <span style={{ color: C.muted, fontWeight: "400" }}>(optional)</span>
              </label>
              <input name="title" type="text" placeholder="e.g. Product Launch Reel" style={{
                width: "100%", padding: "10px 14px", border: `1.5px solid ${C.border}`, borderRadius: "8px",
                fontSize: "14px", outline: "none", boxSizing: "border-box", color: C.text,
              }} />
            </div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files[0]); }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? C.accent : "#d0d0cc"}`,
                borderRadius: "12px", padding: "40px 20px",
                textAlign: "center", cursor: "pointer", marginBottom: "16px",
                background: dragOver ? "#f0f4f5" : "#fafaf8",
              }}>
              <input ref={fileInputRef} type="file" name="video_file"
                accept="video/mp4,video/mov,video/quicktime,.mp4,.mov"
                onChange={(e) => handleFileSelect(e.target.files[0])}
                style={{ display: "none" }} />
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
                  <p style={{ margin: 0, fontSize: "12px", color: C.muted }}>Supports MP4, MOV · Max 1 GB</p>
                </>
              )}
            </div>
            {thumbPreview && (
              <div style={{ marginBottom: "16px", borderRadius: "8px", overflow: "hidden", border: `1px solid ${C.border}` }}>
                <img src={thumbPreview} alt="Cover" style={{ width: "100%", maxHeight: "140px", objectFit: "cover", display: "block" }} />
                <p style={{ margin: "6px 8px", fontSize: "11px", color: C.muted }}>✅ Cover extracted from first frame</p>
              </div>
            )}
            <button type="submit" disabled={isLoading || !selectedFile} style={{
              width: "100%", padding: "12px",
              background: isLoading ? "#8a9da5" : (!selectedFile ? "#c8ced1" : C.accent),
              color: "#fff", border: "none", borderRadius: "8px",
              cursor: (isLoading || !selectedFile) ? "not-allowed" : "pointer",
              fontSize: "14px", fontWeight: "600",
            }}>
              {isLoading ? "⏳ Uploading..." : "Upload Video"}
            </button>
          </Form>
        )}
      </div>
    </div>
  );
}