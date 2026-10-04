// src/dashboard.ts
// Tableau de bord : tout vient des vraies données de storage.ts.
// Aucun texte venant des données n'est inséré en HTML (textContent
// uniquement) : un nom de produit ou de client ne peut pas injecter
// de code dans la page.

import { greetingFor } from "./greeting.js";
import { setupMoreMenu } from "./more-menu.js";
import {
    type Sale,
    getSalesSummaryBetween,
    getCashFlowBetween,
    getDashboardPeriod,
    saveDashboardPeriod,
    isValidDay,
    type PeriodChoice,
    type PeriodPreset,
    getRecentSales,
    getStockSummary,
    getReceivables,
    getCashSummary,
    getClients,
    getShopSettings,
    getUserProfile,
    getSalesTrend,
    percentChange,
    type SalesPeriod,
    getCreditPayments,
    getRemainingMap,
    getSales
} from "./storage.js";
import { endOfDay, formatDay, resolvePeriod, startOfDay } from "./period.js";


/* =========================================================
   Outils
   ========================================================= */

function $(selector: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(selector);
}

function setText(selector: string, text: string): void {
    const element = $(selector);

    if (element) {
        element.textContent = text;
    }
}

function formatNumber(value: number): string {
    return Math.round(value).toLocaleString("fr-FR");
}

function formatTime(iso: string): string {
    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const now = new Date();
    const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();

    return sameDay
        ? date.toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit"
          })
        : date.toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "2-digit"
          });
}

function cell(text: string): HTMLTableCellElement {
    const td = document.createElement("td");

    td.textContent = text;

    return td;
}


/* =========================================================
   Message « bientôt disponible »
   ========================================================= */

let toastTimer: number | undefined;

function showToast(message: string): void {
    const toast = $("#dashboardToast");

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
    }, 2500);
}


/* =========================================================
   Indicateurs du jour
   ========================================================= */

// Période choisie (mise à jour à chaque affichage : « Aujourd'hui » change à minuit).
let period = resolvePeriod(getDashboardPeriod());

function renderKpis(): void {
    const summary = getSalesSummaryBetween(period.start, period.end);

    document
        .querySelectorAll<HTMLElement>("[data-period-label]")
        .forEach((node) => {
            node.textContent = period.label;
        });

    setText("#periodButtonLabel", period.buttonLabel);

    setText(
        "#kpiRevenue",
        summary.salesCount > 0 ? formatNumber(summary.revenue) : "—"
    );

    setText("#kpiSalesCount", String(summary.salesCount));
    setText(
        "#kpiSalesLabel",
        summary.salesCount > 1 ? "transactions" : "transaction"
    );

    setText(
        "#kpiMargin",
        summary.margin !== null ? formatNumber(summary.margin) : "—"
    );

}


/* =========================================================
   Caisse et clients
   ========================================================= */

function renderCash(): void {
    const cash = getCashSummary();
    const balance = formatNumber(cash.balance);

    setText("#kpiCash", balance);
    setText("#cashBalance", balance);

    // Le solde est « actuel » ; les entrées et sorties suivent la période choisie.
    const flow = getCashFlowBetween(period.start, period.end);

    setText("#cashIn", formatNumber(flow.cashIn));
    setText("#cashOut", formatNumber(flow.cashOut));
    setText("#cashInLabel", `Entrées · ${period.label}`);
    setText("#cashOutLabel", `Sorties · ${period.label}`);
}

function renderClients(): void {
    const count = getClients().length;

    setText("#clientsCount", String(count));
    setText(
        "#clientsLabel",
        count > 1 ? "clients enregistrés" : "client enregistré"
    );
}


/* =========================================================
   Dernières ventes
   ========================================================= */

function saleSummary(sale: Sale): { label: string; quantity: number } {
    const quantity = sale.items.reduce((sum, item) => sum + item.quantity, 0);
    const first = sale.items[0]?.productName ?? "Vente";
    const others = sale.items.length - 1;

    return {
        label: others > 0 ? `${first} +${others}` : first,
        quantity
    };
}

function renderRecentSales(): void {
    const body = $("#recentSalesBody");
    const empty = $("#recentSalesEmpty");
    const table = body?.closest("table") ?? null;

    if (!body) {
        return;
    }

    const sales = getRecentSales(5);

    body.replaceChildren();

    if (empty) empty.hidden = sales.length > 0;
    if (table) table.hidden = sales.length === 0;

    const remainingMap = getRemainingMap();

    for (const sale of sales) {
        const { label, quantity } = saleSummary(sale);
        const row = document.createElement("tr");

        const status = document.createElement("span");
        const isCredit = (remainingMap.get(sale.id) ?? 0) > 0;

        status.className = isCredit ? "sale-status is-credit" : "sale-status";
        status.textContent = isCredit ? "À crédit" : "Payée";

        const statusCell = document.createElement("td");

        statusCell.append(status);

        row.append(
            cell(label),
            cell(sale.borrowerName ?? "Client de passage"),
            cell(String(quantity)),
            cell(`${formatNumber(sale.total)} FCFA`),
            statusCell
        );

        body.append(row);
    }
}


/* =========================================================
   Stock, créances, alertes
   ========================================================= */

function renderStock(): void {
    const stock = getStockSummary(4);

    setText("#stockProducts", String(stock.productsCount));
    setText("#stockLow", String(stock.lowCount));
    setText("#stockOut", String(stock.outCount));

    const list = $("#stockWatch");
    const empty = $("#stockEmpty");

    if (list) {
        list.replaceChildren();
        list.hidden = stock.watchList.length === 0;

        for (const product of stock.watchList) {
            const item = document.createElement("li");
            const name = document.createElement("span");
            const state = document.createElement("span");

            name.textContent = product.name;

            if (product.stock <= 0) {
                state.className = "is-out";
                state.textContent = "Rupture";
            } else {
                state.className = "is-low";
                state.textContent = `${product.stock} restant${
                    product.stock > 1 ? "s" : ""
                }`;
            }

            item.append(name, state);
            list.append(item);
        }
    }

    if (empty) {
        empty.hidden = stock.watchList.length > 0;
        empty.textContent =
            stock.productsCount === 0
                ? "Aucun produit enregistré."
                : "Aucun produit à surveiller.";
    }

    // Alertes = produits en stock faible + ruptures.
    const alerts = stock.lowCount + stock.outCount;

    setText("#alertsCount", String(alerts));
    setText(
        "#alertsLabel",
        alerts === 0
            ? "aucune alerte"
            : `produit${alerts > 1 ? "s" : ""} à réapprovisionner`
    );
    setText("#notificationCount", String(alerts));

    const alertsLink = document.querySelector<HTMLAnchorElement>("#alertsLink");

    if (alertsLink) {
        alertsLink.href =
            stock.outCount > 0 && stock.lowCount === 0
                ? "stock.html?filter=out"
                : "stock.html?filter=low";
    }
}

function renderReceivables(): void {
    const { amount, debtorsCount } = getReceivables();

    setText("#receivablesAmount", amount > 0 ? formatNumber(amount) : "—");
    setText(
        "#receivablesLabel",
        amount > 0
            ? `FCFA · ${debtorsCount} débiteur${debtorsCount > 1 ? "s" : ""}`
            : "FCFA"
    );
}


/* =========================================================
   Activité récente (ventes et remboursements)
   ========================================================= */

function renderActivity(): void {
    const list = $("#activityList");
    const empty = $("#activityEmpty");

    if (!list) {
        return;
    }

    interface Entry {
        at: string;
        label: string;
    }

    const entries: Entry[] = getRecentSales(5).map((sale) => ({
        at: sale.createdAt,
        label: `Vente de ${formatNumber(sale.total)} FCFA`
    }));

    const activeSaleIds = new Set(
        getSales()
            .filter((sale) => !sale.cancelledAt)
            .map((sale) => sale.id)
    );

    for (const payment of getCreditPayments()) {
        if (!payment.cancelledAt && activeSaleIds.has(payment.saleId)) {
            entries.push({
                at: payment.createdAt,
                label: `Remboursement de ${formatNumber(payment.amount)} FCFA`
            });
        }
    }

    entries.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));

    const shown = entries.slice(0, 5);

    list.replaceChildren();
    list.hidden = shown.length === 0;

    if (empty) {
        empty.hidden = shown.length > 0;
    }

    for (const entry of shown) {
        const item = document.createElement("li");
        const text = document.createElement("span");
        const time = document.createElement("time");

        text.textContent = entry.label;
        time.dateTime = entry.at;
        time.textContent = formatTime(entry.at);

        item.append(text, time);
        list.append(item);
    }
}


/* =========================================================
   Progression des ventes
   ========================================================= */

/** Texte et style d'une variation : ▲ +12 %, ▼ −8 %, « Nouveau »... */
function describeChange(
    current: number,
    previous: number
): { text: string; tone: "up" | "down" | "neutral" } {
    const change = percentChange(current, previous);

    if (change === null) {
        return current > 0
            ? { text: "Nouveau", tone: "up" }
            : { text: "—", tone: "neutral" };
    }

    if (change > 0) return { text: `▲ +${change} %`, tone: "up" };
    if (change < 0) return { text: `▼ −${Math.abs(change)} %`, tone: "down" };

    return { text: "= stable", tone: "neutral" };
}

function renderKpiTrends(): void {
    const now = getSalesSummaryBetween(period.start, period.end);
    const before = getSalesSummaryBetween(period.previousStart, period.previousEnd);

    const pairs: Array<[string, number, number]> = [
        ["#kpiRevenueTrend", now.revenue, before.revenue],
        ["#kpiSalesTrend", now.salesCount, before.salesCount]
    ];

    for (const [selector, current, previous] of pairs) {
        const node = $(selector);

        if (!node) {
            continue;
        }

        const { text, tone } = describeChange(current, previous);

        node.className = tone === "neutral" ? "neutral" : tone;
        node.textContent =
            tone === "neutral" ? text : `${text} vs ${period.comparedTo}`;
    }
}

function currentPeriod(): SalesPeriod {
    const value = document.querySelector<HTMLSelectElement>("#chartPeriod")?.value;

    return value === "30d" || value === "12m" ? value : "7d";
}

function chartLabel(date: Date, period: SalesPeriod, index: number, length: number): string {
    if (period === "7d") {
        return date.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
    }

    if (period === "30d") {
        // Un repère tous les 5 jours, en finissant par aujourd'hui.
        return (length - 1 - index) % 5 === 0 ? String(date.getDate()) : "";
    }

    return date.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
}

function chartTitle(date: Date, period: SalesPeriod): string {
    return period === "12m"
        ? date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
        : date.toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long"
          });
}

const PERIOD_NAMES: Record<SalesPeriod, string> = {
    "7d": "7 jours précédents",
    "30d": "30 jours précédents",
    "12m": "12 mois précédents"
};

function renderSalesChart(): void {
    const bars = $("#chartBars");
    const empty = $("#chartEmpty");
    const hint = $("#chartHint");

    if (!bars) {
        return;
    }

    const period = currentPeriod();
    const trend = getSalesTrend(period);
    const max = Math.max(...trend.buckets.map((bucket) => bucket.value), 0);

    // Total + variation par rapport à la période précédente
    setText("#chartTotal", `${formatNumber(trend.total)} FCFA`);

    const trendNode = $("#chartTrend");

    if (trendNode) {
        const { text, tone } = describeChange(trend.total, trend.previousTotal);

        trendNode.className = `chart-trend${tone === "neutral" ? "" : ` is-${tone}`}`;
        trendNode.textContent =
            tone === "neutral" && text === "—"
                ? "—"
                : `${text} vs ${PERIOD_NAMES[period]}`;
    }

    if (empty) {
        empty.hidden = trend.count > 0;
    }

    bars.hidden = trend.count === 0;

    if (hint) {
        hint.hidden = trend.count === 0;
        hint.textContent = "Touchez une barre pour voir le détail.";
    }

    const columns: HTMLElement[] = trend.buckets.map((bucket, index) => {
        const column = document.createElement("button");
        const area = document.createElement("div");
        const bar = document.createElement("div");
        const label = document.createElement("span");
        const title = chartTitle(bucket.start, period);

        column.type = "button";
        column.className = "chart-col";
        column.setAttribute(
            "aria-label",
            `${title} : ${formatNumber(bucket.value)} FCFA, ${bucket.count} vente${bucket.count > 1 ? "s" : ""}`
        );

        area.className = "chart-bar-area";
        bar.className = bucket.value > 0 ? "chart-bar" : "chart-bar is-zero";
        // Hauteur définie en JavaScript (autorisé par la CSP, contrairement à style="").
        bar.style.height = max > 0 ? `${(bucket.value / max) * 100}%` : "0%";

        label.className = "chart-label";
        label.textContent = chartLabel(
            bucket.start,
            period,
            index,
            trend.buckets.length
        );

        area.append(bar);
        column.append(area, label);

        column.addEventListener("click", () => {
            bars
                .querySelectorAll(".chart-col")
                .forEach((item) => item.classList.toggle("is-selected", item === column));

            if (hint) {
                hint.textContent = `${title} : ${formatNumber(bucket.value)} FCFA (${bucket.count} vente${bucket.count > 1 ? "s" : ""})`;
            }
        });

        return column;
    });

    bars.replaceChildren(...columns);
}


/* =========================================================
   Entreprise et salutation
   ========================================================= */

function renderIdentity(): void {
    const shop = getShopSettings();
    const user = getUserProfile();

    // Nom de l'entreprise (EJDEN tant qu'il n'est pas renseigné)
    setText("#brandName", shop.name || "EJDEN");

    // Salutation selon l'heure exacte, suivie du prénom
    setText(
        "#brandGreeting",
        user.firstName
            ? `${greetingFor(new Date())}, ${user.firstName}`
            : greetingFor(new Date())
    );

    // Initiale de l'avatar : prénom, sinon entreprise, sinon « E »
    const initial = (user.firstName || shop.name || "E").charAt(0).toUpperCase();

    setText("#profileAvatar", initial);
}

// La salutation suit l'horloge sans recharger la page.
window.setInterval(renderIdentity, 60_000);

document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        renderIdentity();
    }
});


/* =========================================================
   Affichage complet
   ========================================================= */

function renderDashboard(): void {
    period = resolvePeriod(getDashboardPeriod());

    renderKpis();
    renderRecentSales();
    renderStock();
    renderReceivables();
    renderActivity();
    renderCash();
    renderClients();
    renderKpiTrends();
    renderSalesChart();
    renderIdentity();
}

renderDashboard();


/* =========================================================
   Choix de la période affichée
   ========================================================= */

const periodButton = $("#periodButton");
const periodOverlay = $("#periodOverlay");
const periodCustomForm = document.querySelector<HTMLFormElement>("#periodCustomForm");
const periodFrom = document.querySelector<HTMLInputElement>("#periodFrom");
const periodTo = document.querySelector<HTMLInputElement>("#periodTo");

function markSelectedPreset(preset: PeriodPreset): void {
    document
        .querySelectorAll<HTMLElement>(".period-option")
        .forEach((option) => {
            option.classList.toggle("is-selected", option.dataset.preset === preset);
        });
}

function openPeriodSheet(): void {
    if (!periodOverlay) {
        return;
    }

    const choice = getDashboardPeriod();
    const today = formatDay(new Date());

    markSelectedPreset(choice.preset);

    // Les dates à venir n'ont pas de ventes : on les interdit.
    if (periodFrom && periodTo) {
        periodFrom.max = today;
        periodTo.max = today;
        periodFrom.value = choice.from ?? formatDay(period.start);
        periodTo.value = choice.to ?? formatDay(period.end);
    }

    if (periodCustomForm) {
        periodCustomForm.hidden = choice.preset !== "custom";
    }

    setText("#periodError", "");

    periodOverlay.hidden = false;
    document.body.style.overflow = "hidden";
    periodButton?.setAttribute("aria-expanded", "true");

    document.querySelector<HTMLElement>(".period-option.is-selected, .period-option")?.focus();
}

function closePeriodSheet(): void {
    if (!periodOverlay || periodOverlay.hidden) {
        return;
    }

    periodOverlay.hidden = true;
    document.body.style.overflow = "";
    periodButton?.setAttribute("aria-expanded", "false");
    periodButton?.focus();
}

function applyPeriod(choice: PeriodChoice): void {
    if (!saveDashboardPeriod(choice)) {
        showToast("Impossible d'enregistrer la période.");
    }

    closePeriodSheet();
    renderDashboard();
}

periodButton?.addEventListener("click", openPeriodSheet);
$("#periodClose")?.addEventListener("click", closePeriodSheet);

// Un appui en dehors de la feuille la ferme.
periodOverlay?.addEventListener("click", (event) => {
    if (event.target === periodOverlay) {
        closePeriodSheet();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closePeriodSheet();
    }
});

document.querySelectorAll<HTMLElement>(".period-option").forEach((option) => {
    option.addEventListener("click", () => {
        const preset = option.dataset.preset;

        if (preset === "custom") {
            // Les dates se saisissent d'abord, puis on valide.
            markSelectedPreset("custom");

            if (periodCustomForm) {
                periodCustomForm.hidden = false;
            }

            periodFrom?.focus();
            return;
        }

        if (
            preset === "today" ||
            preset === "7d" ||
            preset === "1m" ||
            preset === "3m" ||
            preset === "6m"
        ) {
            applyPeriod({ preset, from: null, to: null });
        }
    });
});

periodCustomForm?.addEventListener("submit", (event) => {
    event.preventDefault();

    const from = periodFrom?.value ?? "";
    const to = periodTo?.value ?? "";

    if (!isValidDay(from) || !isValidDay(to)) {
        setText("#periodError", "Choisissez les deux dates.");
        return;
    }

    if (from > to) {
        setText("#periodError", "La date de début doit précéder la date de fin.");
        return;
    }

    if (to > formatDay(endOfDay(startOfDay(new Date())))) {
        setText("#periodError", "Les dates à venir ne peuvent pas être choisies.");
        return;
    }

    applyPeriod({ preset: "custom", from, to });
});

$("#chartPeriod")?.addEventListener("change", renderSalesChart);

// Retour depuis une autre page (cache de navigation) : on recalcule.
window.addEventListener("pageshow", renderDashboard);


/* =========================================================
   Navigation
   ========================================================= */

// Modules pas encore construits : un message clair, pas un lien mort.
document.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
        return;
    }

    const soon = target.closest<HTMLElement>("[data-soon]");

    if (!soon) {
        return;
    }

    event.preventDefault();

    // Ferme le panneau « actions rapides » s'il est ouvert.
    const overlay = $("#quickActionsOverlay");

    if (overlay?.classList.contains("is-open")) {
        overlay.classList.remove("is-open");
        document.body.style.overflow = "";
    }

    showToast(`${soon.dataset.soon ?? "Ce module"} : bientôt disponible.`);
});

setupMoreMenu({
    trigger: $("#mobileMoreButton"),
    onSoon: (label) => showToast(`${label} : bientôt disponible.`)
});

$("#notificationButton")?.addEventListener("click", () => {
    const alerts = getStockSummary(0);

    if (alerts.lowCount + alerts.outCount === 0) {
        showToast("Aucune notification.");
        return;
    }

    window.location.href =
        alerts.outCount > 0 && alerts.lowCount === 0
            ? "stock.html?filter=out"
            : "stock.html?filter=low";
});

// Recherche du haut : ouvre la page Produits avec la recherche.
const globalSearch = document.querySelector<HTMLInputElement>("#globalSearch");

globalSearch?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
        return;
    }

    const query = globalSearch.value.trim().slice(0, 80);

    if (query) {
        window.location.href = `produits.html?q=${encodeURIComponent(query)}`;
    }
});
