import { json } from "@remix-run/node";
import { supabase } from "../supabase.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const page = url.searchParams.get("page") || "home";
  const productId = url.searchParams.get("product_id");

  if (!shop) return json({ error: "shop required" }, { status: 400 });

  let query = supabase
    .from("videos")
    .select("id, title, r2_url, thumbnail_url, product_ids, show_on, views")
    .eq("shop_id", shop)
    .eq("status", "live");

  if (page === "home") {
    query = query.contains("show_on", ["home"]);
  } else if (page === "pdp" && productId) {
    query = query.contains("product_ids", [productId]);
  }

  const { data: videos } = await query;

  // Increment views
  if (videos?.length) {
    videos.forEach(async (v) => {
      await supabase.rpc("increment_views", { video_id: v.id });
    });
  }

  return json({ videos: videos || [] }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60",
    },
  });
};