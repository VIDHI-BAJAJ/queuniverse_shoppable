import { useLoaderData, Form, Link } from "@remix-run/react";
import { json, redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { supabase } from "../supabase.server";

export const loader = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const { data: video } = await supabase
    .from("videos")
    .select("*")
    .eq("id", params.id)
    .eq("shop_id", shop)
    .single();

  if (!video) throw new Response("Not Found", { status: 404 });

  const response = await admin.graphql(`
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            featuredImage { url }
          }
        }
      }
    }
  `);
  const data = await response.json();
  const products = data.data.products.edges.map(e => e.node);

  return json({ video, products });
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const title = formData.get("title");
  const status = formData.get("status");
  const productIds = formData.getAll("product_ids");
  const showOn = formData.getAll("show_on");

  await supabase
    .from("videos")
    .update({ title, status, product_ids: productIds, show_on: showOn })
    .eq("id", params.id)
    .eq("shop_id", shop);

  return redirect("/app/videos");
};

export default function EditVideo() {
  const { video, products } = useLoaderData();

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif", maxWidth: "700px" }}>
      <Link to="/app/videos" style={{ color: "#008060" }}>← Back to Videos</Link>
      <h1 style={{ marginTop: "16px" }}>Edit Video</h1>

      {video.r2_url && (
        <video src={video.r2_url} controls
          style={{ width: "100%", borderRadius: "8px", marginBottom: "20px", maxHeight: "300px" }}
        />
      )}

      <Form method="post">
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "6px" }}>Title</label>
          <input name="title" defaultValue={video.title}
            style={{ width: "100%", padding: "10px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "16px" }}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "6px" }}>Status</label>
          <select name="status" defaultValue={video.status}
            style={{ padding: "10px", border: "1px solid #ddd", borderRadius: "6px", fontSize: "16px" }}>
            <option value="draft">Draft</option>
            <option value="live">Live</option>
          </select>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "6px" }}>Show On</label>
          <label style={{ marginRight: "16px" }}>
            <input type="checkbox" name="show_on" value="home"
              defaultChecked={video.show_on?.includes("home")} /> Homepage
          </label>
          <label>
            <input type="checkbox" name="show_on" value="pdp"
              defaultChecked={video.show_on?.includes("pdp")} /> Product Pages
          </label>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: "10px" }}>Tag Products</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" }}>
            {products.map((product) => (
              <label key={product.id}
                style={{ display: "flex", alignItems: "center", gap: "8px", background: "#f4f6f8", padding: "8px", borderRadius: "6px" }}>
                <input type="checkbox" name="product_ids" value={product.id}
                  defaultChecked={video.product_ids?.includes(product.id)} />
                {product.featuredImage && (
                  <img src={product.featuredImage.url} alt={product.title}
                    style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "4px" }} />
                )}
                <span style={{ fontSize: "13px" }}>{product.title}</span>
              </label>
            ))}
          </div>
        </div>

        <button type="submit"
          style={{ padding: "12px 24px", background: "#008060", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "16px" }}>
          Save Changes
        </button>
      </Form>
    </div>
  );
}