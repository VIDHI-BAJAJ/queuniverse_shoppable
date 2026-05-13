(function () {
  const shop = window.Shopify?.shop;
  if (!shop) return;

  const API = "https://queuniverse-shoppable.vercel.app/api/videos";
  const isHome = window.location.pathname === "/";
  const isPDP = window.location.pathname.includes("/products/");

  if (!isHome && !isPDP) return;

  const page = isHome ? "home" : "pdp";
  const productId = isPDP
    ? document.querySelector("[data-product-id]")?.dataset.productId
    : null;

  let url = `${API}?shop=${shop}&page=${page}`;
  if (productId) url += `&product_id=${productId}`;

  fetch(url)
    .then((r) => r.json())
    .then(({ videos }) => {
      if (!videos || videos.length === 0) return;

      const container = document.createElement("div");
      container.id = "nq-shoppable-widget";
      container.style.cssText =
        "width:100%;overflow-x:auto;display:flex;gap:12px;padding:16px 0;";

      videos.forEach((video) => {
        const wrap = document.createElement("div");
        wrap.style.cssText =
          "min-width:280px;border-radius:12px;overflow:hidden;background:#000;position:relative;";

        const vid = document.createElement("video");
        vid.src = video.r2_url;
        vid.controls = true;
        vid.muted = true;
        vid.style.cssText = "width:100%;height:400px;object-fit:cover;";

        wrap.appendChild(vid);
        container.appendChild(wrap);
      });

      if (isHome) {
        const target =
          document.querySelector(".main-content") ||
          document.querySelector("main") ||
          document.body;
        target.prepend(container);
      }

      if (isPDP) {
        const target =
          document.querySelector(".product__description") ||
          document.querySelector(".product-single__description") ||
          document.querySelector("main");
        if (target) target.after(container);
      }
    });
})();