import { Form, useActionData, useNavigation, useNavigate } from "react-router";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import { supabase } from "../supabase.server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

const getS3 = () =>
  new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const sourceUrl = formData.get("source_url");
  const title = formData.get("title");

  if (!sourceUrl) return { error: "Please provide a video URL" };

  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error("Failed to fetch video: " + response.status);
    const buffer = Buffer.from(await response.arrayBuffer());
    const key = `videos/${uuidv4()}.mp4`;

    await getS3().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: "video/mp4",
      })
    );

    const r2Url = `${process.env.R2_PUBLIC_URL}/${key}`;

    const { data, error } = await supabase
      .from("videos")
      .insert({
        shop_id: shop,
        title: title || "Untitled Video",
        r2_url: r2Url,
        r2_key: key,
        source_url: sourceUrl,
        status: "draft",
        views: 0,
        product_ids: [],
        show_on: [],
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, videoId: data.id };
  } catch (err) {
    return { error: err.message };
  }
};

export default function NewVideo() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isLoading = navigation.state === "submitting";

  const C = {
    bg: "#f8f9fb", card: "#ffffff", border: "#f0f0ee",
    accent: "#485861", text: "#0a0a0a", muted: "#9a9a93",
  };

  useEffect(() => {
    if (actionData?.success && actionData?.videoId) {
      navigate(`/app/videos`);
    }
  }, [actionData]);

  return (
    <div style={{ padding: "28px 32px", background: C.bg, minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>

      {/* Back button — navigate instead of Link to fix the broken button issue */}
      <button
        onClick={() => navigate("/app/videos")}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: C.accent, fontSize: "14px", fontWeight: "500",
          padding: "0", marginBottom: "20px", display: "flex", alignItems: "center", gap: "4px"
        }}>
        ← Back to Videos
      </button>

      <div style={{
        background: C.card, borderRadius: "10px", padding: "32px",
        maxWidth: "560px", border: `1px solid ${C.border}`, borderTop: `2px solid ${C.accent}`,
      }}>
        <h1 style={{ marginTop: 0, marginBottom: "4px", fontSize: "22px", fontWeight: "600", color: C.text }}>
          Import Video
        </h1>
        <p style={{ color: C.muted, marginTop: "0", marginBottom: "28px", fontSize: "14px" }}>
          Paste a direct MP4 link to import your video
        </p>

        {actionData?.error && (
          <div style={{
            background: "#fef2f2", border: "1px solid #fca5a5",
            padding: "12px 16px", borderRadius: "8px",
            color: "#dc2626", marginBottom: "20px", fontSize: "13px"
          }}>
            ❌ {actionData.error}
          </div>
        )}

        <Form method="post">
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontWeight: "500", marginBottom: "6px", fontSize: "13px", color: C.text }}>
              Video Title
            </label>
            <input
              name="title"
              type="text"
              placeholder="e.g. Summer Collection Reel"
              style={{
                width: "100%", padding: "10px 14px",
                border: `1.5px solid ${C.border}`, borderRadius: "8px",
                fontSize: "14px", outline: "none", boxSizing: "border-box",
                color: C.text, background: "#fff"
              }}
            />
          </div>

          <div style={{ marginBottom: "28px" }}>
            <label style={{ display: "block", fontWeight: "500", marginBottom: "6px", fontSize: "13px", color: C.text }}>
              Video URL <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              name="source_url"
              type="url"
              required
              placeholder="https://example.com/video.mp4"
              style={{
                width: "100%", padding: "10px 14px",
                border: `1.5px solid ${C.border}`, borderRadius: "8px",
                fontSize: "14px", outline: "none", boxSizing: "border-box",
                color: C.text, background: "#fff"
              }}
            />
            <p style={{ margin: "6px 0 0", fontSize: "12px", color: C.muted }}>
              Must be a direct .mp4 link. Instagram/YouTube links won't work.
            </p>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: "100%", padding: "12px",
              background: isLoading ? "#8a9da5" : C.accent,
              color: "#fff", border: "none", borderRadius: "8px",
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: "14px", fontWeight: "500",
              transition: "background 0.2s"
            }}
          >
            {isLoading ? "⏳ Uploading..." : "🚀 Import Video"}
          </button>

          {isLoading && (
            <p style={{ textAlign: "center", color: C.muted, marginTop: "12px", fontSize: "13px" }}>
              Downloading and uploading video... this may take a minute.
            </p>
          )}
        </Form>
      </div>
    </div>
  );
}