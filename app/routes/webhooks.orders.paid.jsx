import { authenticate } from "../shopify.server";
import { supabase } from "../supabase.server";

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);

  try {
    const order       = payload;
    const orderValue  = parseFloat(order.total_price || 0);
    const orderNumber = order.order_number;

    /* Find the most recent click event for this shop in the last 30 minutes
       from the videos table — attribute order to that video */
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    /* Get all videos for this shop that had a recent click */
    const { data: videos } = await supabase
      .from("videos")
      .select("id, buy_now_clicks, orders, revenue, last_click_at")
      .eq("shop_id", shop)
      .gte("last_click_at", thirtyMinAgo)
      .order("last_click_at", { ascending: false })
      .limit(1);

    if (videos && videos.length > 0) {
      const video = videos[0];

      // Increment orders and revenue on the video
      await supabase
        .from("videos")
        .update({
          orders:  (video.orders  || 0) + 1,
          revenue: (video.revenue || 0) + orderValue,
        })
        .eq("id", video.id)
        .eq("shop_id", shop);

      // Also log to video_events
      await supabase.from("video_events").insert({
        shop_id:    shop,
        video_id:   video.id,
        event_type: "order",
        value:      orderValue,
      }).catch(() => {});

      console.log(`Order #${orderNumber} attributed to video ${video.id} for shop ${shop}`);
    } else {
      console.log(`Order #${orderNumber} for shop ${shop} — no recent video click to attribute`);
    }
  } catch (e) {
    console.error("Order webhook error:", e.message);
  }

  return new Response(null, { status: 200 });
};