chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === "extractRecipe") {

        console.log("Starting recipe extraction...");

        const recipe = extractRecipe();

        if (!recipe) {
            console.log("No recipe found on this page.");
            sendResponse({ recipe: null });
            return true;
        }

        console.log("Recipe extracted:", recipe);
        sendResponse({ recipe });
        return true;

    }

});


function extractRecipe() {

    const scripts = document.querySelectorAll('script[type="application/ld+json"]');

    for (const script of scripts) {

        try {

            const data = JSON.parse(script.textContent);

            if (Array.isArray(data)) {
                for (const item of data) {
                    if (item["@type"] === "Recipe") {
                        return parseRecipe(item);
                    }
                }
            }

            if (data["@type"] === "Recipe") {
                return parseRecipe(data);
            }

        } catch (err) {
            continue;
        }
    }

    return null;
}


function parseRecipe(data) {

    const title = data.name || document.title;

    const rawIngredients = data.recipeIngredient || [];
    const ingredients = rawIngredients
        .map(i => normalizeIngredientText(i))
        .filter(i => i);

    const sourceUrl = window.location.href;

    return {
        title,
        ingredients,
        sourceUrl
    };
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