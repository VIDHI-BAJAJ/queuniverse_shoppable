import { supabase } from "../supabase.server";

// This route is PUBLIC — no Shopify auth needed
// It serves video data to the storefront carousel block

export const loader = async ({ request }) => {
  // Handle CORS preflight
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

  try {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const page = url.searchParams.get("page") || "home";
    const productId = url.searchParams.get("product_id");

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    };

    if (!shop) {
      return new Response(JSON.stringify({ videos: [] }), { headers });
    }

    let query = supabase
      .from("videos")
      .select("id, title, r2_url, thumbnail_url, product_ids, show_on, views")
      .eq("shop_id", shop)
      .eq("status", "live");

    if (page === "home") {
      query = query.contains("show_on", JSON.stringify(["home"]));
    } else if (page === "pdp" && productId) {
      query = query.contains("product_ids", [productId]);
    }

    const { data: videos, error } = await query;

    if (error) throw error;

    return new Response(JSON.stringify({ videos: videos || [] }), { headers });

  } catch (err) {
    return new Response(
      JSON.stringify({ videos: [], error: err.message }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
};