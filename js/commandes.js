// src/commandes.ts
// Page Commandes : commandes clients (livraison = vente) et commandes
// fournisseurs (réception = achat). Tout texte venant des données passe
// par textContent (jamais innerHTML).
import { CREDIT_PAYMENT_METHODS, LIMITS, MODULE_LIMITS, addOrder, cancelOrder, cleanAmount, completeCustomerOrder, getClients, getOrders, getOrdersSummary, getProducts, getSuppliers, isOrderOverdue, isValidDay, markOrderReady, receiveSupplierOrder } from "./storage.js";
import { CREDIT_METHOD_LABELS } from "./credit-ui.js";
import { createDeleteControl, createToast, dayLabel, el, money, shortDateLabel, timeLabel, todayInputValue } from "./ui.js";
const kindButtons = document.querySelectorAll(".orders-kind button");
const filterButtons = document.querySelectorAll(".order-filters .filter-button");
const form = document.querySelector("#orderForm");
const formTitle = document.querySelector("#orderFormTitle");
const blocked = document.querySelector("#orderBlocked");
const partyLabel = document.querySelector("#orderPartyLabel");
const partySelect = document.querySelector("#orderParty");
const linesElement = document.querySelector("#orderLines");
const addLineButton = document.querySelector("#addOrderLineButton");
const totalElement = document.querySelector("#orderTotal");
const dateInput = document.querySelector("#orderDate");
const noteInput = document.querySelector("#orderNote");
const submitButton = document.querySelector("#orderSubmit");
const listElement = document.querySelector("#ordersList");
const emptyElement = document.querySelector("#ordersEmpty");
const emptyTitle = document.querySelector("#ordersEmptyTitle");
const emptyText = document.querySelector("#ordersEmptyText");
if (!linesElement || !listElement) {
    throw new Error("EJDEN : éléments de la page Commandes introuvables.");
}
const lines = linesElement;
const list = listElement;
const toast = createToast();
let currentKind = "customer";
let activeFilter = "open";
let openId = null;
/* =========================================================
   Outils
   ========================================================= */
function setText(selector, text) {
    const node = document.querySelector(selector);
    if (node) {
        node.textContent = text;
    }
}
function readNumber(input) {
    const raw = input.value.trim();
    return raw === "" ? Number.NaN : Number(raw);
}
function detailRow(label, value, extraClass = "") {
    const row = el("div", `detail-row ${extraClass}`.trim());
    row.append(el("span", undefined, label), el("span", undefined, value));
    return row;
}
function dayFromInput(value) {
    const [y, m, d] = value.split("-").map(Number);
    return shortDateLabel(new Date(y, m - 1, d));
}
const lineControls = [];
function lineAmount(controls) {
    const quantity = readNumber(controls.quantity);
    const price = readNumber(controls.unitPrice);
    return Number.isFinite(quantity) && Number.isFinite(price) && quantity > 0 && price > 0
        ? Math.round(quantity) * Math.round(price)
        : 0;
}
function refreshTotal() {
    for (const controls of lineControls) {
        controls.lineTotal.textContent = money(lineAmount(controls));
    }
    if (totalElement) {
        totalElement.textContent = money(lineControls.reduce((sum, controls) => sum + lineAmount(controls), 0));
    }
}
function addLine() {
    const index = lineControls.length;
    const uid = `order-line-${Date.now()}-${index}`;
    const root = el("div", "line-card");
    // Produit
    const productField = el("div", "field");
    const productLabel = el("label", undefined, "Produit");
    const product = el("select");
    const placeholder = el("option", undefined, "Choisir un produit…");
    placeholder.value = "";
    product.id = uid;
    productLabel.htmlFor = uid;
    product.append(placeholder, ...getProducts()
        .sort((a, b) => a.name.localeCompare(b.name, "fr"))
        .map((item) => {
        const option = el("option", undefined, item.name);
        option.value = item.id;
        return option;
    }));
    productField.append(productLabel, product);
    // Quantité + prix
    const grid = el("div", "line-grid");
    const quantityField = el("div", "field");
    const quantityLabel = el("label", undefined, "Quantité");
    const quantity = el("input");
    const priceField = el("div", "field");
    const priceLabel = el("label", undefined, currentKind === "customer" ? "Prix de vente" : "Prix d'achat");
    const unitPrice = el("input");
    quantity.id = `${uid}-qty`;
    quantityLabel.htmlFor = quantity.id;
    quantity.type = "number";
    quantity.inputMode = "numeric";
    quantity.min = "1";
    quantity.step = "1";
    quantity.placeholder = "Ex. : 6";
    unitPrice.id = `${uid}-price`;
    priceLabel.htmlFor = unitPrice.id;
    unitPrice.type = "number";
    unitPrice.inputMode = "numeric";
    unitPrice.min = "1";
    unitPrice.step = "1";
    unitPrice.placeholder = "FCFA";
    quantityField.append(quantityLabel, quantity);
    priceField.append(priceLabel, unitPrice);
    grid.append(quantityField, priceField);
    // Pied de ligne
    const footer = el("div", "line-footer");
    const lineTotal = el("strong", undefined, money(0));
    const remove = el("button", "line-remove", "Retirer");
    remove.type = "button";
    footer.append(el("span", undefined, "Total de la ligne : "), lineTotal, remove);
    root.append(productField, grid, footer);
    const controls = { root, product, quantity, unitPrice, lineTotal };
    // Un produit choisi propose son prix (vente ou achat selon le type).
    product.addEventListener("change", () => {
        const chosen = getProducts().find((item) => item.id === product.value);
        if (chosen && unitPrice.value.trim() === "") {
            unitPrice.value = String(currentKind === "customer" ? chosen.salePrice : chosen.purchasePrice);
        }
        product.classList.remove("is-invalid");
        refreshTotal();
    });
    quantity.addEventListener("input", () => {
        quantity.classList.remove("is-invalid");
        refreshTotal();
    });
    unitPrice.addEventListener("input", () => {
        unitPrice.classList.remove("is-invalid");
        refreshTotal();
    });
    remove.addEventListener("click", () => {
        if (lineControls.length <= 1) {
            toast("Une commande doit contenir au moins un produit.");
            return;
        }
        lineControls.splice(lineControls.indexOf(controls), 1);
        root.remove();
        refreshTotal();
    });
    lineControls.push(controls);
    lines.append(root);
    refreshTotal();
}
function resetLines() {
    lineControls.length = 0;
    lines.replaceChildren();
    addLine();
}
addLineButton?.addEventListener("click", () => {
    if (lineControls.length >= 50) {
        toast("Maximum 50 produits par commande.");
        return;
    }
    addLine();
});
/* =========================================================
   Formulaire
   ========================================================= */
function refreshParties() {
    if (!partySelect) {
        return;
    }
    const options = [];
    if (currentKind === "customer") {
        const walkIn = el("option", undefined, "Client de passage");
        walkIn.value = "";
        options.push(walkIn);
        for (const client of getClients().sort((a, b) => a.name.localeCompare(b.name, "fr"))) {
            const option = el("option", undefined, client.name);
            option.value = client.id;
            options.push(option);
        }
    }
    else {
        const placeholder = el("option", undefined, "Choisir un fournisseur…");
        placeholder.value = "";
        options.push(placeholder);
        for (const supplier of getSuppliers().sort((a, b) => a.name.localeCompare(b.name, "fr"))) {
            const option = el("option", undefined, supplier.name);
            option.value = supplier.id;
            options.push(option);
        }
    }
    partySelect.replaceChildren(...options);
}
function refreshForm() {
    const customer = currentKind === "customer";
    if (formTitle) {
        formTitle.textContent = customer ? "Nouvelle commande client" : "Nouvelle commande fournisseur";
    }
    if (partyLabel) {
        partyLabel.textContent = customer ? "Client" : "Fournisseur";
    }
    const message = getProducts().length === 0
        ? "Ajoutez d'abord des produits pour pouvoir les commander."
        : !customer && getSuppliers().length === 0
            ? "Ajoutez d'abord un fournisseur dans la page Fournisseurs."
            : "";
    if (blocked) {
        blocked.hidden = message === "";
        blocked.textContent = message;
    }
    if (form) {
        form.hidden = message !== "";
    }
    if (dateInput) {
        dateInput.min = todayInputValue();
    }
    refreshParties();
    resetLines();
}
partySelect?.addEventListener("change", () => partySelect.classList.remove("is-invalid"));
const ERRORS = {
    party_not_found: "Client ou fournisseur introuvable.",
    party_required: "Choisissez un fournisseur.",
    no_items: "Ajoutez au moins un produit.",
    invalid_item: "Quantité ou prix invalide sur une ligne.",
    unknown_product: "Un produit n'existe plus. Rechargez la page.",
    duplicate_product: "Un même produit apparaît deux fois : regroupez les lignes.",
    too_high: "Quantité ou montant trop grand.",
    invalid_date: "Date prévue invalide.",
    storage: "Impossible d'enregistrer la commande."
};
form?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (currentKind === "supplier" && (partySelect?.value ?? "") === "") {
        partySelect?.classList.add("is-invalid");
        toast("Choisissez un fournisseur.");
        partySelect?.focus();
        return;
    }
    const items = [];
    for (const controls of lineControls) {
        const quantity = readNumber(controls.quantity);
        const price = readNumber(controls.unitPrice);
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
        if (cleanAmount(price) === null) {
            controls.unitPrice.classList.add("is-invalid");
            toast("Prix invalide.");
            controls.unitPrice.focus();
            return;
        }
        items.push({ productId: controls.product.value, quantity, unitPrice: price });
    }
    const date = dateInput?.value.trim() ?? "";
    if (date !== "" && !isValidDay(date)) {
        toast("Date prévue invalide.");
        dateInput?.focus();
        return;
    }
    const note = (noteInput?.value ?? "").replace(/\s+/g, " ").trim();
    if (note.length > MODULE_LIMITS.textMax) {
        toast(`Note trop longue (${MODULE_LIMITS.textMax} caractères max).`);
        noteInput?.focus();
        return;
    }
    if (submitButton)
        submitButton.disabled = true;
    const result = addOrder({
        kind: currentKind,
        partyId: (partySelect?.value ?? "") === "" ? null : (partySelect?.value ?? null),
        items,
        note,
        expectedDate: date === "" ? null : date
    });
    if (submitButton)
        submitButton.disabled = false;
    if (!result.ok) {
        toast(ERRORS[result.reason] ?? ERRORS.storage);
        return;
    }
    toast("Commande enregistrée.");
    form.reset();
    activeFilter = "open";
    syncFilterButtons();
    refreshForm();
    openId = result.order.id;
    render();
});
/* =========================================================
   Actions sur une commande
   ========================================================= */
const DELIVERY_ERRORS = {
    not_found: "Commande introuvable.",
    not_allowed: "Cette commande n'est plus en cours.",
    invalid_amount: "Montant payé invalide (entre 0 et le total).",
    invalid_method: "Mode de paiement invalide.",
    credit_needs_client: "Pour laisser un reste à payer, la commande doit être au nom d'un client enregistré.",
    supplier_not_found: "Ce fournisseur n'existe plus.",
    invalid_paid: "Montant payé invalide (entre 0 et le total).",
    too_high: "Le stock dépasserait la limite autorisée.",
    storage: "Impossible d'enregistrer : rien n'a été modifié."
};
function isMethod(value) {
    return CREDIT_PAYMENT_METHODS.includes(value);
}
/** Panneau « Livrer et encaisser » (commande client). */
function createDeliveryPanel(order) {
    const panel = el("div", "pay-box order-panel");
    const amountField = el("div", "field");
    const methodField = el("div", "field");
    const amountInput = el("input");
    const methodSelect = el("select");
    const note = el("p", "form-note");
    amountInput.type = "number";
    amountInput.inputMode = "numeric";
    amountInput.min = "0";
    amountInput.step = "1";
    amountInput.value = String(order.total);
    amountInput.id = `deliver-amount-${order.id}`;
    methodSelect.id = `deliver-method-${order.id}`;
    for (const method of CREDIT_PAYMENT_METHODS) {
        const option = el("option", undefined, CREDIT_METHOD_LABELS[method]);
        option.value = method;
        methodSelect.append(option);
    }
    const amountLabel = el("label", undefined, "Montant payé maintenant (FCFA)");
    const methodLabel = el("label", undefined, "Mode de paiement");
    amountLabel.htmlFor = amountInput.id;
    methodLabel.htmlFor = methodSelect.id;
    amountField.append(amountLabel, amountInput);
    methodField.append(methodLabel, methodSelect);
    function updateNote() {
        const paid = readNumber(amountInput);
        if (!Number.isFinite(paid) || paid < 0 || paid > order.total) {
            note.textContent = "Le montant payé doit être compris entre 0 et le total.";
        }
        else if (paid < order.total) {
            note.textContent =
                order.partyId === null
                    ? "Un reste à payer exige un client enregistré."
                    : `Le reste (${money(order.total - paid)}) deviendra un crédit de ${order.partyName}.`;
        }
        else {
            note.textContent = "Vente payée en totalité.";
        }
    }
    amountInput.addEventListener("input", () => {
        amountInput.classList.remove("is-invalid");
        updateNote();
    });
    const submit = el("button", "primary-button", "Confirmer la livraison");
    submit.type = "button";
    submit.addEventListener("click", () => {
        const method = methodSelect.value;
        if (!isMethod(method)) {
            toast(DELIVERY_ERRORS.invalid_method);
            return;
        }
        submit.disabled = true;
        const result = completeCustomerOrder(order.id, method, readNumber(amountInput));
        if (!result.ok) {
            submit.disabled = false;
            amountInput.classList.add("is-invalid");
            toast(result.reason === "stock"
                ? `Stock insuffisant pour « ${result.productName ?? "un produit"} ».`
                : (DELIVERY_ERRORS[result.reason] ?? DELIVERY_ERRORS.storage));
            return;
        }
        toast("Commande livrée : vente enregistrée, stock mis à jour.");
        openId = order.id;
        render();
    });
    updateNote();
    panel.append(amountField, methodField, note, submit);
    return panel;
}
/** Panneau « Réceptionner » (commande fournisseur). */
function createReceivePanel(order) {
    const panel = el("div", "pay-box order-panel");
    const paidField = el("div", "field");
    const paidInput = el("input");
    const paidLabel = el("label", undefined, "Payé maintenant (FCFA)");
    const note = el("p", "form-note");
    const check = el("label", "check-row");
    const checkbox = el("input");
    paidInput.type = "number";
    paidInput.inputMode = "numeric";
    paidInput.min = "0";
    paidInput.step = "1";
    paidInput.value = String(order.total);
    paidInput.id = `receive-paid-${order.id}`;
    paidLabel.htmlFor = paidInput.id;
    paidField.append(paidLabel, paidInput);
    checkbox.type = "checkbox";
    checkbox.checked = true;
    check.append(checkbox, el("span", undefined, "Mettre à jour le prix d'achat des produits"));
    function updateNote() {
        const paid = readNumber(paidInput);
        note.textContent =
            !Number.isFinite(paid) || paid < 0 || paid > order.total
                ? "Le montant payé doit être compris entre 0 et le total."
                : paid < order.total
                    ? `Le reste (${money(order.total - paid)}) sera une dette envers ${order.partyName}.`
                    : "Achat payé en totalité.";
    }
    paidInput.addEventListener("input", () => {
        paidInput.classList.remove("is-invalid");
        updateNote();
    });
    const submit = el("button", "primary-button", "Confirmer la réception");
    submit.type = "button";
    submit.addEventListener("click", () => {
        submit.disabled = true;
        const result = receiveSupplierOrder(order.id, readNumber(paidInput), checkbox.checked);
        if (!result.ok) {
            submit.disabled = false;
            paidInput.classList.add("is-invalid");
            toast(DELIVERY_ERRORS[result.reason] ?? DELIVERY_ERRORS.storage);
            return;
        }
        toast("Commande reçue : achat enregistré, stock augmenté.");
        openId = order.id;
        render();
    });
    updateNote();
    panel.append(paidField, check, note, submit);
    return panel;
}
/* =========================================================
   Liste
   ========================================================= */
function statusBadge(order) {
    if (order.status === "completed") {
        return el("span", "badge is-done", order.kind === "customer" ? "Livrée" : "Reçue");
    }
    if (order.status === "cancelled") {
        return el("span", "badge is-cancelled", "Annulée");
    }
    if (isOrderOverdue(order)) {
        return el("span", "badge is-overdue", "En retard");
    }
    return order.status === "ready"
        ? el("span", "badge is-ready", "Prête")
        : el("span", "badge is-debt", "En attente");
}
function createOrderCard(order) {
    const date = new Date(order.createdAt);
    const card = el("details", "row-card");
    const summary = el("summary");
    const open = order.status === "pending" || order.status === "ready";
    card.open = order.id === openId;
    card.addEventListener("toggle", () => {
        if (card.open) {
            openId = order.id;
        }
        else if (openId === order.id) {
            openId = null;
        }
    });
    const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const main = el("div", "row-main");
    main.append(el("strong", undefined, order.partyName), el("span", undefined, `${count} article${count > 1 ? "s" : ""}${order.expectedDate ? ` · pour le ${dayFromInput(order.expectedDate)}` : ""}`));
    const side = el("div", "row-side");
    side.append(el("strong", undefined, money(order.total)), statusBadge(order));
    summary.append(main, side);
    const details = el("div", "row-details");
    // --- Produits (avec le stock actuel pour une commande client) ---
    details.append(el("h3", "detail-title", "Produits"));
    const products = getProducts();
    for (const item of order.items) {
        const line = el("div", "item-line");
        const name = el("div");
        const small = el("small", undefined, `${item.quantity} × ${money(item.unitPrice)}`);
        if (order.kind === "customer" && open) {
            const stock = products.find((product) => product.id === item.productId)?.stock ?? 0;
            if (stock < item.quantity) {
                small.append(" · ", el("span", "stock-short", stock === 0 ? "en rupture" : `stock insuffisant (${stock})`));
            }
        }
        name.append(el("span", undefined, item.productName), small);
        line.append(name, el("strong", undefined, money(item.quantity * item.unitPrice)));
        details.append(line);
    }
    details.append(el("h3", "detail-title", "Informations"), detailRow("Commande du", `${shortDateLabel(date)} ${timeLabel(date)}`), detailRow("Total", money(order.total)));
    if (order.expectedDate) {
        details.append(detailRow("Date prévue", dayFromInput(order.expectedDate), isOrderOverdue(order) ? "is-out" : ""));
    }
    if (order.note) {
        details.append(detailRow("Note", order.note));
    }
    if (order.completedAt) {
        details.append(detailRow(order.kind === "customer" ? "Livrée le" : "Reçue le", `${shortDateLabel(new Date(order.completedAt))} ${timeLabel(new Date(order.completedAt))}`), detailRow(order.kind === "customer" ? "Vente créée" : "Achat créé", order.linkId ? `N° ${order.linkId.slice(-6).toUpperCase()}` : "—"));
    }
    if (order.cancelledAt) {
        details.append(detailRow("Annulée le", `${shortDateLabel(new Date(order.cancelledAt))} ${timeLabel(new Date(order.cancelledAt))}`));
    }
    // --- Actions ---
    if (open) {
        const actions = el("div", "order-actions");
        const panelHolder = el("div");
        const primary = el("button", "action-button is-primary", order.kind === "customer" ? "Livrer et encaisser" : "Réceptionner");
        primary.type = "button";
        primary.addEventListener("click", () => {
            if (panelHolder.childElementCount > 0) {
                panelHolder.replaceChildren();
                return;
            }
            panelHolder.append(order.kind === "customer" ? createDeliveryPanel(order) : createReceivePanel(order));
        });
        actions.append(primary, panelHolder);
        if (order.kind === "customer" && order.status === "pending") {
            const ready = el("button", "action-button", "Marquer comme prête");
            ready.type = "button";
            ready.addEventListener("click", () => {
                const result = markOrderReady(order.id);
                toast(result.ok ? "Commande prête." : "Impossible de modifier cette commande.");
                openId = order.id;
                render();
            });
            actions.append(ready);
        }
        actions.append(createDeleteControl({
            label: "Annuler la commande",
            question: "Annuler cette commande ? Le stock et la caisse ne sont pas touchés (rien n'a encore été livré).",
            onConfirm: () => {
                const result = cancelOrder(order.id);
                toast(result.ok ? "Commande annulée." : "Impossible d'annuler cette commande.");
                render();
            }
        }));
        details.append(actions);
    }
    card.append(summary, details);
    return card;
}
function matchesFilter(order) {
    if (order.kind !== currentKind) {
        return false;
    }
    switch (activeFilter) {
        case "completed":
            return order.status === "completed";
        case "cancelled":
            return order.status === "cancelled";
        default:
            return order.status === "pending" || order.status === "ready";
    }
}
function render() {
    const summary = getOrdersSummary();
    setText("#summaryCustomer", String(summary.customerOpen));
    setText("#summarySupplier", String(summary.supplierOpen));
    setText("#summaryOverdue", String(summary.overdue));
    const overdueCard = document.querySelector("#overdueCard");
    if (overdueCard) {
        overdueCard.hidden = summary.overdue === 0;
    }
    const orders = getOrders()
        .filter(matchesFilter)
        .sort((a, b) => {
        // En cours : date prévue la plus proche d'abord, sinon la plus récente.
        if (activeFilter === "open") {
            const da = a.expectedDate ?? "9999-12-31";
            const db = b.expectedDate ?? "9999-12-31";
            if (da !== db) {
                return da < db ? -1 : 1;
            }
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    if (emptyElement) {
        emptyElement.hidden = orders.length > 0;
    }
    if (orders.length === 0) {
        const label = activeFilter === "open" ? "en cours" : activeFilter === "completed" ? "terminée" : "annulée";
        if (emptyTitle) {
            emptyTitle.textContent = activeFilter === "open" ? "Aucune commande en cours" : "Aucune commande";
        }
        if (emptyText) {
            emptyText.textContent =
                activeFilter === "open"
                    ? "Les commandes que vous enregistrez apparaîtront ici."
                    : `Aucune commande ${label}.`;
        }
    }
    list.replaceChildren(...(activeFilter === "open"
        ? orders.map(createOrderCard)
        : groupByDay(orders)));
}
/** Terminées / annulées : regroupées par jour. */
function groupByDay(orders) {
    const nodes = [];
    let currentDay = "";
    for (const order of orders) {
        const reference = new Date(order.completedAt ?? order.cancelledAt ?? order.createdAt);
        const key = reference.toDateString();
        if (key !== currentDay) {
            currentDay = key;
            nodes.push(el("h2", "day-heading", dayLabel(reference)));
        }
        nodes.push(createOrderCard(order));
    }
    return nodes;
}
/* =========================================================
   Onglets et filtres
   ========================================================= */
function syncFilterButtons() {
    filterButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.filter === activeFilter);
    });
}
function setKind(kind) {
    currentKind = kind;
    kindButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.kind === kind);
    });
}
kindButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const kind = button.dataset.kind === "supplier" ? "supplier" : "customer";
        if (kind === currentKind) {
            return;
        }
        setKind(kind);
        openId = null;
        refreshForm();
        render();
    });
});
filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const value = button.dataset.filter;
        if (value !== "open" && value !== "completed" && value !== "cancelled") {
            return;
        }
        activeFilter = value;
        syncFilterButtons();
        render();
    });
});
window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        refreshParties();
        render();
    }
});
// Lien « commandes.html?kind=supplier »
if (new URLSearchParams(window.location.search).get("kind") === "supplier") {
    setKind("supplier");
}
refreshForm();
render();
//# sourceMappingURL=commandes.js.map