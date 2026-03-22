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

        // Secondary behavior: highlight matching cart products using existing logic
        const products = recipe.ingredients;
        sendToBackend(products);

        return true;
    }
});

function extractWalmartAmazonRecipe() {
    const loc = window.location.hostname;

    if (loc.includes("walmart.com") || loc.includes("walmart.ca")) {
        const items = extractTextSelectors([
            ".CartItem-title",
            ".product-title",
            "[data-automation-id='product-title']",
            "[data-automation-id='cart-item-name']",
            "[data-testid='product-title']",
            ".product-title-link",
            ".prod-name",
            "#\\30  > div.flex.flex-wrap.w-100.flex-grow-0.flex-shrink-0.ph2.pr0-xl.pl4-xl.mt0-xl > div:nth-child(3) > div.h-100.pr4-xl.pb1-xl > div > a"
        ]);

        if (items.length) {
            return {
                title: "Walmart cart items",
                sourceUrl: window.location.href,
                ingredients: items
            };
        }
    }

    if (loc.includes("amazon.com") || loc.includes("amazonfresh.com")) {
        const items = extractTextSelectors([
            ".sc-product-title",
            ".product-title",
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
    if (!items || !items.length) {
        console.log("sendToBackend: no product items found, skipping /api/match");
        return;
    }

    console.log("sendToBackend: sending products to match endpoint", items);

    fetch("http://localhost:5131/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items)
    })
    .then(res => {
        if (!res.ok) throw new Error(`match endpoint response not ok: ${res.status}`);
        return res.json();
    })
    .then(matches => {
        console.log("Matched items from backend:", matches);
        highlightMatches(matches);
    })
    .catch(err => console.error("Error sending data to backend:", err));
}

function highlightMatches(matches) {
    if (!matches || !matches.length) {
        console.log("highlightMatches: no matches to apply");
        return;
    }

    const productTitleElements = document.querySelectorAll(
        ".CartItem-title, .sc-product-title, .product-title, .prod-name, .product-title-link, [data-automation-id='cart-item-name'], .prod-ProductTitle, .CartItemName, [data-automation-id='product-title'], [data-testid='product-title'], .normal.dark-gray.mb0.mt1.lh-title.f6.f5-l.lh-copy"
    );

    console.log('highlightMatches: found title elements', productTitleElements.length);

    productTitleElements.forEach(el => {
        const productName = el.innerText.trim().toLowerCase();
        console.log('Checking product:', productName);
        if (!productName) return;

        const matchedRecipes = [];

        matches.forEach(recipe => {
            if (recipe == null || !recipe.matchingIngredients) return;

            const ingredientMatches = recipe.matchingIngredients.filter(ing => {
                const i = String(ing).toLowerCase().trim();
                if (!i) return false;

                // exact match or partial token overlap
                if (productName.includes(i) || i.includes(productName)) {
                    return true;
                }

                const productWords = productName.split(/\s+/);
                const ingredientWords = i.split(/\s+/);
                const common = productWords.filter(w => ingredientWords.includes(w));
                return common.length >= Math.min(1, ingredientWords.length);
            });

            if (ingredientMatches.length) {
                matchedRecipes.push(`${recipe.title} (${ingredientMatches.join(', ')})`);
            }
        });

        if (matchedRecipes.length) {
            console.log('Matched recipes for', productName, ':', matchedRecipes);
            let targetEl = el.closest('div');
            if (targetEl) {
                const brandEl = targetEl.querySelector('.mb1.mt2.b.f6.black.mr1.lh-copy');
                if (brandEl) {
                    targetEl = brandEl;
                }
            }

            let badge = targetEl.querySelector('.recipe-match-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'recipe-match-badge';
                badge.style.color = 'green';
                badge.style.fontWeight = 'bold';
                badge.style.marginLeft = '8px';
                targetEl.appendChild(badge);
            }

            badge.innerText = `🍳 In your recipes: ${matchedRecipes.join('; ')}`;
            console.log('Badge injected for', productName);
        }
    });
}

let lastSentItemsHash = '';

function getItemsHash(items) {
    return items.map(i => i.trim().toLowerCase()).sort().join('|');
}

function autoCheckWalmartItems() {
    const recipe = extractWalmartAmazonRecipe();
    if (!recipe || !recipe.ingredients || !recipe.ingredients.length) {
        console.log('autoCheckWalmartItems: no items found in cart');
        return;
    }

    const itemsHash = getItemsHash(recipe.ingredients);
    if (itemsHash === lastSentItemsHash) {
        console.log('autoCheckWalmartItems: items unchanged, skipping API call');
        return;
    }
    lastSentItemsHash = itemsHash;
    sendToBackend(recipe.ingredients);
}

function createMutationObserver() {
    const body = document.body;
    if (!body) return;

    const observer = new MutationObserver((mutations) => {
        let shouldCheck = false;
        for (const m of mutations) {
            if (m.addedNodes.length || m.removedNodes.length || m.type === 'childList') {
                shouldCheck = true;
                break;
            }
        }
        if (shouldCheck) {
            console.log('Mutation detected, re-checking walmart items.');
            autoCheckWalmartItems();
        }
    });

    observer.observe(body, {
        childList: true,
        subtree: true,
        attributes: false
    });
}

function initAutoMatch() {
    if (!(window.location.hostname.includes('walmart.com') || window.location.hostname.includes('walmart.ca') ||
          window.location.hostname.includes('amazon.com') || window.location.hostname.includes('amazonfresh.com'))) {
        return;
    }

    autoCheckWalmartItems();
    createMutationObserver();

    // Also periodically refresh in case MutationObserver misses any dynamic updates.
    setInterval(autoCheckWalmartItems, 5000);
}

initAutoMatch();