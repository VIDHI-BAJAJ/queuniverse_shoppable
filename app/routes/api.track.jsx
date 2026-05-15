const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export const loader = async ({ request }) => {
  const { supabase } = await import("../supabase.server.js");
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
      return new Response(JSON.stringify({ ok: false, error: "Missing params" }), { headers: HEADERS });
    }

    // 1. Increment views on videos table for "view" events
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

    // 2. Log event to video_events table
    const { error: insertError } = await supabase
      .from("video_events")
      .insert({
        shop_id:    shop,
        video_id:   videoId,
        event_type: event,
        value:      value,
      });

    if (insertError) {
      // Table might not exist — return ok anyway so views still increment
      console.error("video_events insert error:", insertError.message);
      return new Response(JSON.stringify({ ok: true, warning: insertError.message }), { headers: HEADERS });
    }

    return new Response(JSON.stringify({ ok: true, event }), { headers: HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { headers: HEADERS });
  }
};