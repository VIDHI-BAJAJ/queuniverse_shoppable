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
    const productId = url.searchParams.get("product_id");

    if (!shop) {
      return new Response(JSON.stringify({ videos: [] }), { headers });
    }

    // Fetch ALL live videos for this shop — no show_on filter
    // The storefront block handles page-level display
    let query = supabase
      .from("videos")
      .select("id, title, r2_url, thumbnail_url, product_ids, show_on, views")
      .eq("shop_id", shop)
      .eq("status", "live")
      .order("created_at", { ascending: false });

    // Only filter by product if explicitly requested
    if (productId) {
      const { data: videos, error } = await query;
      if (error) throw error;
      const filtered = (videos || []).filter((v) => {
        const ids = Array.isArray(v.product_ids) ? v.product_ids
          : typeof v.product_ids === "string" ? JSON.parse(v.product_ids || "[]")
          : [];
        return ids.includes(productId);
      });
      return new Response(JSON.stringify({ videos: filtered }), { headers });
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