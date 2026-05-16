const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

import { supabase } from "../supabase.server.js";

async function handleTrack(request) {
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

    // Read current video row once
    const { data: video } = await supabase
      .from("videos")
      .select("views, buy_now_clicks, watch_seconds")
      .eq("id", videoId)
      .eq("shop_id", shop)
      .single();

    if (video) {
      let updateObj = {};

      if (event === "view") {
        updateObj.views = (video.views || 0) + 1;
      }

      if (event === "click") {
        updateObj.buy_now_clicks = (video.buy_now_clicks || 0) + 1;
      }

      if (event === "watch" && value > 0) {
        // watch_seconds column — add if exists, skip gracefully if not
        if (video.watch_seconds !== undefined) {
          updateObj.watch_seconds = (video.watch_seconds || 0) + value;
        }
      }

      if (Object.keys(updateObj).length > 0) {
        await supabase
          .from("videos")
          .update(updateObj)
          .eq("id", videoId)
          .eq("shop_id", shop);
      }
    }

    // Also try to log to video_events (best effort — dashboard uses videos table now)
    await supabase.from("video_events").insert({
      shop_id:    shop,
      video_id:   videoId,
      event_type: event,
      value:      value,
    }).catch(() => {}); // ignore errors — videos table is the source of truth

    return new Response(JSON.stringify({ ok: true, event }), { headers: HEADERS });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { headers: HEADERS });
  }
}

export const loader = async ({ request }) => handleTrack(request);
export const action  = async ({ request }) => handleTrack(request);