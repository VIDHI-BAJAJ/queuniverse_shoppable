import { supabase } from "../supabase.server";

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: HEADERS });
  }

  try {
    const url = new URL(request.url);
    const videoId = url.searchParams.get("video_id");
    const shop    = url.searchParams.get("shop");

    if (!videoId || !shop) {
      return new Response(JSON.stringify({ ok: false }), { headers: HEADERS });
    }

    // Get current views then increment
    const { data } = await supabase
      .from("videos")
      .select("views")
      .eq("id", videoId)
      .eq("shop_id", shop)
      .single();

    if (data) {
      await supabase
        .from("videos")
        .update({ views: (data.views || 0) + 1 })
        .eq("id", videoId)
        .eq("shop_id", shop);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false }), { headers: HEADERS });
  }
};