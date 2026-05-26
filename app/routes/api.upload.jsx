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
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: HEADERS });
  }

  try {
    // Use authenticate.admin to get the real shop from session
    const { authenticate } = await import("../shopify.server.js");
    let shop = "";
    try {
      const { session } = await authenticate.admin(request);
      shop = session.shop;
    } catch(e) {
      // fallback: read from form data
    }

    const formData = await request.formData();
    const type = formData.get("type");
    const title = formData.get("title") || "Untitled Video";
    
    // Use shop from session, fallback to form data
    if (!shop) shop = formData.get("shop") || "";

    // ── PRESIGN ──
    if (type === "presign") {
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
      const ext = formData.get("ext") || "mp4";
      const contentType = formData.get("content_type") || "video/mp4";
      const key = `videos/${uuidv4()}.${ext}`;
      const thumbKey = `thumbnails/${uuidv4()}.jpg`;

      const videoUrl = await getSignedUrl(
        getS3(),
        new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, ContentType: contentType }),
        { expiresIn: 3600 }
      );
      const thumbUrl = await getSignedUrl(
        getS3(),
        new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: thumbKey, ContentType: "image/jpeg" }),
        { expiresIn: 3600 }
      );

      // Return shop in presign response so confirm step can use it
      return new Response(JSON.stringify({ videoUrl, thumbUrl, key, thumbKey, shop }), { headers: HEADERS });
    }

    // ── CONFIRM ──
    if (type === "confirm") {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const key = formData.get("key");
      const thumbKey = formData.get("thumb_key");
      const hasThumb = formData.get("has_thumb") === "true";
      const r2Url = `${process.env.R2_PUBLIC_URL}/${key}`;
      const thumbnailUrl = hasThumb ? `${process.env.R2_PUBLIC_URL}/${thumbKey}` : null;

      console.log("Confirm upload - shop:", shop, "key:", key);

      const { error } = await supabase.from("videos").insert({
        shop_id: shop, title, r2_url: r2Url, r2_key: key,
        status: "draft", views: 0, product_ids: [], show_on: [],
        thumbnail_url: thumbnailUrl,
      });

      if (error) {
        console.error("Supabase error:", error);
        return new Response(JSON.stringify({ error: `${error.message} (code:${error.code})` }), { headers: HEADERS });
      }

      return new Response(JSON.stringify({ ok: true, shop }), { headers: HEADERS });
    }

    return new Response(JSON.stringify({ error: "Unknown type" }), { headers: HEADERS });
  } catch (e) {
    console.error("Upload error:", e);
    return new Response(JSON.stringify({ error: e.message }), { headers: HEADERS });
  }
};