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

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

export const action = async ({ request }) => {
  const { authenticate } = await import("../shopify.server.js");
  const { supabase } = await import("../supabase.server.js");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: HEADERS });
  }

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const type = formData.get("type"); // "url" | "file" | "thumbnail"
    const title = formData.get("title") || "Untitled Video";

    let buffer, contentType, key, r2Url;

    if (type === "url") {
      const sourceUrl = formData.get("source_url");
      if (!sourceUrl) return new Response(JSON.stringify({ error: "No URL" }), { headers: HEADERS });
      const res = await fetch(sourceUrl);
      if (!res.ok) throw new Error("Failed to fetch: " + res.status);
      buffer = Buffer.from(await res.arrayBuffer());
      contentType = "video/mp4";
      key = `videos/${uuidv4()}.mp4`;
      await getS3().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: buffer, ContentType: contentType }));
      r2Url = `${process.env.R2_PUBLIC_URL}/${key}`;

      let thumbnailUrl = null;
      const thumb = formData.get("thumbnail");
      if (thumb && thumb.size > 0) {
        const tb = Buffer.from(await thumb.arrayBuffer());
        const tk = `thumbnails/${uuidv4()}.jpg`;
        await getS3().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: tk, Body: tb, ContentType: "image/jpeg" }));
        thumbnailUrl = `${process.env.R2_PUBLIC_URL}/${tk}`;
      }

      const { error } = await supabase.from("videos").insert({
        shop_id: shop, title, r2_url: r2Url, r2_key: key,
        source_url: sourceUrl, status: "draft", views: 0, product_ids: [], show_on: [],
        thumbnail_url: thumbnailUrl,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: HEADERS });
    }

    if (type === "file") {
      const file = formData.get("video_file");
      if (!file || file.size === 0) return new Response(JSON.stringify({ error: "No file" }), { headers: HEADERS });
      buffer = Buffer.from(await file.arrayBuffer());
      contentType = file.type || "video/mp4";
      const ext = file.name.split(".").pop() || "mp4";
      key = `videos/${uuidv4()}.${ext}`;
      await getS3().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: buffer, ContentType: contentType }));
      r2Url = `${process.env.R2_PUBLIC_URL}/${key}`;

      let thumbnailUrl = null;
      const thumb = formData.get("thumbnail");
      if (thumb && thumb.size > 0) {
        const tb = Buffer.from(await thumb.arrayBuffer());
        const tk = `thumbnails/${uuidv4()}.jpg`;
        await getS3().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: tk, Body: tb, ContentType: "image/jpeg" }));
        thumbnailUrl = `${process.env.R2_PUBLIC_URL}/${tk}`;
      }

      const { error } = await supabase.from("videos").insert({
        shop_id: shop, title: title || file.name.replace(/\.[^.]+$/, ""),
        r2_url: r2Url, r2_key: key, status: "draft", views: 0, product_ids: [], show_on: [],
        thumbnail_url: thumbnailUrl,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: HEADERS });
    }

    return new Response(JSON.stringify({ error: "Unknown type" }), { headers: HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { headers: HEADERS });
  }
};