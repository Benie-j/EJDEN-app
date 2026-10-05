// src/rapports.ts
// Rapports du jour, du mois ou de l'année : ventes, argent, factures,
// dépenses, produits et modes de paiement. Texte via textContent uniquement.
import { EXPENSE_CATEGORIES, getCashFlowBetween, getExpenses, getInvoiceCollectedBetween, getSales, getSalesSummaryBetween, getShopSettings } from "./storage.js";
import { shareText } from "./share.js";
import { createToast, el, money } from "./ui.js";
function byId(id) {
    const node = document.getElementById(id);
    if (!node)
        throw new Error(`EJDEN : élément #${id} introuvable.`);
    return node;
}
const toast = createToast();
const METHODS = {
    cash: "Espèces",
    mobile_money: "Mobile Money",
    card: "Carte",
    other: "Autre",
    credit: "Crédit"
};
let mode = "day";
// Début de la période affichée (heure locale).
let anchor = startOf(new Date(), "day");
let lastText = "";
function startOf(date, m) {
    return m === "day"
        ? new Date(date.getFullYear(), date.getMonth(), date.getDate())
        : m === "month"
            ? new Date(date.getFullYear(), date.getMonth(), 1)
            : new Date(date.getFullYear(), 0, 1);
}
function shift(date, m, delta) {
    return m === "day"
        ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta)
        : m === "month"
            ? new Date(date.getFullYear(), date.getMonth() + delta, 1)
            : new Date(date.getFullYear() + delta, 0, 1);
}
function rangeOf() {
    return { start: anchor, end: new Date(shift(anchor, mode, 1).getTime() - 1) };
}
function labelOf() {
    return mode === "day"
        ? anchor.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
        : mode === "month"
            ? anchor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
            : String(anchor.getFullYear());
}
function kpi(label, value, main = false) {
    const node = el("div", main ? "rp-kpi is-main" : "rp-kpi");
    node.append(el("span", undefined, label), el("strong", undefined, value));
    return node;
}
function line(label, value, tone) {
    const node = el("div", tone ? `rp-row is-${tone}` : "rp-row");
    node.append(el("span", undefined, label), el("strong", undefined, value));
    return node;
}
function section(title, rows, empty) {
    const box = el("section", "rp-section");
    box.append(el("h2", undefined, title));
    if (rows.length === 0)
        box.append(el("p", "rp-empty", empty));
    else
        box.append(...rows);
    return box;
}
function signed(value) {
    return `${value > 0 ? "+" : ""}${money(value)}`;
}
function render() {
    const { start, end } = rangeOf();
    const from = start.getTime();
    const to = end.getTime();
    const shop = getShopSettings();
    const summary = getSalesSummaryBetween(start, end);
    const flow = getCashFlowBetween(start, end);
    const invoices = getInvoiceCollectedBetween(start, end);
    const net = flow.cashIn - flow.cashOut;
    const text = [`*Rapport — ${labelOf()}*`];
    if (shop.name)
        text.unshift(`*${shop.name}*`);
    /* Ventes de la période : produits et modes de paiement */
    const products = new Map();
    const methods = new Map();
    for (const sale of getSales()) {
        const at = new Date(sale.createdAt).getTime();
        if (sale.cancelledAt || at < from || at > to)
            continue;
        const method = methods.get(sale.paymentMethod) ?? { count: 0, amount: 0 };
        method.count += 1;
        method.amount += sale.total;
        methods.set(sale.paymentMethod, method);
        for (const item of sale.items) {
            const entry = products.get(item.productName) ?? { quantity: 0, amount: 0 };
            entry.quantity += item.quantity;
            entry.amount += item.total;
            products.set(item.productName, entry);
        }
    }
    /* Dépenses */
    const byCategory = new Map();
    let expensesTotal = 0;
    for (const expense of getExpenses()) {
        const at = new Date(expense.createdAt).getTime();
        if (at < from || at > to)
            continue;
        byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amount);
        expensesTotal += expense.amount;
    }
    const categoryLabel = (id) => EXPENSE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
    const report = byId("report");
    const head = el("header", "rp-head");
    head.append(el("h2", undefined, `Rapport — ${shop.name || "Boutique"}`), el("p", undefined, labelOf()));
    const average = summary.salesCount > 0 ? summary.revenue / summary.salesCount : 0;
    const kpis = el("div", "rp-kpis");
    kpis.append(kpi("Chiffre d'affaires", money(summary.revenue), true), kpi("Ventes", String(summary.salesCount)), kpi("Panier moyen", money(average)), kpi("Marge brute", summary.margin === null ? "—" : money(summary.margin)), kpi("Dépenses", money(expensesTotal)));
    text.push("", `Chiffre d'affaires : ${money(summary.revenue)}`, `Ventes : ${summary.salesCount}`, `Marge brute : ${summary.margin === null ? "—" : money(summary.margin)}`, `Dépenses : ${money(expensesTotal)}`, `Entrées d'argent : ${money(flow.cashIn)}`, `Sorties d'argent : ${money(flow.cashOut)}`, `Variation de la caisse : ${signed(net)}`);
    const cash = section("Argent (caisse)", [
        line("Entrées d'argent", money(flow.cashIn)),
        line("Sorties d'argent", money(flow.cashOut)),
        line("Variation de la caisse", signed(net), net >= 0 ? "positive" : "negative"),
        ...(invoices.count > 0
            ? [line(`Dont factures encaissées (${invoices.count})`, money(invoices.amount))]
            : [])
    ], "");
    const methodRows = [...methods.entries()]
        .sort((a, b) => b[1].amount - a[1].amount)
        .map(([id, data]) => line(`${METHODS[id]} (${data.count})`, money(data.amount)));
    const productRows = [...products.entries()]
        .sort((a, b) => b[1].amount - a[1].amount)
        .slice(0, 8)
        .map(([name, data]) => line(`${name} × ${data.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`, money(data.amount)));
    const expenseRows = [...byCategory.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, amount]) => line(categoryLabel(id), money(amount)));
    if (productRows.length > 0) {
        text.push("", "_Produits les plus vendus_");
        [...products.entries()]
            .sort((a, b) => b[1].amount - a[1].amount)
            .slice(0, 5)
            .forEach(([name, data]) => text.push(`• ${name} × ${data.quantity} — ${money(data.amount)}`));
    }
    report.replaceChildren(head, kpis, cash, section("Modes de paiement des ventes", methodRows, "Aucune vente sur cette période."), section("Produits les plus vendus", productRows, "Aucune vente sur cette période."), section("Dépenses par catégorie", expenseRows, "Aucune dépense sur cette période."));
    lastText = text.join("\n");
    byId("periodLabel").textContent = labelOf();
    byId("nextButton").disabled = shift(anchor, mode, 1).getTime() > Date.now();
}
for (const button of document.querySelectorAll(".rp-mode")) {
    button.addEventListener("click", () => {
        mode = (button.dataset.mode ?? "day");
        anchor = startOf(new Date(), mode);
        for (const other of document.querySelectorAll(".rp-mode")) {
            other.classList.toggle("is-active", other === button);
        }
        render();
    });
}
byId("prevButton").addEventListener("click", () => {
    anchor = shift(anchor, mode, -1);
    render();
});
byId("nextButton").addEventListener("click", () => {
    anchor = shift(anchor, mode, 1);
    render();
});
byId("printButton").addEventListener("click", () => window.print());
byId("shareButton").addEventListener("click", () => {
    void shareText(`Rapport — ${labelOf()}`, lastText).then((message) => {
        if (message)
            toast(message);
    });
});
render();
//# sourceMappingURL=rapports.js.map