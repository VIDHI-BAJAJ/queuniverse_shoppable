import { useLoaderData, Form } from "react-router-dom";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { supabase } from "../supabase.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const { data: settings } = await supabase
    .from("settings")
    .select("*")
    .eq("shop_id", shop)
    .single();

  return json({ settings: settings || { autoplay: false, layout: "carousel", accent_color: "#008060" } });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const settings = {
    shop_id: shop,
    autoplay: formData.get("autoplay") === "on",
    layout: formData.get("layout"),
    accent_color: formData.get("accent_color"),
  };

  await supabase.from("settings").upsert(settings, { onConflict: "shop_id" });

  return json({ ok: true });
};

export default function Widgets() {
  const { settings } = useLoaderData();

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "500px" }}>
      <h1>Widget Settings</h1>
      <Form method="post" style={{ marginTop: "20px" }}>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "6px" }}>Layout</label>
          <select
            name="layout"
            defaultValue={settings.layout}
            style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "16px", width: "100%" }}
          >
            <option value="carousel">Carousel</option>
            <option value="grid">Grid</option>
          </select>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "6px" }}>Accent Color</label>
          <input
            name="accent_color"
            type="color"
            defaultValue={settings.accent_color}
            style={{ padding: "4px", border: "1px solid #ddd", borderRadius: "6px", height: "40px", width: "80px" }}
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", fontWeight: "bold" }}>
            <input
              type="checkbox"
              name="autoplay"
              defaultChecked={settings.autoplay}
            />
            Autoplay videos
          </label>
        </div>

        <button
          type="submit"
          style={{ padding: "12px 24px", background: "#008060", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "16px" }}
        >
          Save Settings
        </button>
      </Form>

      <div style={{ marginTop: "30px", background: "#f4f6f8", padding: "16px", borderRadius: "8px" }}>
        <p style={{ fontWeight: "bold", marginBottom: "8px" }}>Your widget API URL:</p>
        <code style={{ fontSize: "12px", wordBreak: "break-all" }}>
          https://queuniverse-shoppable.vercel.app/api/videos?shop=YOUR-SHOP.myshopify.com&page=home
        </code>
      </div>
    </div>
  );
}