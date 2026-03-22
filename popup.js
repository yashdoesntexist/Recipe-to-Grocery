document.addEventListener("DOMContentLoaded", () => {
    const addButton = document.getElementById("add-recipe-btn");
    addButton.addEventListener("click", addRecipeFromPage);

    loadRecipes();
});

async function addRecipeFromPage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            alert("No active tab found.");
            return;
        }

        chrome.tabs.sendMessage(tab.id, { action: "extractRecipe" }, async (response) => {
            if (chrome.runtime.lastError && !response) {
                console.warn("Runtime error:", chrome.runtime.lastError.message);

                // inject content scripts and retry once
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ["recipe-parser.js", "grocery-checker.js"]
                    });

                    chrome.tabs.sendMessage(tab.id, { action: "extractRecipe" }, async (retryResponse) => {
                        if (chrome.runtime.lastError) {
                            console.warn("Retry runtime error:", chrome.runtime.lastError.message);
                            alert("Could not run on this page. Try refreshing the page and opening popup again.");
                            return;
                        }

                        if (retryResponse && retryResponse.recipe) {
                            await sendToBackend(retryResponse.recipe);
                            await loadRecipes();
                        } else {
                            alert("Could not find a recipe/item list on this page after injection.");
                        }
                    });
                } catch (injectError) {
                    console.error("Content script injection failed:", injectError);
                    alert("Could not inject the content script. Please reload the page and try again.");
                }

                return;
            }

            if (response && response.recipe) {
                await sendToBackend(response.recipe);
                await loadRecipes();
            } else {
                alert("Could not find a recipe/item list on this page.");
            }
        });
    } catch (error) {
        console.error("Popup error:", error);
        alert("Error: " + error.message);
    }
}

async function loadRecipes() {
    const list = document.getElementById("recipe-list");
    list.textContent = "Loading...";

    try {
        const response = await fetch("http://localhost:5131/api/recipes");
        if (!response.ok) throw new Error("Could not fetch recipes");

        const recipes = await response.json();
        if (!recipes.length) {
            list.textContent = "No saved recipes yet.";
            return;
        }

        list.innerHTML = "";
        recipes.forEach(renderRecipeItem);
    } catch (error) {
        list.textContent = "Failed to load recipes.";
        console.error(error);
    }
}

function renderRecipeItem(recipe) {
    const list = document.getElementById("recipe-list");

    const container = document.createElement("div");
    container.classList.add("recipe-item");

    const title = document.createElement("h4");
    title.textContent = recipe.title;

    const source = document.createElement("p");
    source.textContent = "Source: " + recipe.sourceUrl;

    const ingredients = document.createElement("ul");
    recipe.ingredients.forEach(i => {
        const li = document.createElement("li");
        li.textContent = i.name;
        ingredients.appendChild(li);
    });

    const controls = document.createElement("div");
    controls.classList.add("recipe-controls");

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteRecipe(recipe.id));

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openEditForm(recipe));

    controls.appendChild(editBtn);
    controls.appendChild(deleteBtn);

    container.appendChild(title);
    container.appendChild(source);
    container.appendChild(ingredients);
    container.appendChild(controls);

    list.appendChild(container);
}

function openEditForm(recipe) {
    const form = document.createElement("div");
    form.classList.add("edit-form");

    const titleInput = document.createElement("input");
    titleInput.value = recipe.title;

    const sourceInput = document.createElement("input");
    sourceInput.value = recipe.sourceUrl;

    const ingredientsInput = document.createElement("textarea");
    ingredientsInput.value = recipe.ingredients.map(i => i.name).join("\n");

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", async () => {
        const updatedRecipe = {
            title: titleInput.value,
            sourceUrl: sourceInput.value,
            ingredients: ingredientsInput.value.split(/\r?\n/).map(x => x.trim()).filter(x => x)
        };

        await updateRecipe(recipe.id, updatedRecipe);
        document.body.removeChild(form);
        await loadRecipes();
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => document.body.removeChild(form));

    form.appendChild(createLabeledNode("Title", titleInput));
    form.appendChild(createLabeledNode("Source URL", sourceInput));
    form.appendChild(createLabeledNode("Ingredients (one per line)", ingredientsInput));
    form.appendChild(saveBtn);
    form.appendChild(cancelBtn);

    document.body.appendChild(form);
}

function createLabeledNode(labelText, element) {
    const wrapper = document.createElement("div");
    const label = document.createElement("label");
    label.textContent = labelText;
    wrapper.appendChild(label);
    wrapper.appendChild(element);
    return wrapper;
}

async function updateRecipe(id, dto) {
    try {
        const response = await fetch(`http://localhost:5131/api/recipes/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dto)
        });

        if (!response.ok) throw new Error("Failed to update recipe");
        alert("Recipe updated");
    } catch (error) {
        console.error(error);
        alert(error.message);
    }
}

async function deleteRecipe(id) {
    if (!confirm("Delete this recipe?")) return;

    try {
        const response = await fetch(`http://localhost:5131/api/recipes/${id}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Failed to delete recipe");
        await loadRecipes();
    } catch (error) {
        console.error(error);
        alert(error.message);
    }
}

async function sendToBackend(recipe) {
    try {
        const res = await fetch("http://localhost:5131/api/recipes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(recipe)
        });

        if (!res.ok) throw new Error("Failed to save recipe");
        await res.json();
        alert("Recipe saved successfully!");
    } catch (error) {
        console.error("Error saving recipe to backend:", error);
        alert("Error saving recipe to backend: " + error.message);
    }
}