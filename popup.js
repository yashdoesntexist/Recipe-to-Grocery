document.addEventListener("DOMContentLoaded", () => {

    const addButton = document.getElementById("add-recipe-btn");

    addButton.addEventListener("click", async () => {

        try {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true
            });

            if (!tab) {
                console.error("No active tab found");
                return;
            }

            console.log("Active page:", tab.url);

            chrome.tabs.sendMessage(tab.id, {
                action: "extractRecipe"
            });

        } catch (error) {
            console.error("Popup error:", error);
        }

    });

});