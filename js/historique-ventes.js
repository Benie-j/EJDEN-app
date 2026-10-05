// src/historique-ventes.ts
// Historique des ventes : toutes les informations de chaque vente.
// Les textes venant des données sont insérés avec textContent
// (jamais en HTML) pour éviter toute injection.
import { getSales, cancelSale, getRemainingMap, getSalePayments, getShopSettings } from "./storage.js";
import { createPaymentForm, createPaymentsList } from "./credit-ui.js";
import { printTicket } from "./ticket.js";
/* =========================================================
   Éléments
   ========================================================= */
const listElement = document.querySelector("#historyList");
const emptyElement = document.querySelector("#historyEmpty");
const emptyTitle = document.querySelector("#historyEmptyTitle");
const emptyText = document.querySelector("#historyEmptyText");
const searchInput = document.querySelector("#historySearch");
const filterButtons = document.querySelectorAll(".filter-button");
if (!listElement) {
    throw new Error("EJDEN : #historyList est introuvable.");
}
const list = listElement;
let activeFilter = "all";
/* =========================================================
   Formats
   ========================================================= */
const PAYMENT_LABELS = {
    cash: "Espèces",
    mobile_money: "Mobile Money",
    card: "Carte",
    other: "Autre",
    credit: "Crédit"
};
function money(value) {
    return `${Math.round(value).toLocaleString("fr-FR")} FCFA`;
}
function isSameDay(a, b) {
    return (a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate());
}
function dayLabel(date) {
    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (isSameDay(date, now))
        return "Aujourd'hui";
    if (isSameDay(date, yesterday))
        return "Hier";
    return date.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}
function timeLabel(date) {
    return date.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit"
    });
}
function fullDateLabel(date) {
    return date.toLocaleString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}
function saleNumber(sale) {
    return `N° ${sale.id.slice(-6).toUpperCase()}`;
}
/** Marge de la vente, ou null si un prix d'achat est inconnu. */
function saleMargin(sale) {
    if (sale.items.some((item) => item.unitCost === undefined)) {
        return null;
    }
    const gross = sale.items.reduce((sum, item) => sum + (item.unitPrice - (item.unitCost ?? 0)) * item.quantity, 0);
    return gross - sale.discount;
}
/* =========================================================
   Petits constructeurs DOM
   ========================================================= */
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className)
        node.className = className;
    if (text !== undefined)
        node.textContent = text;
    return node;
}
function detailRow(label, value, extraClass = "") {
    const row = el("div", `detail-row ${extraClass}`.trim());
    row.append(el("span", undefined, label), el("span", undefined, value));
    return row;
}
function chevron() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "sale-chevron");
    path.setAttribute("d", "M9 6l6 6-6 6");
    svg.append(path);
    return svg;
}
/* =========================================================
   Message
   ========================================================= */
const toast = document.querySelector("#historyToast");
let toastTimer;
function showToast(message) {
    if (!toast) {
        return;
    }
    toast.textContent = message;
    toast.classList.add("is-visible");
    if (toastTimer !== undefined) {
        window.clearTimeout(toastTimer);
    }
    toastTimer = window.setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 3000);
}
/* =========================================================
   Reçu (texte) et partage WhatsApp
   ========================================================= */
function buildReceipt(sale) {
    const date = new Date(sale.createdAt);
    const shop = getShopSettings();
    const lines = [];
    if (shop.name) {
        lines.push(`*${shop.name}*`);
    }
    if (shop.phone) {
        lines.push(`Tél : ${shop.phone}`);
    }
    if (shop.name || shop.phone) {
        lines.push("");
    }
    lines.push("*REÇU DE VENTE*", saleNumber(sale), fullDateLabel(date));
    if (sale.borrowerName) {
        lines.push(`Client : ${sale.borrowerName}`);
    }
    lines.push("");
    for (const item of sale.items) {
        lines.push(`${item.quantity} × ${item.productName} — ${money(item.total)}`);
    }
    lines.push("");
    if (sale.discount > 0) {
        lines.push(`Sous-total : ${money(sale.subtotal)}`);
        lines.push(`Remise : − ${money(sale.discount)}`);
    }
    lines.push(`*TOTAL : ${money(sale.total)}*`);
    lines.push(`Paiement : ${PAYMENT_LABELS[sale.paymentMethod]}`);
    lines.push(`Payé : ${money(sale.amountPaid)}`);
    if (sale.change > 0) {
        lines.push(`Monnaie rendue : ${money(sale.change)}`);
    }
    const remainingNow = getRemainingMap([sale]).get(sale.id) ?? 0;
    const refunded = sale.remaining - remainingNow;
    if (refunded > 0) {
        lines.push(`Déjà remboursé : ${money(refunded)}`);
    }
    if (remainingNow > 0) {
        lines.push(`*Reste à payer : ${money(remainingNow)}*`);
    }
    else if (sale.remaining > 0) {
        lines.push("*Crédit soldé*");
    }
    lines.push("");
    lines.push("Merci de votre confiance !");
    return lines.join("\n");
}
async function shareReceipt(sale) {
    const text = buildReceipt(sale);
    // Menu de partage du téléphone (WhatsApp, SMS...).
    if (typeof navigator.share === "function") {
        try {
            await navigator.share({ text });
            return;
        }
        catch (error) {
            // L'utilisateur a fermé le menu : rien à faire.
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }
        }
    }
    // Sinon : WhatsApp directement.
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
        showToast("Impossible d'ouvrir WhatsApp.");
    }
}
/* =========================================================
   Carte d'une vente
   ========================================================= */
function createActions(sale) {
    const actions = el("div", "sale-actions");
    const shareButton = el("button", "action-button", "Partager le reçu");
    shareButton.type = "button";
    shareButton.addEventListener("click", () => {
        void shareReceipt(sale);
    });
    const ticket80 = el("button", "action-button", "Ticket 80 mm");
    const ticket58 = el("button", "action-button", "Ticket 58 mm");
    ticket80.type = "button";
    ticket58.type = "button";
    ticket80.addEventListener("click", () => printTicket(sale, 80));
    ticket58.addEventListener("click", () => printTicket(sale, 58));
    const cancelButton = el("button", "action-button is-danger", "Annuler la vente");
    cancelButton.type = "button";
    // Confirmation en deux temps : pas d'annulation par erreur.
    const confirmBox = el("div", "confirm-box");
    confirmBox.hidden = true;
    const confirmText = el("p", undefined, "Annuler cette vente ? Le stock des produits sera remis. Cette action est définitive.");
    const confirmYes = el("button", "action-button is-danger", "Oui, annuler la vente");
    const confirmNo = el("button", "action-button", "Non, garder");
    confirmYes.type = "button";
    confirmNo.type = "button";
    cancelButton.addEventListener("click", () => {
        confirmBox.hidden = false;
        cancelButton.hidden = true;
    });
    confirmNo.addEventListener("click", () => {
        confirmBox.hidden = true;
        cancelButton.hidden = false;
    });
    confirmYes.addEventListener("click", () => {
        confirmYes.disabled = true;
        const result = cancelSale(sale.id);
        if (!result.ok) {
            confirmYes.disabled = false;
            showToast(result.reason === "already_cancelled"
                ? "Cette vente est déjà annulée."
                : result.reason === "not_found"
                    ? "Vente introuvable."
                    : result.reason === "has_payments"
                        ? "Des paiements ont déjà été reçus sur ce crédit. Annulez-les d'abord."
                        : "Impossible d'annuler la vente.");
            render();
            return;
        }
        showToast(result.missingProducts > 0
            ? "Vente annulée. Certains produits supprimés n'ont pas pu être remis en stock."
            : "Vente annulée. Le stock a été remis.");
        render();
    });
    confirmBox.append(confirmText, confirmYes, confirmNo);
    actions.append(shareButton, ticket80, ticket58, cancelButton, confirmBox);
    return actions;
}
function createSaleCard(sale, remaining) {
    const date = new Date(sale.createdAt);
    const isCancelled = sale.cancelledAt !== undefined;
    const isCredit = !isCancelled && remaining > 0;
    // Vente à crédit déjà (au moins en partie) remboursée ?
    const payments = sale.remaining > 0 ? getSalePayments(sale.id) : [];
    const quantity = sale.items.reduce((sum, item) => sum + item.quantity, 0);
    const first = sale.items[0]?.productName ?? "Vente";
    const others = sale.items.length - 1;
    const card = el("details", isCancelled ? "sale-card is-cancelled" : "sale-card");
    const summary = el("summary");
    // --- Résumé (toujours visible) ---
    const main = el("div", "sale-main");
    main.append(el("strong", undefined, others > 0 ? `${first} +${others}` : first), el("span", undefined, `${timeLabel(date)} · ${quantity} article${quantity > 1 ? "s" : ""}`));
    const side = el("div", "sale-side");
    side.append(el("strong", undefined, money(sale.total)), el("span", isCancelled
        ? "sale-status is-cancelled"
        : isCredit
            ? "sale-status is-credit"
            : "sale-status", isCancelled ? "Annulée" : isCredit ? "À crédit" : "Payée"));
    summary.append(main, side, chevron());
    // --- Détail complet ---
    const details = el("div", "sale-details");
    details.append(el("h3", "detail-title", "Informations"));
    details.append(detailRow("Vente", saleNumber(sale)), detailRow("Date", fullDateLabel(date)), detailRow("Client", sale.borrowerName ?? "Client de passage"));
    if (sale.cancelledAt) {
        details.append(detailRow("Annulée le", fullDateLabel(new Date(sale.cancelledAt)), "is-remaining"));
    }
    details.append(el("h3", "detail-title", "Articles"));
    for (const item of sale.items) {
        const row = el("div", "item-row");
        const name = el("div");
        name.append(el("span", undefined, item.productName), el("small", undefined, `${item.quantity} × ${money(item.unitPrice)}`));
        row.append(name, el("strong", undefined, money(item.total)));
        details.append(row);
    }
    details.append(el("h3", "detail-title", "Paiement"));
    details.append(detailRow("Sous-total", money(sale.subtotal)), detailRow("Remise", sale.discount > 0 ? `− ${money(sale.discount)}` : "Aucune"), detailRow("Total", money(sale.total), "is-total"), detailRow("Mode de paiement", PAYMENT_LABELS[sale.paymentMethod]), detailRow("Montant payé", money(sale.amountPaid)));
    if (sale.change > 0) {
        details.append(detailRow("Monnaie rendue", money(sale.change)));
    }
    if (sale.remaining > 0 && !isCancelled) {
        details.append(detailRow("Crédit initial", money(sale.remaining)));
        const paidBack = sale.remaining - remaining;
        if (paidBack > 0) {
            details.append(detailRow("Déjà remboursé", money(paidBack)));
        }
        details.append(isCredit
            ? detailRow("Reste à payer", money(remaining), "is-remaining")
            : detailRow("Crédit", "Soldé"));
    }
    if (payments.length > 0 && !isCancelled) {
        details.append(el("h3", "detail-title", "Paiements reçus"));
        details.append(createPaymentsList(payments, {
            onChanged: (message) => {
                if (message) {
                    showToast(message);
                }
                render();
            },
            onError: showToast
        }));
    }
    if (isCredit) {
        details.append(createPaymentForm({
            saleIds: [sale.id],
            due: remaining,
            onSaved: (message) => {
                showToast(message);
                render();
            },
            onError: showToast
        }));
    }
    const margin = saleMargin(sale);
    if (margin !== null && !isCancelled) {
        details.append(detailRow("Bénéfice", money(margin)));
    }
    // --- Actions ---
    if (!isCancelled) {
        details.append(createActions(sale));
    }
    card.append(summary, details);
    return card;
}
/* =========================================================
   Filtrage
   ========================================================= */
function matchesFilter(sale, now, remaining) {
    switch (activeFilter) {
        case "today":
            return isSameDay(new Date(sale.createdAt), now);
        case "paid":
            return !sale.cancelledAt && remaining <= 0;
        case "credit":
            return !sale.cancelledAt && remaining > 0;
        case "cancelled":
            return sale.cancelledAt !== undefined;
        default:
            return true;
    }
}
function matchesSearch(sale, query) {
    if (query === "") {
        return true;
    }
    const haystack = [
        sale.id,
        saleNumber(sale),
        sale.borrowerName ?? "",
        PAYMENT_LABELS[sale.paymentMethod],
        ...sale.items.map((item) => item.productName)
    ]
        .join(" ")
        .toLowerCase();
    return haystack.includes(query);
}
/* =========================================================
   Affichage
   ========================================================= */
function setText(selector, text) {
    const node = document.querySelector(selector);
    if (node) {
        node.textContent = text;
    }
}
function render() {
    const now = new Date();
    const query = (searchInput?.value ?? "").trim().toLowerCase();
    const all = getSales();
    const remainingMap = getRemainingMap(all);
    const sales = all
        .filter((sale) => matchesFilter(sale, now, remainingMap.get(sale.id) ?? 0) &&
        matchesSearch(sale, query))
        .sort((a, b) => new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime());
    // Résumé de ce qui est affiché (les ventes annulées ne comptent pas)
    const counted = sales.filter((sale) => !sale.cancelledAt);
    setText("#summaryCount", String(counted.length));
    setText("#summaryTotal", Math.round(counted.reduce((sum, sale) => sum + sale.total, 0)).toLocaleString("fr-FR"));
    setText("#summaryRemaining", Math.round(counted.reduce((sum, sale) => sum + (remainingMap.get(sale.id) ?? 0), 0)).toLocaleString("fr-FR"));
    // État vide
    if (emptyElement) {
        emptyElement.hidden = sales.length > 0;
    }
    if (sales.length === 0) {
        if (emptyTitle) {
            emptyTitle.textContent =
                all.length === 0 ? "Aucune vente" : "Aucun résultat";
        }
        if (emptyText) {
            emptyText.textContent =
                all.length === 0
                    ? "Les ventes enregistrées apparaîtront ici."
                    : "Aucune vente ne correspond à votre recherche ou à ce filtre.";
        }
    }
    // Liste, regroupée par jour
    const nodes = [];
    let currentDay = "";
    for (const sale of sales) {
        const date = new Date(sale.createdAt);
        const key = Number.isNaN(date.getTime())
            ? "inconnu"
            : date.toDateString();
        if (key !== currentDay) {
            currentDay = key;
            nodes.push(el("h2", "day-heading", Number.isNaN(date.getTime()) ? "Date inconnue" : dayLabel(date)));
        }
        nodes.push(createSaleCard(sale, remainingMap.get(sale.id) ?? 0));
    }
    list.replaceChildren(...nodes);
}
/* =========================================================
   Événements
   ========================================================= */
searchInput?.addEventListener("input", render);
filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const value = button.dataset.filter;
        if (value !== "all" &&
            value !== "today" &&
            value !== "paid" &&
            value !== "credit" &&
            value !== "cancelled") {
            return;
        }
        activeFilter = value;
        filterButtons.forEach((item) => {
            item.classList.toggle("active", item === button);
        });
        render();
    });
});
// Liens depuis le dashboard : ?filter=credit
const initial = new URLSearchParams(window.location.search).get("filter");
if (initial === "today" ||
    initial === "paid" ||
    initial === "credit" ||
    initial === "cancelled") {
    activeFilter = initial;
    filterButtons.forEach((item) => {
        item.classList.toggle("active", item.dataset.filter === initial);
    });
}
// Retour depuis le cache de navigation : données à jour.
window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        render();
    }
});
render();
//# sourceMappingURL=historique-ventes.js.map