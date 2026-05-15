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
    let buffer, key, r2Url;

    if (importType === "url") {
      const sourceUrl = formData.get("source_url");
      if (!sourceUrl) return { error: "Please provide a video URL" };
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error("Failed to fetch video: " + response.status);
      buffer = Buffer.from(await response.arrayBuffer());
      key = `videos/${uuidv4()}.mp4`;
      await getS3().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key, Body: buffer, ContentType: "video/mp4",
      }));
      r2Url = `${process.env.R2_PUBLIC_URL}/${key}`;

      const { data, error } = await supabase.from("videos").insert({
        shop_id: shop, title, r2_url: r2Url, r2_key: key,
        source_url: sourceUrl, status: "draft", views: 0, product_ids: [], show_on: [],
      }).select().single();
      if (error) throw error;
      return { success: true };
    }

    if (importType === "file") {
      const file = formData.get("video_file");
      if (!file || file.size === 0) return { error: "Please select a video file" };
      buffer = Buffer.from(await file.arrayBuffer());
      const ext = file.name.split(".").pop() || "mp4";
      key = `videos/${uuidv4()}.${ext}`;
      await getS3().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key, Body: buffer, ContentType: file.type || "video/mp4",
      }));
      r2Url = `${process.env.R2_PUBLIC_URL}/${key}`;

      const { data, error } = await supabase.from("videos").insert({
        shop_id: shop, title: title || file.name.replace(/\.[^.]+$/, ""),
        r2_url: r2Url, r2_key: key, status: "draft",
        views: 0, product_ids: [], show_on: [],
      }).select().single();
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
  const [tab, setTab] = useState("url"); // "url" | "file"
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  const isLoading = navigation.state === "submitting";

  const C = {
    bg: "#f8f9fb", accent: "#485861", text: "#0a0a0a",
    muted: "#9a9a93", border: "#e8e8e6", card: "#fff",
  };

  useEffect(() => {
    if (actionData?.success) navigate("/app/videos");
  }, [actionData]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith("video/") || file.name.endsWith(".mp4") || file.name.endsWith(".mov"))) {
      setSelectedFile(file);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) setSelectedFile(file);
  };

  const tabs = [
    { id: "url",  label: "Import from URL" },
    { id: "file", label: "Upload from Computer" },
  ];

  return (
    // Full screen overlay like a modal — sits on top of video manager
    <div style={{
      position: "fixed", inset: 0, background: "rgba(10,10,10,0.55)",
      zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', system-ui, sans-serif", padding: "20px",
    }}>
      <div style={{
        background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "620px",
        boxShadow: "0 24px 80px rgba(0,0,0,0.25)", overflow: "hidden",
      }}>

        {/* Modal Header */}
        <div style={{
          padding: "24px 28px 0", display: "flex",
          justifyContent: "space-between", alignItems: "center",
        }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "600", color: C.text }}>
            Add New Media
          </h2>
          <button onClick={() => navigate("/app/videos")} style={{
            background: "none", border: "1px solid #e8e8e6", borderRadius: "50%",
            width: "32px", height: "32px", cursor: "pointer", fontSize: "16px",
            color: C.muted, display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "0", padding: "20px 28px 0", borderBottom: "1px solid #f0f0ee" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "10px 16px", background: "none", border: "none",
              borderBottom: tab === t.id ? `2px solid ${C.accent}` : "2px solid transparent",
              cursor: "pointer", fontSize: "14px", fontWeight: tab === t.id ? "600" : "400",
              color: tab === t.id ? C.accent : C.muted,
              marginBottom: "-1px", transition: "all 0.15s",
            }}>
              {t.id === "url" ? "🔗 " : "💻 "}{t.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {actionData?.error && (
          <div style={{
            margin: "16px 28px 0", padding: "10px 14px",
            background: "#fef2f2", border: "1px solid #fca5a5",
            borderRadius: "8px", color: "#dc2626", fontSize: "13px"
          }}>
            ❌ {actionData.error}
          </div>
        )}

        {/* Tab: URL Import */}
        {tab === "url" && (
          <Form method="post" style={{ padding: "24px 28px 28px" }}>
            <input type="hidden" name="import_type" value="url" />

            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: C.text, marginBottom: "6px" }}>
                Video Title <span style={{ color: C.muted, fontWeight: "400" }}>(optional)</span>
              </label>
              <input name="title" type="text" placeholder="e.g. Summer Collection Reel"
                style={{
                  width: "100%", padding: "10px 14px", border: `1.5px solid ${C.border}`,
                  borderRadius: "8px", fontSize: "14px", outline: "none",
                  boxSizing: "border-box", color: C.text, fontFamily: "inherit",
                }}
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: C.text, marginBottom: "6px" }}>
                Direct Video URL <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input name="source_url" type="url" required
                placeholder="https://example.com/video.mp4"
                style={{
                  width: "100%", padding: "10px 14px", border: `1.5px solid ${C.border}`,
                  borderRadius: "8px", fontSize: "14px", outline: "none",
                  boxSizing: "border-box", color: C.text, fontFamily: "inherit",
                }}
              />
              <p style={{ margin: "6px 0 0", fontSize: "12px", color: C.muted }}>
                Must be a direct .mp4 or .mov link. Instagram/YouTube page links won't work.
              </p>
            </div>

            <button type="submit" disabled={isLoading} style={{
              width: "100%", padding: "12px", background: isLoading ? "#8a9da5" : C.accent,
              color: "#fff", border: "none", borderRadius: "8px",
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: "14px", fontWeight: "600", fontFamily: "inherit",
              transition: "background 0.2s",
            }}>
              {isLoading ? "⏳ Uploading video..." : "Import Video"}
            </button>
            {isLoading && (
              <p style={{ textAlign: "center", color: C.muted, marginTop: "10px", fontSize: "12px" }}>
                Downloading and uploading — this may take a minute for large files.
              </p>
            )}
          </Form>
        )}

        {/* Tab: File Upload */}
        {tab === "file" && (
          <Form method="post" encType="multipart/form-data" style={{ padding: "24px 28px 28px" }}>
            <input type="hidden" name="import_type" value="file" />

            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: C.text, marginBottom: "6px" }}>
                Video Title <span style={{ color: C.muted, fontWeight: "400" }}>(optional)</span>
              </label>
              <input name="title" type="text" placeholder="e.g. Product Launch Reel"
                style={{
                  width: "100%", padding: "10px 14px", border: `1.5px solid ${C.border}`,
                  borderRadius: "8px", fontSize: "14px", outline: "none",
                  boxSizing: "border-box", color: C.text, fontFamily: "inherit",
                }}
              />
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? C.accent : "#d0d0cc"}`,
                borderRadius: "12px", padding: "40px 20px",
                textAlign: "center", cursor: "pointer", marginBottom: "20px",
                background: dragOver ? "#f0f4f5" : "#fafaf8",
                transition: "all 0.2s",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                name="video_file"
                accept="video/mp4,video/mov,video/quicktime,.mp4,.mov"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              <div style={{ fontSize: "32px", marginBottom: "10px" }}>
                {selectedFile ? "🎬" : "☁️"}
              </div>
              {selectedFile ? (
                <>
                  <p style={{ margin: "0 0 4px", fontWeight: "600", fontSize: "14px", color: C.text }}>
                    {selectedFile.name}
                  </p>
                  <p style={{ margin: 0, fontSize: "12px", color: C.muted }}>
                    {(selectedFile.size / 1024 / 1024).toFixed(1)} MB · Click to change
                  </p>
                </>
              ) : (
                <>
                  <p style={{ margin: "0 0 4px", fontWeight: "600", fontSize: "14px", color: C.text }}>
                    Drop file here or click to browse
                  </p>
                  <p style={{ margin: 0, fontSize: "12px", color: C.muted }}>
                    Supports MP4, MOV · Max 1 GB per file
                  </p>
                </>
              )}
            </div>

            <button type="submit" disabled={isLoading || !selectedFile} style={{
              width: "100%", padding: "12px",
              background: isLoading ? "#8a9da5" : (!selectedFile ? "#c8ced1" : C.accent),
              color: "#fff", border: "none", borderRadius: "8px",
              cursor: (isLoading || !selectedFile) ? "not-allowed" : "pointer",
              fontSize: "14px", fontWeight: "600", fontFamily: "inherit",
              transition: "background 0.2s",
            }}>
              {isLoading ? "⏳ Uploading..." : "Upload Video"}
            </button>
            {isLoading && (
              <p style={{ textAlign: "center", color: C.muted, marginTop: "10px", fontSize: "12px" }}>
                Uploading your file to our servers — please don't close this tab.
              </p>
            )}
          </Form>
        )}

      </div>
    </div>
  );
}