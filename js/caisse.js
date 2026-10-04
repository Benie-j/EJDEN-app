// src/caisse.ts
// Page Caisse : solde, entrées et sorties, détail des encaissements.
import { MODULE_LIMITS, addCashEntry, cleanAmount, deleteCashEntry, getCashSummary, newId } from "./storage.js";
import { createDeleteControl, createToast, dayLabel, el, money, timeLabel } from "./ui.js";
const form = document.querySelector("#cashForm");
const amountInput = document.querySelector("#cashAmount");
const reasonInput = document.querySelector("#cashReason");
const typeButtons = document.querySelectorAll(".segmented button");
const listElement = document.querySelector("#cashList");
const emptyElement = document.querySelector("#cashEmpty");
const methodsSection = document.querySelector("#methodsSection");
const methodsList = document.querySelector("#methodsList");
const balanceCard = document.querySelector("#balanceCard");
if (!listElement) {
    throw new Error("EJDEN : #cashList est introuvable.");
}
const list = listElement;
const toast = createToast();
let currentType = "in";
const METHOD_LABELS = {
    cash: "Espèces",
    mobile_money: "Mobile Money",
    card: "Carte",
    other: "Autre",
    credit: "Acomptes sur crédit"
};
const SOURCE_LABELS = {
    sale: "Vente",
    credit_payment: "Remboursement de crédit",
    entry: "Entrée de caisse",
    exit: "Sortie de caisse",
    expense: "Dépense",
    purchase: "Achat fournisseur",
    supplier_payment: "Paiement fournisseur"
};
/* =========================================================
   Formulaire
   ========================================================= */
function setType(type) {
    currentType = type;
    typeButtons.forEach((button) => {
        button.classList.toggle("is-active", button.dataset.type === type);
    });
}
typeButtons.forEach((button) => {
    button.addEventListener("click", () => {
        setType(button.dataset.type === "out" ? "out" : "in");
    });
});
amountInput?.addEventListener("input", () => {
    amountInput.classList.remove("is-invalid");
});
reasonInput?.addEventListener("input", () => {
    reasonInput.classList.remove("is-invalid");
});
form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const amount = cleanAmount(Number(amountInput?.value ?? ""));
    const reason = (reasonInput?.value ?? "").replace(/\s+/g, " ").trim();
    if (amount === null) {
        amountInput?.classList.add("is-invalid");
        toast("Montant invalide.");
        amountInput?.focus();
        return;
    }
    if (reason === "") {
        reasonInput?.classList.add("is-invalid");
        toast("Veuillez indiquer le motif.");
        reasonInput?.focus();
        return;
    }
    if (reason.length > MODULE_LIMITS.textMax) {
        reasonInput?.classList.add("is-invalid");
        toast(`Motif trop long (${MODULE_LIMITS.textMax} caractères max).`);
        reasonInput?.focus();
        return;
    }
    const goesNegative = currentType === "out" && getCashSummary().balance - amount < 0;
    const ok = addCashEntry({
        id: newId(),
        type: currentType,
        amount,
        reason,
        createdAt: new Date().toISOString()
    });
    if (!ok) {
        toast("Impossible d'enregistrer le mouvement.");
        return;
    }
    form?.reset();
    toast(goesNegative
        ? "Enregistré. Attention : le solde de la caisse est négatif."
        : currentType === "in"
            ? "Entrée enregistrée."
            : "Sortie enregistrée.");
    render();
});
/* =========================================================
   Affichage
   ========================================================= */
function setText(selector, text) {
    const node = document.querySelector(selector);
    if (node) {
        node.textContent = text;
    }
}
function format(value) {
    return Math.round(value).toLocaleString("fr-FR");
}
function createMovementRow(movement) {
    const date = new Date(movement.createdAt);
    const isIn = movement.amount > 0;
    const subtitle = (movement.source === "sale" || movement.source === "credit_payment") &&
        movement.method
        ? `${SOURCE_LABELS[movement.source]} · ${METHOD_LABELS[movement.method]} · ${timeLabel(date)}`
        : `${SOURCE_LABELS[movement.source]} · ${timeLabel(date)}`;
    const main = el("div", "row-main");
    main.append(el("strong", undefined, movement.label), el("span", undefined, subtitle));
    const side = el("div", "row-side");
    side.append(el("strong", isIn ? "is-in" : "is-out", `${isIn ? "+" : "−"} ${money(Math.abs(movement.amount))}`));
    // Les entrées/sorties saisies à la main peuvent être supprimées.
    if (movement.deletableId !== undefined) {
        const entryId = movement.deletableId;
        const card = el("details", "row-card");
        const summary = el("summary");
        const details = el("div", "row-details");
        const actions = el("div", "row-actions");
        summary.append(main, side);
        actions.append(createDeleteControl({
            label: "Supprimer ce mouvement",
            question: "Supprimer ce mouvement ? Le solde de la caisse sera mis à jour.",
            onConfirm: () => {
                toast(deleteCashEntry(entryId)
                    ? "Mouvement supprimé."
                    : "Impossible de supprimer ce mouvement.");
                render();
            }
        }));
        details.append(actions);
        card.append(summary, details);
        return card;
    }
    const card = el("div", "row-card");
    const row = el("div", "row-summary");
    row.append(main, side);
    card.append(row);
    return card;
}
function render() {
    const summary = getCashSummary();
    setText("#cashBalance", format(summary.balance));
    setText("#cashTodayIn", format(summary.todayIn));
    setText("#cashTodayOut", format(summary.todayOut));
    balanceCard?.classList.toggle("is-negative", summary.balance < 0);
    // Encaissé sur les ventes, par mode de paiement
    const methods = Object.keys(summary.salesByMethod).filter((method) => summary.salesByMethod[method] > 0);
    if (methodsSection) {
        methodsSection.hidden = methods.length === 0;
    }
    if (methodsList) {
        methodsList.replaceChildren(...methods.map((method) => {
            const row = el("div", "detail-row");
            row.append(el("span", undefined, METHOD_LABELS[method]), el("span", undefined, money(summary.salesByMethod[method])));
            return row;
        }));
    }
    // Mouvements, regroupés par jour
    if (emptyElement) {
        emptyElement.hidden = summary.movements.length > 0;
    }
    const nodes = [];
    let currentDay = "";
    for (const movement of summary.movements) {
        const date = new Date(movement.createdAt);
        const key = date.toDateString();
        if (key !== currentDay) {
            currentDay = key;
            nodes.push(el("h2", "day-heading", dayLabel(date)));
        }
        nodes.push(createMovementRow(movement));
    }
    list.replaceChildren(...nodes);
}
window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        render();
    }
});
render();
// Venu de « Entrée de caisse » : montant prêt à être saisi.
const requested = new URLSearchParams(window.location.search).get("new");
if (requested !== null) {
    setType(requested === "out" ? "out" : "in");
    amountInput?.focus();
}
//# sourceMappingURL=caisse.js.map