chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extractRecipe") {
        console.log("Recipe extraction started...");
        const recipe = extractWalmartAmazonRecipe();
        if (!recipe) {
            console.log("No recipe or items found on this page.");
            sendResponse({ recipe: null });
            return true;
        }
        console.log("Recipe extracted:", recipe);
        sendResponse({ recipe });
        sendToBackend(recipe.ingredients);
        return true;
    }
});

function extractWalmartAmazonRecipe() {
    const loc = window.location.hostname;

    if (loc.includes("walmart.com") || loc.includes("walmart.ca")) {
        const items = extractTextSelectors([
            "[data-automation-id='product-title']",
            "[data-automation-id='cart-item-name']",
            ".CartItem-title",
            ".prod-name",
        ]);
        if (items.length) {
            return {
                title: "Walmart items",
                sourceUrl: window.location.href,
                ingredients: items
            };
        }
    }

    if (loc.includes("amazon.com") || loc.includes("amazonfresh.com")) {
        const items = extractTextSelectors([
            ".sc-product-title",
            "[data-testid='cart-item-label']",
            ".a-list-item"
        ]);
        if (items.length) {
            return {
                title: "Amazon Fresh cart items",
                sourceUrl: window.location.href,
                ingredients: items
            };
        }
    }

    return null;
}

function extractTextSelectors(selectors) {
    const texts = new Set();
    selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            const rawText = el.textContent.trim();
            const normalized = normalizeIngredientText(rawText);
            if (normalized) texts.add(normalized);
        });
    });
    return Array.from(texts);
}

function normalizeIngredientText(text) {
    if (!text) return "";
    let normalized = String(text).toLowerCase().trim();
    normalized = normalized.replace(/\d+(\.\d+)?\s*(g|gram|grams|kg|kilogram|kilograms|ml|l|liter|liters|cup|cups|tablespoon|tbsp|teaspoon|tsp|oz|ounce|ounces|lb|pound|pounds|pack|package|pieces|slice|slices)/gi, "");
    normalized = normalized.replace(/\d+[\/\d]*|\/\d+/g, "");
    normalized = normalized.replace(/\b(of|and|with|fresh|chopped|diced|minced)\b/gi, "");
    normalized = normalized.replace(/[^a-z0-9 ]/gi, " ");
    normalized = normalized.replace(/\s+/g, " ").trim();
    return normalized;
}

function sendToBackend(items) {
    if (!items || !items.length) return;
    console.log("sendToBackend: sending products", items);
    fetch("http://localhost:5131/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items)
    })
    .then(res => {
        if (!res.ok) throw new Error(`match endpoint not ok: ${res.status}`);
        return res.json();
    })
    .then(matches => {
        console.log("Matched items:", matches);
        highlightMatches(matches);
    })
    .catch(err => console.error("Error sending to backend:", err));
}

function highlightMatches(matches) {
    if (!matches || !matches.length) return;

    // Find all product title elements on the search/browse page
    const productTitleElements = document.querySelectorAll(
        "[data-automation-id='product-title']"
    );

    console.log('highlightMatches: found', productTitleElements.length, 'product tiles');

    productTitleElements.forEach(el => {
        const productName = el.textContent.trim().toLowerCase();
        if (!productName) return;

        const matchedRecipes = [];

        matches.forEach(recipe => {
            if (!recipe || !recipe.matchingIngredients) return;

            const ingredientMatches = recipe.matchingIngredients.filter(ing => {
                const i = String(ing).toLowerCase().trim();
                if (!i || i.length < 3) return false;

                if (productName.includes(i) || i.includes(productName)) return true;

                const productWords = productName.split(/\s+/).filter(w => w.length > 2);
                const ingredientWords = i.split(/\s+/).filter(w => w.length > 2);
                const common = productWords.filter(w => ingredientWords.includes(w));
                return common.length >= Math.min(2, ingredientWords.length);
            });

            if (ingredientMatches.length) {
                matchedRecipes.push(`${recipe.title} (${ingredientMatches.join(', ')})`);
            }
        });

        if (matchedRecipes.length) {
            console.log('Badge for:', productName, matchedRecipes);

            // Walk up to the product card container
            const card = el.closest('[role="group"][data-item-id]') || el.closest('[data-testid="list-view"]') || el.parentElement;

            let badge = card.querySelector('.recipe-match-badge');
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'recipe-match-badge';
                badge.style.cssText = 'color: green; font-weight: bold; font-size: 12px; margin-top: 4px; padding: 2px 4px; background: #f0fff0; border: 1px solid green; border-radius: 4px;';
                // Insert after the title element
                el.closest('span')?.after(badge) || el.after(badge);
            }
            badge.innerText = `🍳 ${matchedRecipes.join('; ')}`;
        }
    });
}

// ── Auto-match on page load and DOM changes ──────────────────────────────────

let lastSentItemsHash = '';

function getItemsHash(items) {
    return items.map(i => i.trim().toLowerCase()).sort().join('|');
}

function autoCheckWalmartItems() {
    const loc = window.location.hostname;
    if (!loc.includes('walmart.com') && !loc.includes('walmart.ca') &&
        !loc.includes('amazon.com') && !loc.includes('amazonfresh.com')) return;

    const recipe = extractWalmartAmazonRecipe();
    if (!recipe || !recipe.ingredients || !recipe.ingredients.length) return;

    const itemsHash = getItemsHash(recipe.ingredients);
    if (itemsHash === lastSentItemsHash) return;
    lastSentItemsHash = itemsHash;
    sendToBackend(recipe.ingredients);
}

function createMutationObserver() {
    const body = document.body;
    if (!body) return;

    const observer = new MutationObserver((mutations) => {
        const shouldCheck = mutations.some(m =>
            m.addedNodes.length || m.removedNodes.length || m.type === 'childList'
        );
        if (shouldCheck) autoCheckWalmartItems();
    });

    observer.observe(body, { childList: true, subtree: true, attributes: false });
}

autoCheckWalmartItems();
createMutationObserver();
setInterval(autoCheckWalmartItems, 5000);