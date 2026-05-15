import { supabase } from "../supabase.server";

// PUBLIC route — no Shopify auth — serves storefront carousel
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
    "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
  };

  try {
    const url = new URL(request.url);
    const shop      = url.searchParams.get("shop");
    const productId = url.searchParams.get("product_id");
    const context   = url.searchParams.get("context") || "home"; // "home" | "pdp"

    if (!shop) {
      return new Response(JSON.stringify({ videos: [] }), { headers });
    }

    const { data: videos, error } = await supabase
      .from("videos")
      .select("id, title, r2_url, thumbnail_url, product_ids, show_on, views")
      .eq("shop_id", shop)
      .eq("status", "live")
      .order("created_at", { ascending: false });

    if (error) throw error;

    let filtered = videos || [];

    if (productId) {
      // PDP: show only videos tagged with this product
      filtered = filtered.filter((v) => {
        const ids = Array.isArray(v.product_ids) ? v.product_ids : [];
        return ids.includes(productId);
      });
    } else {
      // Homepage: ONLY show videos that have "home" in show_on array
      filtered = filtered.filter((v) => {
        const showOn = Array.isArray(v.show_on) ? v.show_on : [];
        return showOn.includes("home");
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