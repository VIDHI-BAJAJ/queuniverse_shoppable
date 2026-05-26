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

    // ── Parse body: support both FormData and JSON ──
    const ct = request.headers.get("content-type") || "";
    let fields = {};

    if (ct.includes("application/json")) {
      fields = await request.json();
    } else {
      // FormData
      const fd = await request.formData();
      for (const [k, v] of fd.entries()) {
        fields[k] = v;
      }
    }

    const type = (fields.type || "").trim();
    console.log("[api.upload] type =", type, "| fields =", Object.keys(fields));

    // ── PRESIGN: generate signed PUT URLs so browser uploads directly to R2 ──
    if (type === "presign") {
      const ext = (fields.ext || fields.fileName?.split(".").pop() || "mp4").replace(/[^a-z0-9]/gi, "");
      const contentType = fields.content_type || fields.contentType || "video/mp4";
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
        ok: true,
        videoUrl,
        thumbUrl,
        key: videoKey,
        thumbKey,
      }), { headers: HEADERS });
    }

    // ── CONFIRM: video is already in R2 — just save metadata to Supabase ──
    if (type === "confirm") {
      const key = fields.key;
      const thumbKey = fields.thumb_key;
      const hasThumb = fields.has_thumb === "true" || fields.has_thumb === true;
      const title = fields.title || "Untitled Video";

      if (!key) {
        return new Response(JSON.stringify({ error: "Missing key" }), { status: 400, headers: HEADERS });
      }

      const r2Url = `${process.env.R2_PUBLIC_URL}/${key}`;
      const thumbnailUrl = hasThumb && thumbKey ? `${process.env.R2_PUBLIC_URL}/${thumbKey}` : null;

      const { error } = await supabase.from("videos").insert({
        shop_id: shop,
        title,
        r2_url: r2Url,
        r2_key: key,
        status: "draft",
        views: 0,
        product_ids: [],
        show_on: [],
        thumbnail_url: thumbnailUrl,
      });

      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: HEADERS });
    }

    // ── Fallback: log exactly what we received to help debug ──
    console.error("[api.upload] Unhandled type:", type, "fields:", fields);
    return new Response(
      JSON.stringify({ error: `Unknown type: "${type}". Received keys: ${Object.keys(fields).join(", ")}` }),
      { status: 400, headers: HEADERS }
    );

  } catch (e) {
    console.error("[api.upload] Error:", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: HEADERS });
  }
};