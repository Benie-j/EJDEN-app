export {};

const quickActionsButton =
    document.querySelector<HTMLButtonElement>(".mobile-nav-add");

const quickActionsOverlay =
    document.querySelector<HTMLDivElement>("#quickActionsOverlay");

const quickActionsPanel =
    document.querySelector<HTMLDivElement>("#quickActionsPanel");

const quickActionsClose =
    document.querySelector<HTMLButtonElement>("#quickActionsClose");

const quickActionNewSale =
    document.querySelector<HTMLButtonElement>("#quickActionNewSale");

const dashboardNewSale =
    document.querySelector<HTMLButtonElement>("#dashboardNewSale");

const quickActionNewProduct =
    document.querySelector<HTMLButtonElement>("#quickActionNewProduct");


function openQuickActions(): void {
    if (!quickActionsOverlay) return;

    quickActionsOverlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
}

function closeQuickActions(): void {
    if (!quickActionsOverlay) return;

    quickActionsOverlay.classList.remove("is-open");
    document.body.style.overflow = "";
}

function goToNewSale(): void {
    // dashboard.html et ventes.html sont dans le même dossier.
    window.location.href = "ventes.html";
}


quickActionsButton?.addEventListener("click", openQuickActions);
quickActionsClose?.addEventListener("click", closeQuickActions);

quickActionsOverlay?.addEventListener("click", (event: MouseEvent) => {
    if (event.target === quickActionsOverlay) {
        closeQuickActions();
    }
});

quickActionsPanel?.addEventListener("click", (event: MouseEvent) => {
    event.stopPropagation();
});

document.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape") {
        closeQuickActions();
    }
});

function goToNewProduct(): void {
    window.location.href = "ajouter-produit.html";
}

quickActionNewSale?.addEventListener("click", goToNewSale);
quickActionNewProduct?.addEventListener("click", goToNewProduct);
dashboardNewSale?.addEventListener("click", goToNewSale);

// Les pages Clients, Dépenses et Caisse s'ouvrent avec le formulaire prêt.
const quickActionTargets: Record<string, string> = {
    quickActionNewClient: "clients.html?new=1",
    quickActionNewExpense: "depenses.html?new=1",
    quickActionCashIn: "caisse.html?new=in"
};

for (const [id, target] of Object.entries(quickActionTargets)) {
    document
        .querySelector<HTMLButtonElement>(`#${id}`)
        ?.addEventListener("click", () => {
            window.location.href = target;
        });
}
