
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === "extractRecipe") {

        console.log("Starting recipe extraction...");

        const recipe = extractRecipe();

        if (!recipe) {
            console.log("No recipe found on this page.");
            return;
        }

        console.log("Recipe extracted:", recipe);

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

    const ingredients = data.recipeIngredient || [];

    let instructions = [];

    if (Array.isArray(data.recipeInstructions)) {

        instructions = data.recipeInstructions.map(step => {

            if (typeof step === "string") {
                return step;
            }

            if (step.text) {
                return step.text;
            }

            return "";

        });

    }

    return {
        title,
        ingredients,
        instructions
    };

}