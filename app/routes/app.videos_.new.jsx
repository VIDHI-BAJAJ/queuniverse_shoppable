import { Form, useActionData, useNavigation, Link, useNavigate } from "react-router";
import { useEffect } from "react";
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
  const formData = await request.formData();
  const sourceUrl = formData.get("source_url");
  const title = formData.get("title");
  if (!sourceUrl) return { error: "Please provide a video URL" };
  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error("Failed to fetch video");
    const buffer = Buffer.from(await response.arrayBuffer());
    const key = `videos/${uuidv4()}.mp4`;
    await getS3().send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key, Body: buffer, ContentType: "video/mp4",
    }));
    const r2Url = `${process.env.R2_PUBLIC_URL}/${key}`;
    const { data, error } = await supabase.from("videos").insert({
      shop_id: shop, title: title || "Untitled Video",
      r2_url: r2Url, r2_key: key, source_url: sourceUrl,
      status: "draft", views: 0, product_ids: [], show_on: [],
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
  useEffect(() => {
    if (actionData?.success && actionData?.videoId) {
      navigate(`/app/videos/${actionData.videoId}`);
    }
  }, [actionData]);
  return (
    <div style={{ padding: "20px", maxWidth: "600px" }}>
      <Link to="/app/videos" style={{ color: "#008060" }}>← Back</Link>
      <h1>Import Video</h1>
      {actionData?.error && <p style={{ color: "red" }}>{actionData.error}</p>}
      <Form method="post">
        <div style={{ marginBottom: "16px" }}>
          <label>Title<br/>
            <input name="title" type="text" style={{ width: "100%", padding: "8px", marginTop: "4px" }} />
          </label>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label>Video URL (direct MP4 link)<br/>
            <input name="source_url" type="url" required style={{ width: "100%", padding: "8px", marginTop: "4px" }} />
          </label>
        </div>
        <button type="submit" disabled={isLoading}
          style={{ padding: "10px 24px", background: "#008060", color: "white", border: "none", borderRadius: "6px", cursor: "pointer" }}>
          {isLoading ? "Uploading..." : "Import Video"}
        </button>
      </Form>
    </div>
  );
}