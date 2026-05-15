import { supabase } from "../supabase.server";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export const loader = async ({ request }) => {
  // Handle OPTIONS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  try {
    const url = new URL(request.url);
    const video_id = url.searchParams.get("video_id");
    const shop = url.searchParams.get("shop");

    if (!video_id || !shop) {
      return new Response(JSON.stringify({ error: "Missing params" }), { status: 400, headers });
    }

    // Get current views
    const { data, error: fetchError } = await supabase
      .from("videos")
      .select("views")
      .eq("id", video_id)
      .eq("shop_id", shop)
      .single();

    if (fetchError || !data) {
      return new Response(JSON.stringify({ error: "Video not found" }), { status: 404, headers });
    }

    // Increment views
    const { error: updateError } = await supabase
      .from("videos")
      .update({ views: (data.views || 0) + 1 })
      .eq("id", video_id)
      .eq("shop_id", shop);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ ok: true, views: (data.views || 0) + 1 }), { headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const action = async ({ request }) => {
  return loader({ request });
};