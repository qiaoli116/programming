// Fetches data from the JSON files under data/, which stand in for real API
// endpoints. An artificial minimum wait is layered on top of the real
// network call so the loading state is visible even on a fast local server.

const SIMULATED_DELAY_MS = 3000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchWithMinDelay(url) {
  const request = fetch(url).then((response) => response.json());
  return Promise.all([request, delay(SIMULATED_DELAY_MS)]).then(([data]) => data);
}

function fetchPromotions() {
  return fetchWithMinDelay("data/promotions.json");
}

function fetchProducts() {
  return fetchWithMinDelay("data/products.json");
}
