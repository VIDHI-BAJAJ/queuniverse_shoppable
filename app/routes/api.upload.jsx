import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

    // Parse body: support both FormData and JSON
    const ct = request.headers.get("content-type") || "";
    let fields = {};
    if (ct.includes("application/json")) {
      fields = await request.json();
    } else {
      const fd = await request.formData();
      for (const [k, v] of fd.entries()) fields[k] = v;
    }

    const type = (fields.type || "").trim();
    console.log("[api.upload] type =", type);

    // ── PRESIGN: generate signed PUT URLs for browser → R2 direct upload ──
    if (type === "presign") {
      const ext = (fields.ext || "mp4").replace(/[^a-z0-9]/gi, "");
      const contentType = fields.content_type || "video/mp4";
      const videoKey = `videos/${uuidv4()}.${ext}`;
      const thumbKey = `thumbnails/${uuidv4()}.jpg`;
      const s3 = getS3();

      const [videoUrl, thumbUrl] = await Promise.all([
        getSignedUrl(s3, new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: videoKey,
          ContentType: contentType,
        }), { expiresIn: 3600 }),
        getSignedUrl(s3, new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: thumbKey,
          ContentType: "image/jpeg",
        }), { expiresIn: 3600 }),
      ]);

      return new Response(JSON.stringify({
        ok: true, videoUrl, thumbUrl, key: videoKey, thumbKey,
      }), { headers: HEADERS });
    }

    // ── CONFIRM: save metadata after browser has uploaded to R2 ──
    if (type === "confirm") {
      const key = fields.key;
      const thumbKey = fields.thumb_key;
      const hasThumb = fields.has_thumb === "true" || fields.has_thumb === true;
      const title = fields.title || "Untitled Video";
      if (!key) return new Response(JSON.stringify({ error: "Missing key" }), { status: 400, headers: HEADERS });

      const { error } = await supabase.from("videos").insert({
        shop_id: shop,
        title,
        r2_url: `${process.env.R2_PUBLIC_URL}/${key}`,
        r2_key: key,
        status: "draft",
        views: 0,
        product_ids: [],
        show_on: [],
        thumbnail_url: hasThumb && thumbKey ? `${process.env.R2_PUBLIC_URL}/${thumbKey}` : null,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: HEADERS });
    }

    // ── URL-IMPORT: server fetches the video and uploads to R2 ──
    // Used instead of browser fetch (avoids CORS issues with Shopify CDN etc.)
    if (type === "url_import") {
      const sourceUrl = fields.source_url;
      const title = fields.title || "Untitled Video";
      if (!sourceUrl) return new Response(JSON.stringify({ error: "Missing source_url" }), { status: 400, headers: HEADERS });

      // Fetch video server-side (no CORS restriction)
      const videoRes = await fetch(sourceUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!videoRes.ok) throw new Error(`Failed to fetch video: ${videoRes.status} ${videoRes.statusText}`);

      const buffer = Buffer.from(await videoRes.arrayBuffer());
      const key = `videos/${uuidv4()}.mp4`;
      const s3 = getS3();

      await s3.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: "video/mp4",
      }));

      const { error } = await supabase.from("videos").insert({
        shop_id: shop,
        title,
        r2_url: `${process.env.R2_PUBLIC_URL}/${key}`,
        r2_key: key,
        source_url: sourceUrl,
        status: "draft",
        views: 0,
        product_ids: [],
        show_on: [],
        thumbnail_url: null,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: HEADERS });
    }

    console.error("[api.upload] Unknown type:", type, "keys:", Object.keys(fields));
    return new Response(
      JSON.stringify({ error: `Unknown type: "${type}"` }),
      { status: 400, headers: HEADERS }
    );

  } catch (e) {
    console.error("[api.upload] Error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: HEADERS });
  }
};