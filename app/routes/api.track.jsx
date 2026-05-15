import { supabase } from "../supabase.server";

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: HEADERS });
  }

  try {
    const url     = new URL(request.url);
    const videoId = url.searchParams.get("video_id");
    const shop    = url.searchParams.get("shop");
    const event   = url.searchParams.get("event") || "view";
    const value   = parseFloat(url.searchParams.get("value") || "0");

    if (!videoId || !shop) {
      return new Response(JSON.stringify({ ok: false }), { headers: HEADERS });
    }

    // Increment views counter on videos table
    if (event === "view") {
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
    }

    // Always log to video_events for dashboard analytics
    await supabase.from("video_events").insert({
      shop_id:    shop,
      video_id:   videoId,
      event_type: event,
      value:      value,
    });

    return new Response(JSON.stringify({ ok: true }), { headers: HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { headers: HEADERS });
  }
};