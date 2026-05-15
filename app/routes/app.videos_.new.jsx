import { Form, useActionData, useNavigation, Link, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { supabase } from "../supabase.server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

const getS3 = () => new S3Client({
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
  const contentType = request.headers.get("content-type") || "";
  let title, key, r2Url;

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      title = formData.get("title");
      const file = formData.get("video_file");
      if (!file || typeof file === "string" || file.size === 0) {
        return { error: "No file selected" };
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      key = `videos/${uuidv4()}.mp4`;
      await getS3().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type || "video/mp4",
      }));
    } else {
      const formData = await request.formData();
      title = formData.get("title");
      const sourceUrl = formData.get("source_url");
      if (!sourceUrl) return { error: "Please provide a video URL" };
      const res = await fetch(sourceUrl);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      key = `videos/${uuidv4()}.mp4`;
      await getS3().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: "video/mp4",
      }));
    }

    r2Url = `${process.env.R2_PUBLIC_URL}/${key}`;
    const { data, error } = await supabase.from("videos").insert({
      shop_id: shop,
      title: title || "Untitled Video",
      r2_url: r2Url,
      r2_key: key,
      status: "draft",
      views: 0,
      product_ids: [],
      show_on: [],
    }).select().single();
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
  const [mode, setMode] = useState("file");
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    if (actionData?.success && actionData?.videoId) {
      navigate(`/app/videos/${actionData.videoId}`);
    }
  }, [actionData]);

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "600px" }}>
      <Link to="/app/videos" style={{ color: "#008060" }}>← Back to Videos</Link>
      <h1 style={{ marginTop: "16px" }}>Upload Video</h1>

      {actionData?.error && (
        <div style={{ background: "#fff4f4", border: "1px solid #de3618", padding: "12px", borderRadius: "6px", marginBottom: "16px", color: "#de3618" }}>
          ❌ {actionData.error}
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        {["file", "url"].map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} style={{
            padding: "8px 20px", borderRadius: "6px", border: "2px solid",
            borderColor: mode === m ? "#008060" : "#ddd",
            background: mode === m ? "#008060" : "#fff",
            color: mode === m ? "#fff" : "#333",
            cursor: "pointer", fontWeight: "bold"
          }}>
            {m === "file" ? "📁 Upload File" : "🔗 Import URL"}
          </button>
        ))}
      </div>

      <Form method="post" encType={mode === "file" ? "multipart/form-data" : "application/x-www-form-urlencoded"}>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "6px" }}>Title</label>
          <input name="title" type="text" placeholder="Video title"
            style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "16px", boxSizing: "border-box" }} />
        </div>

        {mode === "file" ? (
          <div style={{ marginBottom: "16px" }}>
            <input name="video_file" type="file" accept="video/*" id="vf"
              onChange={(e) => setSelectedFile(e.target.files[0])} style={{ display: "none" }} />
            <label htmlFor="vf" style={{
              display: "block", border: "2px dashed", borderColor: selectedFile ? "#008060" : "#ddd",
              borderRadius: "8px", padding: "40px", textAlign: "center", cursor: "pointer",
              background: selectedFile ? "#f0fdf4" : "#fafafa"
            }}>
              {selectedFile
                ? <><div style={{ fontSize: "32px" }}>✅</div><div style={{ fontWeight: "bold", color: "#008060" }}>{selectedFile.name}</div><div style={{ color: "#666", fontSize: "13px" }}>{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</div></>
                : <><div style={{ fontSize: "48px" }}>🎬</div><div style={{ fontWeight: "bold" }}>Click to select MP4</div><div style={{ color: "#666", fontSize: "13px" }}>Up to 500MB</div></>
              }
            </label>
          </div>
        ) : (
          <div style={{ marginBottom: "16px" }}>
            <input name="source_url" type="url" placeholder="https://example.com/video.mp4"
              style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "16px", boxSizing: "border-box" }} />
          </div>
        )}

        <button type="submit" disabled={isLoading} style={{
          padding: "12px", width: "100%", background: isLoading ? "#ccc" : "#008060",
          color: "white", border: "none", borderRadius: "6px",
          cursor: isLoading ? "not-allowed" : "pointer", fontSize: "16px", fontWeight: "bold"
        }}>
          {isLoading ? "⏳ Uploading to R2..." : mode === "file" ? "🚀 Upload Video" : "🔗 Import Video"}
        </button>
      </Form>
    </div>
  );
}