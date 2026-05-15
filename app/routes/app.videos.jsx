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

    // Fetch all live videos for this shop, filter in JS
    const { data: videos, error } = await supabase
      .from("videos")
      .select("id, title, r2_url, thumbnail_url, product_ids, show_on, views")
      .eq("shop_id", shop)
      .eq("status", "live");

    if (error) throw error;

    // Filter by show_on in JavaScript to avoid Supabase JSON type issues
    let filtered = videos || [];

    if (page === "home") {
      filtered = filtered.filter((v) => {
        if (!v.show_on) return false;
        // Handle both array and JSON string formats
        const showOn = Array.isArray(v.show_on)
          ? v.show_on
          : typeof v.show_on === "string"
          ? JSON.parse(v.show_on)
          : [];
        return showOn.includes("home");
      });
    } else if (page === "pdp" && productId) {
      filtered = filtered.filter((v) => {
        if (!v.product_ids) return false;
        const ids = Array.isArray(v.product_ids)
          ? v.product_ids
          : typeof v.product_ids === "string"
          ? JSON.parse(v.product_ids)
          : [];
        return ids.includes(productId);
      });
    }

    return new Response(JSON.stringify({ videos: filtered }), { headers });

  } catch (err) {
    return new Response(
      JSON.stringify({ videos: [], error: err.message }),
      { headers }
    );
  }
};