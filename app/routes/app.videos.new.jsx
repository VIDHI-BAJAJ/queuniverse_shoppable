import { useState } from "react";
import { Form, useActionData, useNavigation, Link } from "react-router";

import { authenticate } from "../shopify.server";
import { supabase } from "../supabase.server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

const s3 = new S3Client({
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

  if (!sourceUrl) {
    return json({ error: "Please provide a video URL" });
  }

  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error("Failed to fetch video");

    const buffer = await response.arrayBuffer();
    const key = `videos/${uuidv4()}.mp4`;

    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: Buffer.from(buffer),
      ContentType: "video/mp4",
    }));

    const r2Url = `${process.env.R2_PUBLIC_URL}/${key}`;

    const { data, error } = await supabase.from("videos").insert({
      shop_id: shop,
      title: title || "Untitled Video",
      r2_url: r2Url,
      r2_key: key,
      source_url: sourceUrl,
      status: "draft",
      views: 0,
      product_ids: [],
      show_on: [],
    }).select().single();

    if (error) throw error;

    return redirect(`/app/videos/${data.id}`);
  } catch (err) {
    return json({ error: err.message });
  }
};

export default function NewVideo() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "600px" }}>
      <Link to="/app/videos" style={{ color: "#008060" }}>← Back to Videos</Link>
      <h1 style={{ marginTop: "16px" }}>Import Video</h1>

      {actionData?.error && (
        <div style={{ background: "#fff4f4", border: "1px solid #de3618", padding: "12px", borderRadius: "6px", marginBottom: "16px", color: "#de3618" }}>
          {actionData.error}
        </div>
      )}

      <Form method="post" style={{ marginTop: "20px" }}>
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "6px" }}>
            Video Title
          </label>
          <input
            name="title"
            type="text"
            placeholder="e.g. Summer Collection Reel"
            style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "16px" }}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "6px" }}>
            Video URL (MP4 direct link)
          </label>
          <input
            name="source_url"
            type="url"
            placeholder="https://example.com/video.mp4"
            required
            style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "16px" }}
          />
          <p style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
            Paste a direct MP4 URL.
          </p>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          style={{ padding: "12px 24px", background: isLoading ? "#ccc" : "#008060", color: "white", border: "none", borderRadius: "6px", cursor: isLoading ? "not-allowed" : "pointer", fontSize: "16px" }}
        >
          {isLoading ? "Uploading to R2..." : "Import Video"}
        </button>
      </Form>
    </div>
  );
}
