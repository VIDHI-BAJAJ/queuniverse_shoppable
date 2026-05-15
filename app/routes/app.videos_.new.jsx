import { Form, useActionData, useNavigation, Link, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { supabase } from "../supabase.server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { unstable_parseMultipartFormData, unstable_createMemoryUploadHandler } from "react-router";

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

  let title, buffer, key, r2Url;

  try {
    if (contentType.includes("multipart/form-data")) {
      // Direct file upload
      const uploadHandler = unstable_createMemoryUploadHandler({ maxPartSize: 500_000_000 }); // 500MB
      const formData = await unstable_parseMultipartFormData(request, uploadHandler);

      title = formData.get("title");
      const file = formData.get("video_file");

      if (!file || file.size === 0) {
        return { error: "No file selected" };
      }

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      key = `videos/${uuidv4()}.mp4`;

      await getS3().send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: file.type || "video/mp4",
      }));

    } else {
      // URL import
      const formData = await request.formData();
      title = formData.get("title");
      const sourceUrl = formData.get("source_url");

      if (!sourceUrl) return { error: "Please provide a video URL or upload a file" };

      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error(`Failed to fetch video: ${response.status}`);

      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
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
    console.error("Upload error:", err);
    return { error: err.message };
  }
};

export default function NewVideo() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isLoading = navigation.state === "submitting";
  const [uploadMode, setUploadMode] = useState("file"); // "file" or "url"
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
        <div style={{
          background: "#fff4f4", border: "1px solid #de3618",
          padding: "12px", borderRadius: "6px", marginBottom: "16px", color: "#de3618"
        }}>
          ❌ {actionData.error}
        </div>
      )}

      {/* Toggle */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        <button
          type="button"
          onClick={() => setUploadMode("file")}
          style={{
            padding: "8px 20px", borderRadius: "6px", border: "2px solid",
            borderColor: uploadMode === "file" ? "#008060" : "#ddd",
            background: uploadMode === "file" ? "#008060" : "#fff",
            color: uploadMode === "file" ? "#fff" : "#333",
            cursor: "pointer", fontWeight: "bold"
          }}>
          📁 Upload File
        </button>
        <button
          type="button"
          onClick={() => setUploadMode("url")}
          style={{
            padding: "8px 20px", borderRadius: "6px", border: "2px solid",
            borderColor: uploadMode === "url" ? "#008060" : "#ddd",
            background: uploadMode === "url" ? "#008060" : "#fff",
            color: uploadMode === "url" ? "#fff" : "#333",
            cursor: "pointer", fontWeight: "bold"
          }}>
          🔗 Import from URL
        </button>
      </div>

      <Form
        method="post"
        encType={uploadMode === "file" ? "multipart/form-data" : "application/x-www-form-urlencoded"}
      >
        {/* Title */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "6px" }}>
            Video Title
          </label>
          <input
            name="title"
            type="text"
            placeholder="e.g. Summer Collection Reel"
            style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "16px", boxSizing: "border-box" }}
          />
        </div>

        {uploadMode === "file" ? (
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: "6px" }}>
              Select Video File
            </label>
            <div style={{
              border: "2px dashed #ddd", borderRadius: "8px",
              padding: "32px", textAlign: "center",
              background: selectedFile ? "#f0fdf4" : "#fafafa",
              borderColor: selectedFile ? "#008060" : "#ddd"
            }}>
              <input
                name="video_file"
                type="file"
                accept="video/mp4,video/mov,video/avi,video/*"
                required
                onChange={(e) => setSelectedFile(e.target.files[0])}
                style={{ display: "none" }}
                id="video-file-input"
              />
              <label htmlFor="video-file-input" style={{ cursor: "pointer" }}>
                {selectedFile ? (
                  <div>
                    <div style={{ fontSize: "32px" }}>✅</div>
                    <div style={{ fontWeight: "bold", color: "#008060", marginTop: "8px" }}>
                      {selectedFile.name}
                    </div>
                    <div style={{ color: "#666", fontSize: "13px" }}>
                      {(selectedFile.size / 1024 / 1024).toFixed(1)} MB — click to change
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: "48px" }}>🎬</div>
                    <div style={{ fontWeight: "bold", marginTop: "8px" }}>
                      Click to select video
                    </div>
                    <div style={{ color: "#666", fontSize: "13px" }}>
                      MP4, MOV, AVI up to 500MB
                    </div>
                  </div>
                )}
              </label>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontWeight: "bold", marginBottom: "6px" }}>
              Video URL (direct MP4 link)
            </label>
            <input
              name="source_url"
              type="url"
              placeholder="https://example.com/video.mp4"
              style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "16px", boxSizing: "border-box" }}
            />
            <p style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
              Must be a direct .mp4 link (not YouTube/Instagram)
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          style={{
            padding: "12px 32px",
            background: isLoading ? "#ccc" : "#008060",
            color: "white", border: "none", borderRadius: "6px",
            cursor: isLoading ? "not-allowed" : "pointer",
            fontSize: "16px", fontWeight: "bold", width: "100%"
          }}>
          {isLoading
            ? (uploadMode === "file" ? "⏳ Uploading to R2..." : "⏳ Importing...")
            : (uploadMode === "file" ? "🚀 Upload Video" : "🔗 Import Video")}
        </button>

        {isLoading && (
          <p style={{ textAlign: "center", color: "#666", marginTop: "12px", fontSize: "13px" }}>
            Please wait, this may take a minute for large files...
          </p>
        )}
      </Form>
    </div>
  );
}
