const quickActionsButton = document.querySelector(".mobile-nav-add");
const quickActionsOverlay = document.querySelector("#quickActionsOverlay");
const quickActionsPanel = document.querySelector("#quickActionsPanel");
const quickActionsClose = document.querySelector("#quickActionsClose");
const quickActionNewSale = document.querySelector("#quickActionNewSale");
const dashboardNewSale = document.querySelector("#dashboardNewSale");
const quickActionNewProduct = document.querySelector("#quickActionNewProduct");
function openQuickActions() {
    if (!quickActionsOverlay)
        return;
    quickActionsOverlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
}
function closeQuickActions() {
    if (!quickActionsOverlay)
        return;
    quickActionsOverlay.classList.remove("is-open");
    document.body.style.overflow = "";
}
function goToNewSale() {
    // dashboard.html et ventes.html sont dans le même dossier.
    window.location.href = "ventes.html";
}
quickActionsButton?.addEventListener("click", openQuickActions);
quickActionsClose?.addEventListener("click", closeQuickActions);
quickActionsOverlay?.addEventListener("click", (event) => {
    if (event.target === quickActionsOverlay) {
        closeQuickActions();
    }
});
quickActionsPanel?.addEventListener("click", (event) => {
    event.stopPropagation();
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeQuickActions();
    }
});
function goToNewProduct() {
    window.location.href = "ajouter-produit.html";
}
quickActionNewSale?.addEventListener("click", goToNewSale);
quickActionNewProduct?.addEventListener("click", goToNewProduct);
dashboardNewSale?.addEventListener("click", goToNewSale);
// Les pages Clients, Dépenses et Caisse s'ouvrent avec le formulaire prêt.
const quickActionTargets = {
    quickActionNewClient: "clients.html?new=1",
    quickActionNewExpense: "depenses.html?new=1",
    quickActionCashIn: "caisse.html?new=in"
};
for (const [id, target] of Object.entries(quickActionTargets)) {
    document
        .querySelector(`#${id}`)
        ?.addEventListener("click", () => {
        window.location.href = target;
    });
}
export {};
//# sourceMappingURL=quick-actions.js.map