import { supabase } from "../supabase.server";

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
  };

  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const page = url.searchParams.get("page") || "home";
    const productId = url.searchParams.get("product_id");

    if (!shop) {
      return new Response(JSON.stringify({ videos: [] }), { headers });
    }

    let query = supabase
      .from("videos")
      .select("id, title, r2_url, thumbnail_url, product_ids, show_on, views")
      .eq("shop_id", shop)
      .eq("status", "live");

    if (page === "home") {
      // FIXED: pass array directly, not JSON.stringify
      query = query.contains("show_on", ["home"]);
    } else if (page === "pdp" && productId) {
      query = query.contains("product_ids", [productId]);
    }

    const { data: videos, error } = await query;
    if (error) throw error;

    return new Response(JSON.stringify({ videos: videos || [] }), { headers });

  } catch (err) {
    return new Response(
      JSON.stringify({ videos: [], error: err.message }),
      { headers }
    );
  }
};