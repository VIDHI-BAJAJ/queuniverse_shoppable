import { supabase } from "../supabase.server";

export const action = async ({ request }) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  try {
    const body = await request.json();
    const { video_id, shop } = body;

    if (!video_id || !shop) {
      return new Response(JSON.stringify({ error: "Missing video_id or shop" }), { status: 400, headers });
    }

    // Increment view count atomically using RPC
    const { error } = await supabase.rpc("increment_video_views", {
      vid: video_id,
      sid: shop,
    });

    // Fallback if RPC doesn't exist — use regular update
    if (error) {
      const { data } = await supabase
        .from("videos")
        .select("views")
        .eq("id", video_id)
        .eq("shop_id", shop)
        .single();

      if (data) {
        await supabase
          .from("videos")
          .update({ views: (data.views || 0) + 1 })
          .eq("id", video_id)
          .eq("shop_id", shop);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

// Also handle GET for preflight checks
export const loader = async ({ request }) => {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};