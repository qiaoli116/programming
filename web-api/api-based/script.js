function formatPrice(price) {
  return `$${price.toFixed(2)}`;
}

function showSpinner(statusEl) {
  statusEl.innerHTML = `<span class="spinner"></span> Loading...`;
}

function clearStatus(statusEl) {
  statusEl.innerHTML = "";
}

function renderPromotions(promotionArray) {
  const list = document.getElementById("promo-list");
  list.innerHTML = "";

  promotionArray.forEach((promo) => {
    const banner = document.createElement("div");
    banner.className = "promo-banner";
    banner.style.backgroundColor = promo.backgroundColor;

    banner.innerHTML = `
      <h2 class="promo-title">${promo.title}</h2>
      <p class="promo-text">${promo.text}</p>
      <a class="promo-button" href="${promo.buttonLink}">${promo.buttonText}</a>
    `;

    list.appendChild(banner);
  });
}

function renderProducts(productArray) {
  const list = document.getElementById("product-list");
  list.innerHTML = "";

  productArray.forEach((product) => {
    const card = document.createElement("div");
    card.className = "product-card";

    card.innerHTML = `
      <div class="product-id">#${product.id}</div>
      <h2 class="product-title">${product.title}</h2>
      <p class="product-description">${product.description}</p>
      <div class="product-price">${formatPrice(product.price)}</div>
    `;

    list.appendChild(card);
  });
}

function loadSection(statusId, fetchFn, renderFn) {
  const statusEl = document.getElementById(statusId);
  showSpinner(statusEl);

  return fetchFn().then((data) => {
    clearStatus(statusEl);
    renderFn(data);
  });
}

loadSection("promo-status", fetchPromotions, renderPromotions).then(() => {
  return loadSection("product-status", fetchProducts, renderProducts);
});
