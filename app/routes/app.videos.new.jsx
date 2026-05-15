import { Form, useActionData, useNavigation, Link, useNavigate } from "react-router";
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

  useEffect(() => {
    if (actionData?.success && actionData?.videoId) {
      navigate(`/app/videos/${actionData.videoId}`);
    }
  }, [actionData]);

  return (
    <div style={{ padding: "24px", maxWidth: "560px", fontFamily: "sans-serif" }}>
      <Link to="/app/videos" style={{ color: "#008060", textDecoration: "none", fontSize: "14px" }}>
        ← Back to Videos
      </Link>

      <h1 style={{ marginTop: "16px", marginBottom: "4px", fontSize: "24px" }}>Import Video</h1>
      <p style={{ color: "#6b7280", marginTop: "0", marginBottom: "24px", fontSize: "14px" }}>
        Paste a direct MP4 link to import your video
      </p>

      {actionData?.error && (
        <div style={{
          background: "#fef2f2", border: "1px solid #fca5a5",
          padding: "12px 16px", borderRadius: "8px",
          color: "#dc2626", marginBottom: "20px", fontSize: "14px"
        }}>
          ❌ {actionData.error}
        </div>
      )}

      <Form method="post">
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "14px" }}>
            Video Title
          </label>
          <input
            name="title"
            type="text"
            placeholder="e.g. Summer Collection Reel"
            style={{
              width: "100%", padding: "10px 14px",
              border: "1.5px solid #e5e7eb", borderRadius: "8px",
              fontSize: "14px", outline: "none", boxSizing: "border-box"
            }}
          />
        </div>

        <div style={{ marginBottom: "24px" }}>
          <label style={{ display: "block", fontWeight: "600", marginBottom: "6px", fontSize: "14px" }}>
            Video URL <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <input
            name="source_url"
            type="url"
            required
            placeholder="https://example.com/video.mp4"
            style={{
              width: "100%", padding: "10px 14px",
              border: "1.5px solid #e5e7eb", borderRadius: "8px",
              fontSize: "14px", outline: "none", boxSizing: "border-box"
            }}
          />
          <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#6b7280" }}>
            Must be a direct .mp4 link. Instagram/YouTube links won't work.
          </p>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          style={{
            width: "100%", padding: "12px",
            background: isLoading ? "#d1fae5" : "#008060",
            color: isLoading ? "#065f46" : "white",
            border: "none", borderRadius: "8px",
            cursor: isLoading ? "not-allowed" : "pointer",
            fontSize: "15px", fontWeight: "600",
            transition: "background 0.2s"
          }}
        >
          {isLoading ? "⏳ Uploading to R2..." : "🚀 Import Video"}
        </button>

        {isLoading && (
          <p style={{ textAlign: "center", color: "#6b7280", marginTop: "12px", fontSize: "13px" }}>
            Downloading and uploading video... this may take a minute.
          </p>
        )}
      </Form>
    </div>
  );
}