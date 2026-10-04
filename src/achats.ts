// src/achats.ts
// Page Achats : enregistrer une livraison fournisseur (le stock augmente
// automatiquement) et consulter l'historique des achats.
// Les textes venant des données passent par textContent (jamais innerHTML).

import {
    type Product,
    type Purchase,
    LIMITS,
    MODULE_LIMITS,
    cancelPurchase,
    cleanAmount,
    getCashSummary,
    getProducts,
    getPurchases,
    getPurchaseRemainingMap,
    getSuppliers,
    recordPurchase
} from "./storage.js";
import {
    createDeleteControl,
    createToast,
    dayLabel,
    el,
    money,
    timeLabel
} from "./ui.js";

const form = document.querySelector<HTMLFormElement>("#purchaseForm");
const supplierSelect = document.querySelector<HTMLSelectElement>("#purchaseSupplier");
const linesElement = document.querySelector<HTMLElement>("#purchaseLines");
const addLineButton = document.querySelector<HTMLButtonElement>("#addLineButton");
const updatePrices = document.querySelector<HTMLInputElement>("#updatePrices");
const totalElement = document.querySelector<HTMLElement>("#purchaseTotal");
const paidInput = document.querySelector<HTMLInputElement>("#purchasePaid");
const dueElement = document.querySelector<HTMLElement>("#purchaseDue");
const noteInput = document.querySelector<HTMLInputElement>("#purchaseNote");
const submitButton = document.querySelector<HTMLButtonElement>("#purchaseSubmit");
const blockedElement = document.querySelector<HTMLElement>("#purchaseBlocked");
const listElement = document.querySelector<HTMLElement>("#purchasesList");
const emptyElement = document.querySelector<HTMLElement>("#purchasesEmpty");

if (!linesElement || !listElement) {
    throw new Error("EJDEN : éléments de la page Achats introuvables.");
}

const lines: HTMLElement = linesElement;
const list: HTMLElement = listElement;
const toast = createToast();

let openId: string | null = null;

// Tant que l'utilisateur n'a pas touché au champ « payé », il suit le total.
let paidTouched = false;


/* =========================================================
   Lignes de produits
   ========================================================= */

interface LineControls {
    root: HTMLElement;
    product: HTMLSelectElement;
    quantity: HTMLInputElement;
    unitCost: HTMLInputElement;
    lineTotal: HTMLElement;
}

const lineControls: LineControls[] = [];

function readNumber(input: HTMLInputElement): number {
    const raw = input.value.trim();

    return raw === "" ? Number.NaN : Number(raw);
}

function lineAmount(controls: LineControls): number {
    const quantity = readNumber(controls.quantity);
    const unitCost = readNumber(controls.unitCost);

    return Number.isFinite(quantity) && Number.isFinite(unitCost) && quantity > 0 && unitCost > 0
        ? Math.round(quantity) * Math.round(unitCost)
        : 0;
}

function formTotal(): number {
    return lineControls.reduce((sum, controls) => sum + lineAmount(controls), 0);
}

function refreshTotals(): void {
    const total = formTotal();

    for (const controls of lineControls) {
        controls.lineTotal.textContent = money(lineAmount(controls));
    }

    if (totalElement) {
        totalElement.textContent = money(total);
    }

    if (paidInput && !paidTouched) {
        paidInput.value = total > 0 ? String(total) : "";
    }

    const paid = paidInput && paidInput.value.trim() !== "" ? Number(paidInput.value) : 0;

    if (dueElement) {
        dueElement.textContent =
            Number.isFinite(paid) && paid >= 0 && paid <= total
                ? total - paid > 0
                    ? `Reste dû au fournisseur : ${money(total - paid)}.`
                    : "Achat payé en totalité."
                : "Le montant payé doit être compris entre 0 et le total.";
    }
}

function productOptions(products: Product[]): HTMLOptionElement[] {
    const placeholder = el("option", undefined, "Choisir un produit…");

    placeholder.value = "";

    return [
        placeholder,
        ...products
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, "fr"))
            .map((product) => {
                const option = el("option", undefined, product.name);

                option.value = product.id;

                return option;
            })
    ];
}

function addLine(): void {
    const products = getProducts();
    const index = lineControls.length;

    const root = el("div", "line-card");

    const productField = el("div", "field");
    const productLabel = el("label", undefined, "Produit");
    const product = el("select");
    const productId = `line-product-${Date.now()}-${index}`;

    productLabel.htmlFor = productId;
    product.id = productId;
    product.append(...productOptions(products));
    productField.append(productLabel, product);

    const grid = el("div", "line-grid");

    const quantityField = el("div", "field");
    const quantityLabel = el("label", undefined, "Quantité");
    const quantity = el("input");
    const quantityId = `${productId}-qty`;

    quantityLabel.htmlFor = quantityId;
    quantity.id = quantityId;
    quantity.type = "number";
    quantity.inputMode = "numeric";
    quantity.min = "1";
    quantity.step = "1";
    quantity.placeholder = "Ex. : 24";
    quantityField.append(quantityLabel, quantity);

    const costField = el("div", "field");
    const costLabel = el("label", undefined, "Prix d'achat unitaire");
    const unitCost = el("input");
    const costId = `${productId}-cost`;

    costLabel.htmlFor = costId;
    unitCost.id = costId;
    unitCost.type = "number";
    unitCost.inputMode = "numeric";
    unitCost.min = "1";
    unitCost.step = "1";
    unitCost.placeholder = "FCFA";
    costField.append(costLabel, unitCost);

    grid.append(quantityField, costField);

    const footer = el("div", "line-footer");
    const lineTotal = el("strong", undefined, money(0));
    const remove = el("button", "line-remove", "Retirer");

    remove.type = "button";
    footer.append(el("span", undefined, "Total de la ligne : "), lineTotal, remove);

    root.append(productField, grid, footer);

    const controls: LineControls = { root, product, quantity, unitCost, lineTotal };

    // Choisir un produit propose son dernier prix d'achat.
    product.addEventListener("change", () => {
        const chosen = getProducts().find((item) => item.id === product.value);

        if (chosen && unitCost.value.trim() === "") {
            unitCost.value = String(chosen.purchasePrice);
        }

        product.classList.remove("is-invalid");
        refreshTotals();
    });

    quantity.addEventListener("input", () => {
        quantity.classList.remove("is-invalid");
        refreshTotals();
    });

    unitCost.addEventListener("input", () => {
        unitCost.classList.remove("is-invalid");
        refreshTotals();
    });

    remove.addEventListener("click", () => {
        if (lineControls.length <= 1) {
            toast("Un achat doit contenir au moins un produit.");
            return;
        }

        lineControls.splice(lineControls.indexOf(controls), 1);
        root.remove();
        refreshTotals();
    });

    lineControls.push(controls);
    lines.append(root);
    refreshTotals();
}

addLineButton?.addEventListener("click", () => {
    if (lineControls.length >= 50) {
        toast("Maximum 50 produits par achat.");
        return;
    }

    addLine();
});

paidInput?.addEventListener("input", () => {
    paidTouched = true;
    paidInput.classList.remove("is-invalid");
    refreshTotals();
});


/* =========================================================
   Formulaire
   ========================================================= */

function resetLines(): void {
    lineControls.length = 0;
    lines.replaceChildren();
    paidTouched = false;
    addLine();
}

function refreshSuppliers(preferred?: string): void {
    if (!supplierSelect) {
        return;
    }

    const suppliers = getSuppliers().sort((a, b) => a.name.localeCompare(b.name, "fr"));
    const products = getProducts();

    const blocked =
        suppliers.length === 0
            ? "Ajoutez d'abord un fournisseur dans la page Fournisseurs."
            : products.length === 0
              ? "Ajoutez d'abord des produits : un achat augmente leur stock."
              : "";

    if (blockedElement) {
        blockedElement.hidden = blocked === "";
        blockedElement.textContent = blocked;
    }

    if (form) {
        form.hidden = blocked !== "";
    }

    const placeholder = el("option", undefined, "Choisir un fournisseur…");

    placeholder.value = "";

    supplierSelect.replaceChildren(
        placeholder,
        ...suppliers.map((supplier) => {
            const option = el("option", undefined, supplier.name);

            option.value = supplier.id;

            return option;
        })
    );

    if (preferred && suppliers.some((supplier) => supplier.id === preferred)) {
        supplierSelect.value = preferred;
    }
}

supplierSelect?.addEventListener("change", () => supplierSelect.classList.remove("is-invalid"));

const ERRORS: Record<string, string> = {
    supplier_not_found: "Fournisseur introuvable.",
    no_items: "Ajoutez au moins un produit.",
    invalid_item: "Quantité ou prix invalide sur une ligne.",
    unknown_product: "Un produit n'existe plus. Rechargez la page.",
    duplicate_product: "Un même produit apparaît deux fois : regroupez les lignes.",
    invalid_paid: "Montant payé invalide (entre 0 et le total).",
    too_high: "Quantité ou montant trop grand.",
    storage: "Impossible d'enregistrer l'achat."
};

form?.addEventListener("submit", (event) => {
    event.preventDefault();

    const supplierId = supplierSelect?.value ?? "";

    if (supplierId === "") {
        supplierSelect?.classList.add("is-invalid");
        toast("Choisissez un fournisseur.");
        supplierSelect?.focus();
        return;
    }

    // Contrôle ligne par ligne, avec le champ fautif mis en évidence.
    const items: Array<{ productId: string; quantity: number; unitCost: number }> = [];

    for (const controls of lineControls) {
        const quantity = readNumber(controls.quantity);
        const unitCost = readNumber(controls.unitCost);

        if (controls.product.value === "") {
            controls.product.classList.add("is-invalid");
            toast("Choisissez un produit sur chaque ligne.");
            controls.product.focus();
            return;
        }

        if (!Number.isInteger(quantity) || quantity < 1 || quantity > LIMITS.stockMax) {
            controls.quantity.classList.add("is-invalid");
            toast("Quantité invalide : un nombre entier est attendu.");
            controls.quantity.focus();
            return;
        }

        if (cleanAmount(unitCost) === null) {
            controls.unitCost.classList.add("is-invalid");
            toast("Prix d'achat invalide.");
            controls.unitCost.focus();
            return;
        }

        items.push({ productId: controls.product.value, quantity, unitCost });
    }

    const total = items.reduce((sum, item) => sum + item.quantity * Math.round(item.unitCost), 0);
    const paid = paidInput && paidInput.value.trim() !== "" ? Number(paidInput.value) : 0;

    if (!Number.isInteger(paid) || paid < 0 || paid > total) {
        paidInput?.classList.add("is-invalid");
        toast("Montant payé invalide (entre 0 et le total).");
        paidInput?.focus();
        return;
    }

    const note = (noteInput?.value ?? "").replace(/\s+/g, " ").trim();

    if (note.length > MODULE_LIMITS.textMax) {
        toast(`Note trop longue (${MODULE_LIMITS.textMax} caractères max).`);
        noteInput?.focus();
        return;
    }

    // Avertit si la caisse devient négative (l'achat reste possible).
    const goesNegative = paid > 0 && getCashSummary().balance - paid < 0;

    if (submitButton) submitButton.disabled = true;

    const result = recordPurchase({
        supplierId,
        items,
        paid,
        note,
        updatePrices: updatePrices?.checked ?? false
    });

    if (submitButton) submitButton.disabled = false;

    if (!result.ok) {
        toast(ERRORS[result.reason] ?? ERRORS.storage);
        return;
    }

    const due = result.purchase.total - result.purchase.paid;

    toast(
        goesNegative
            ? "Achat enregistré. Attention : le solde de la caisse est négatif."
            : due > 0
              ? `Achat enregistré. Reste dû : ${money(due)}. Stock mis à jour.`
              : "Achat enregistré. Stock mis à jour."
    );

    form.reset();
    if (updatePrices) updatePrices.checked = true;
    resetLines();
    refreshSuppliers(supplierId);
    render();
});


/* =========================================================
   Historique des achats
   ========================================================= */

function detailRow(label: string, value: string, extraClass = ""): HTMLElement {
    const row = el("div", `detail-row ${extraClass}`.trim());

    row.append(el("span", undefined, label), el("span", undefined, value));

    return row;
}

const CANCEL_ERRORS: Record<string, string> = {
    not_found: "Achat introuvable.",
    already_cancelled: "Cet achat est déjà annulé.",
    has_payments: "Cet achat a des paiements : annulez-les d'abord (page Fournisseurs).",
    storage: "Impossible d'annuler l'achat."
};

function createPurchaseCard(purchase: Purchase, remaining: number): HTMLElement {
    const date = new Date(purchase.createdAt);
    const cancelled = purchase.cancelledAt !== undefined;
    const card = el("details", "row-card");
    const summary = el("summary");

    card.open = purchase.id === openId;

    card.addEventListener("toggle", () => {
        if (card.open) {
            openId = purchase.id;
        } else if (openId === purchase.id) {
            openId = null;
        }
    });

    const count = purchase.items.reduce((sum, item) => sum + item.quantity, 0);
    const main = el("div", "row-main");

    main.append(
        el("strong", undefined, purchase.supplierName),
        el("span", undefined, `${timeLabel(date)} · ${count} article${count > 1 ? "s" : ""}`)
    );

    const side = el("div", "row-side");

    side.append(
        el("strong", undefined, money(purchase.total)),
        cancelled
            ? el("span", "badge is-cancelled", "Annulé")
            : remaining > 0
              ? el("span", "badge is-debt", `Reste ${money(remaining)}`)
              : el("span", "badge", "Payé")
    );

    summary.append(main, side);

    const details = el("div", "row-details");

    details.append(el("h3", "detail-title", "Produits"));

    for (const item of purchase.items) {
        const line = el("div", "item-line");
        const name = el("div");

        name.append(
            el("span", undefined, item.productName),
            el("small", undefined, `${item.quantity} × ${money(item.unitCost)}`)
        );

        line.append(name, el("strong", undefined, money(item.quantity * item.unitCost)));
        details.append(line);
    }

    details.append(
        el("h3", "detail-title", "Paiement"),
        detailRow("Total", money(purchase.total)),
        detailRow("Payé à la livraison", money(purchase.paid))
    );

    if (!cancelled && remaining > 0) {
        details.append(detailRow("Reste à payer", money(remaining), "is-out"));
    }

    if (purchase.note) {
        details.append(detailRow("Note", purchase.note));
    }

    if (purchase.cancelledAt) {
        details.append(
            detailRow(
                "Annulé le",
                `${new Date(purchase.cancelledAt).toLocaleDateString("fr-FR")} ${timeLabel(new Date(purchase.cancelledAt))}`
            )
        );
    } else {
        const actions = el("div", "row-actions");

        actions.append(
            createDeleteControl({
                label: "Annuler cet achat",
                question:
                    "Annuler cet achat ? Le stock livré sera retiré (s'il est encore en rayon) et l'argent payé à la livraison sera retiré des sorties de caisse. Les prix d'achat mis à jour ne reviennent pas en arrière.",
                onConfirm: () => {
                    const result = cancelPurchase(purchase.id);

                    if (!result.ok) {
                        toast(
                            result.reason === "stock_used"
                                ? `Impossible : le stock de « ${result.productName ?? "un produit"} » est déjà entamé (ventes ou sorties).`
                                : (CANCEL_ERRORS[result.reason] ?? CANCEL_ERRORS.storage)
                        );
                        openId = purchase.id;
                        render();
                        return;
                    }

                    toast(
                        result.missingProducts > 0
                            ? "Achat annulé. Certains produits supprimés n'ont pas pu être mis à jour."
                            : "Achat annulé. Le stock a été remis comme avant."
                    );
                    render();
                }
            })
        );

        details.append(actions);
    }

    card.append(summary, details);

    return card;
}

function render(): void {
    const purchases = getPurchases().sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const remaining = getPurchaseRemainingMap();

    if (emptyElement) {
        emptyElement.hidden = purchases.length > 0;
    }

    const nodes: HTMLElement[] = [];
    let currentDay = "";

    for (const purchase of purchases) {
        const date = new Date(purchase.createdAt);
        const key = date.toDateString();

        if (key !== currentDay) {
            currentDay = key;
            nodes.push(el("h2", "day-heading", dayLabel(date)));
        }

        nodes.push(createPurchaseCard(purchase, remaining.get(purchase.id) ?? 0));
    }

    list.replaceChildren(...nodes);
}

window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        refreshSuppliers(supplierSelect?.value);
        render();
    }
});

// Venu de « Nouvel achat » sur la fiche d'un fournisseur.
const requestedSupplier = new URLSearchParams(window.location.search).get("supplier") ?? undefined;

refreshSuppliers(requestedSupplier);
resetLines();
render();
