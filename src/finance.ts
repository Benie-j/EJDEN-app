// src/finances.ts
// Module Finances : vue d'ensemble de la santé financière du commerce.
// Tous les chiffres sont calculés à partir des vraies données (ventes,
// dépenses, caisse, crédits, dettes, stock). Aucun texte venant des
// données n'est injecté en HTML : tout passe par textContent.

import {
    EXPENSE_CATEGORIES,
    type PaymentMethod,
    type PeriodPreset,
    getCashFlowBetween,
    getCashSummary,
    getCreditsSummary,
    getExpenses,
    getSales,
    getStockSummary,
    getStockValue,
    getSuppliersDebtTotal,
    isValidDay,
    percentChange
} from "./storage.js";
import {
    PRESET_LABELS,
    endOfDay,
    formatDay,
    parseDay,
    resolvePeriod,
    startOfDay
} from "./period.js";
import { createToast, el, money } from "./ui.js";

/* =========================================================
   PÉRIODE CHOISIE (mémorisée sur l'appareil)
   ========================================================= */

interface FinancePeriod {
    preset: PeriodPreset;
    from: string | null;
    to: string | null;
}

const PERIOD_KEY = "ejden_finances_period";
const PRESETS: PeriodPreset[] = ["today", "7d", "1m", "3m", "6m", "custom"];

function isPreset(value: unknown): value is PeriodPreset {
    return PRESETS.some((preset) => preset === value);
}

function loadPeriod(): FinancePeriod {
    const fallback: FinancePeriod = { preset: "1m", from: null, to: null };

    try {
        const raw = localStorage.getItem(PERIOD_KEY);

        if (raw === null) {
            return fallback;
        }

        const data: unknown = JSON.parse(raw);

        if (typeof data !== "object" || data === null) {
            return fallback;
        }

        const { preset, from, to } = data as Record<string, unknown>;

        if (!isPreset(preset)) {
            return fallback;
        }

        if (preset !== "custom") {
            return { preset, from: null, to: null };
        }

        if (
            isValidDay(from) &&
            isValidDay(to) &&
            parseDay(from).getTime() <= parseDay(to).getTime()
        ) {
            return { preset, from, to };
        }

        return fallback;
    } catch {
        return fallback;
    }
}

function savePeriod(period: FinancePeriod): void {
    try {
        localStorage.setItem(PERIOD_KEY, JSON.stringify(period));
    } catch {
        // Stockage plein ou indisponible : la période reste valable
        // pour la session en cours.
    }
}

/* =========================================================
   CALCULS
   ========================================================= */

interface MethodTotal {
    count: number;
    amount: number;
}

interface ProductMargin {
    name: string;
    quantity: number;
    margin: number;
}

interface Figures {
    salesCount: number;
    revenue: number;
    // Marge brute, calculée sur les ventes dont le prix d'achat est connu.
    margin: number | null;
    // Chiffre d'affaires de ces ventes (pour le taux de marge).
    costedRevenue: number;
    // Charges d'exploitation (dépenses hors « Marchandises »).
    charges: number;
    goodsExpenses: number;
    expensesByCategory: Map<string, number>;
    byMethod: Map<PaymentMethod, MethodTotal>;
    products: ProductMargin[];
}

function computeFigures(start: Date, end: Date): Figures {
    const from = start.getTime();
    const to = end.getTime();

    const figures: Figures = {
        salesCount: 0,
        revenue: 0,
        margin: null,
        costedRevenue: 0,
        charges: 0,
        goodsExpenses: 0,
        expensesByCategory: new Map(),
        byMethod: new Map(),
        products: []
    };

    const productMap = new Map<string, ProductMargin>();
    let margin = 0;
    let marginKnown = false;

    for (const sale of getSales()) {
        const at = new Date(sale.createdAt).getTime();

        if (sale.cancelledAt || Number.isNaN(at) || at < from || at > to) {
            continue;
        }

        figures.salesCount += 1;
        figures.revenue += sale.total;

        const method = figures.byMethod.get(sale.paymentMethod) ?? {
            count: 0,
            amount: 0
        };

        method.count += 1;
        method.amount += sale.total;
        figures.byMethod.set(sale.paymentMethod, method);

        if (!sale.items.every((item) => item.unitCost !== undefined)) {
            continue;
        }

        let saleMargin = 0;

        for (const item of sale.items) {
            const itemMargin =
                (item.unitPrice - (item.unitCost ?? 0)) * item.quantity;

            saleMargin += itemMargin;

            const entry = productMap.get(item.productId) ?? {
                name: item.productName,
                quantity: 0,
                margin: 0
            };

            entry.quantity += item.quantity;
            entry.margin += itemMargin;
            productMap.set(item.productId, entry);
        }

        margin += saleMargin - sale.discount;
        marginKnown = true;
        figures.costedRevenue += sale.total;
    }

    figures.margin = marginKnown ? margin : null;

    for (const expense of getExpenses()) {
        const at = new Date(expense.createdAt).getTime();

        if (Number.isNaN(at) || at < from || at > to) {
            continue;
        }

        figures.expensesByCategory.set(
            expense.category,
            (figures.expensesByCategory.get(expense.category) ?? 0) +
                expense.amount
        );

        if (expense.category === "marchandises") {
            figures.goodsExpenses += expense.amount;
        } else {
            figures.charges += expense.amount;
        }
    }

    figures.products = [...productMap.values()]
        .filter((product) => product.margin > 0)
        .sort((a, b) => b.margin - a.margin)
        .slice(0, 5);

    return figures;
}

function netResult(figures: Figures): number | null {
    return figures.margin === null ? null : figures.margin - figures.charges;
}

/* =========================================================
   AFFICHAGE : petits composants
   ========================================================= */

const METHOD_LABELS: Record<PaymentMethod, string> = {
    cash: "Espèces",
    mobile_money: "Mobile money",
    card: "Carte",
    other: "Autre",
    credit: "À crédit"
};

const CATEGORY_LABELS = new Map<string, string>(
    EXPENSE_CATEGORIES.map((category) => [category.id, category.label])
);

function percent(value: number): string {
    return `${Math.round(value)} %`;
}

function section(title: string): HTMLElement {
    const box = el("section", "module-section");

    box.append(el("h2", undefined, title));

    return box;
}

function metricRow(
    label: string,
    value: string,
    options: { note?: string; tone?: "positive" | "negative"; total?: boolean } = {}
): HTMLElement {
    const row = el("div", "metric-row");
    const text = el("span", undefined, label);

    if (options.note) {
        text.append(el("small", undefined, options.note));
    }

    if (options.tone) row.classList.add(`is-${options.tone}`);
    if (options.total) row.classList.add("is-total");

    row.append(text, el("strong", undefined, value));

    return row;
}

function deltaBadge(
    current: number,
    previous: number,
    comparedTo: string,
    goodWhenUp: boolean
): HTMLElement | null {
    const change = percentChange(current, previous);

    if (change === null) {
        return null;
    }

    const sign = change > 0 ? "+" : "";
    const badge = el(
        "span",
        "delta",
        `${sign}${change} % vs ${comparedTo}`
    );

    if (change !== 0) {
        badge.classList.add(
            change > 0 === goodWhenUp ? "is-good" : "is-bad"
        );
    }

    return badge;
}

function barRow(
    label: string,
    value: string,
    ratio: number,
    warning = false
): HTMLElement {
    const row = el("div", "bar-row");
    const head = el("div", "bar-head");
    const track = el("div", "bar-track");
    const fill = el("div", "bar-fill");

    head.append(el("span", undefined, label), el("strong", undefined, value));

    fill.style.width = `${Math.max(2, Math.min(100, ratio * 100))}%`;

    if (warning) fill.classList.add("is-warning");

    track.append(fill);
    row.append(head, track);

    return row;
}

function kpiCard(
    label: string,
    value: string,
    extra: Array<HTMLElement | null>
): HTMLElement {
    const card = el("div", "summary-card");

    card.append(el("span", undefined, label), el("strong", undefined, value));

    for (const node of extra) {
        if (node) card.append(node);
    }

    return card;
}

/* =========================================================
   AFFICHAGE : sections
   ========================================================= */

function buildResultCard(
    current: Figures,
    previous: Figures,
    comparedTo: string
): HTMLElement {
    const result = netResult(current);
    const card = el("section", "result-card");

    card.append(el("span", undefined, "Résultat net estimé"));

    if (result === null) {
        card.append(
            el("strong", "result-value", "—"),
            el(
                "p",
                undefined,
                "Aucune vente de cette période n'a de prix d'achat connu : la marge, et donc le résultat, ne peuvent pas être calculés."
            )
        );

        return card;
    }

    card.classList.add(result >= 0 ? "is-positive" : "is-negative");
    card.append(el("strong", "result-value", money(result)));

    const previousResult = netResult(previous);

    if (previousResult !== null) {
        const badge = deltaBadge(result, previousResult, comparedTo, true);

        if (badge) card.append(badge);
    }

    card.append(
        el(
            "p",
            undefined,
            `Marge brute ${money(current.margin ?? 0)} − charges ${money(current.charges)}`
        )
    );

    if (current.revenue > 0 && current.costedRevenue < current.revenue) {
        card.append(
            el(
                "p",
                undefined,
                `Calcul basé sur ${percent((current.costedRevenue / current.revenue) * 100)} du chiffre d'affaires : les autres ventes n'ont pas de prix d'achat enregistré.`
            )
        );
    }

    return card;
}

function buildKpis(
    current: Figures,
    previous: Figures,
    comparedTo: string
): HTMLElement {
    const grid = el("section", "summary-grid");

    const marginRate =
        current.margin !== null && current.costedRevenue > 0
            ? el(
                  "small",
                  "kpi-note",
                  `Taux de marge ${percent((current.margin / current.costedRevenue) * 100)}`
              )
            : null;

    const average =
        current.salesCount > 0
            ? el(
                  "small",
                  "kpi-note",
                  `Panier moyen ${money(current.revenue / current.salesCount)}`
              )
            : null;

    grid.append(
        kpiCard("Chiffre d'affaires", money(current.revenue), [
            deltaBadge(current.revenue, previous.revenue, comparedTo, true)
        ]),
        kpiCard(
            "Marge brute",
            current.margin === null ? "—" : money(current.margin),
            [marginRate]
        ),
        kpiCard("Charges", money(current.charges), [
            deltaBadge(current.charges, previous.charges, comparedTo, false)
        ]),
        kpiCard("Ventes", String(current.salesCount), [average])
    );

    return grid;
}

function buildAlerts(current: Figures): HTMLElement | null {
    const alerts: Array<{ text: string; danger: boolean }> = [];
    const result = netResult(current);
    const credits = getCreditsSummary();
    const stock = getStockSummary(0);
    const debt = getSuppliersDebtTotal();
    const balance = getCashSummary().balance;

    if (result !== null && result < 0) {
        alerts.push({
            text: `Les charges dépassent la marge de ${money(-result)} sur cette période.`,
            danger: true
        });
    }

    if (balance < 0) {
        alerts.push({
            text: `La caisse est négative (${money(balance)}) : vérifiez les entrées et sorties.`,
            danger: true
        });
    }

    if (credits.overdueAmount > 0) {
        alerts.push({
            text: `${money(credits.overdueAmount)} de crédits clients sont en retard (${credits.overdueDebtors} client${credits.overdueDebtors > 1 ? "s" : ""}).`,
            danger: false
        });
    }

    if (debt > 0 && debt > balance) {
        alerts.push({
            text: `Vous devez ${money(debt)} aux fournisseurs, plus que le solde de la caisse.`,
            danger: false
        });
    }

    if (stock.outCount > 0 || stock.lowCount > 0) {
        alerts.push({
            text: `Stock : ${stock.outCount} produit${stock.outCount > 1 ? "s" : ""} en rupture, ${stock.lowCount} bientôt épuisé${stock.lowCount > 1 ? "s" : ""}.`,
            danger: false
        });
    }

    if (alerts.length === 0) {
        return null;
    }

    const box = section("Points d'attention");
    const list = el("ul", "alert-list");

    for (const alert of alerts) {
        const item = el("li", alert.danger ? "is-danger" : undefined, alert.text);

        list.append(item);
    }

    box.append(list);

    return box;
}

function buildCashFlow(start: Date, end: Date): HTMLElement {
    const { cashIn, cashOut } = getCashFlowBetween(start, end);
    const net = cashIn - cashOut;
    const box = section("Trésorerie de la période");

    box.append(
        metricRow("Entrées d'argent", money(cashIn)),
        metricRow("Sorties d'argent", money(cashOut)),
        metricRow("Variation de la caisse", `${net > 0 ? "+" : ""}${money(net)}`, {
            tone: net >= 0 ? "positive" : "negative",
            total: true
        })
    );

    return box;
}

function buildPosition(): HTMLElement {
    const balance = getCashSummary().balance;
    const credits = getCreditsSummary();
    const stock = getStockValue();
    const debt = getSuppliersDebtTotal();
    const equity = balance + credits.total + stock.cost - debt;
    const box = section("Situation actuelle");

    box.append(
        metricRow("Trésorerie (caisse)", money(balance)),
        metricRow("Crédits à encaisser", money(credits.total), {
            note:
                credits.debtors > 0
                    ? `${credits.debtors} client${credits.debtors > 1 ? "s" : ""}`
                    : undefined
        }),
        metricRow("Stock (au prix d'achat)", money(stock.cost), {
            note: `Valeur de vente : ${money(stock.retail)}`
        }),
        metricRow("Dettes fournisseurs", `− ${money(debt)}`),
        metricRow("Situation nette estimée", money(equity), {
            tone: equity >= 0 ? "positive" : "negative",
            total: true
        })
    );

    box.append(
        el(
            "p",
            "section-note",
            "Situation nette = caisse + crédits à encaisser + stock au prix d'achat − dettes fournisseurs."
        )
    );

    return box;
}

function buildExpenses(current: Figures): HTMLElement {
    const box = section("Dépenses par catégorie");
    const entries = [...current.expensesByCategory.entries()].sort(
        (a, b) => b[1] - a[1]
    );
    const total = entries.reduce((sum, [, amount]) => sum + amount, 0);

    if (total <= 0) {
        box.append(el("p", "section-note", "Aucune dépense sur cette période."));

        return box;
    }

    for (const [id, amount] of entries) {
        box.append(
            barRow(
                CATEGORY_LABELS.get(id) ?? "Autre",
                `${money(amount)} · ${percent((amount / total) * 100)}`,
                amount / total,
                id === "marchandises"
            )
        );
    }

    if (current.goodsExpenses > 0) {
        box.append(
            el(
                "p",
                "section-note",
                "Les achats de marchandises ne sont pas comptés dans les charges : leur coût est déjà déduit dans la marge, au moment de la vente."
            )
        );
    }

    return box;
}

function buildMethods(current: Figures): HTMLElement {
    const box = section("Ventes par mode de paiement");

    if (current.revenue <= 0) {
        box.append(el("p", "section-note", "Aucune vente sur cette période."));

        return box;
    }

    const entries = [...current.byMethod.entries()].sort(
        (a, b) => b[1].amount - a[1].amount
    );

    for (const [method, data] of entries) {
        box.append(
            barRow(
                METHOD_LABELS[method],
                `${money(data.amount)} · ${percent((data.amount / current.revenue) * 100)}`,
                data.amount / current.revenue,
                method === "credit"
            )
        );
    }

    return box;
}

function buildTopProducts(current: Figures): HTMLElement {
    const box = section("Produits les plus rentables");

    if (current.products.length === 0) {
        box.append(
            el(
                "p",
                "section-note",
                "Pas encore de marge calculable sur cette période."
            )
        );

        return box;
    }

    const list = el("ol", "rank-list");

    current.products.forEach((product, index) => {
        const item = el("li");
        const name = el("span", undefined, product.name);

        name.append(
            el(
                "small",
                undefined,
                `${product.quantity.toLocaleString("fr-FR")} vendu${product.quantity > 1 ? "s" : ""}`
            )
        );

        item.append(
            el("span", "rank-index", String(index + 1)),
            name,
            el("strong", undefined, money(product.margin))
        );
        list.append(item);
    });

    box.append(
        list,
        el("p", "section-note", "Marge avant remise globale de la vente.")
    );

    return box;
}

/* =========================================================
   PAGE
   ========================================================= */

const toast = createToast();
const chipsElement = document.querySelector<HTMLElement>("#periodChips");
const customPanel = document.querySelector<HTMLElement>("#customPeriod");
const fromInput = document.querySelector<HTMLInputElement>("#periodFrom");
const toInput = document.querySelector<HTMLInputElement>("#periodTo");
const applyButton = document.querySelector<HTMLButtonElement>("#applyPeriod");
const captionElement = document.querySelector<HTMLElement>("#periodCaption");
const contentElement = document.querySelector<HTMLElement>("#financesContent");

if (!chipsElement || !contentElement) {
    throw new Error("EJDEN : la page Finances est incomplète.");
}

const chips: HTMLElement = chipsElement;
const content: HTMLElement = contentElement;

let period = loadPeriod();

function renderChips(): void {
    chips.replaceChildren(
        ...PRESETS.map((preset) => {
            const chip = el(
                "button",
                "period-chip",
                preset === "custom" ? "Personnalisée" : PRESET_LABELS[preset]
            );

            chip.type = "button";
            chip.setAttribute("aria-pressed", String(preset === period.preset));

            if (preset === period.preset) chip.classList.add("is-active");

            chip.addEventListener("click", () => selectPreset(preset));

            return chip;
        })
    );
}

function selectPreset(preset: PeriodPreset): void {
    if (preset === "custom") {
        const today = formatDay(new Date());

        if (fromInput) fromInput.value = period.from ?? today;
        if (toInput) toInput.value = period.to ?? today;

        if (customPanel) customPanel.hidden = false;

        period = {
            preset: "custom",
            from: period.from ?? today,
            to: period.to ?? today
        };
    } else {
        if (customPanel) customPanel.hidden = true;

        period = { preset, from: null, to: null };
    }

    savePeriod(period);
    render();
}

applyButton?.addEventListener("click", () => {
    const from = fromInput?.value ?? "";
    const to = toInput?.value ?? "";

    if (!isValidDay(from) || !isValidDay(to)) {
        toast("Choisissez deux dates valides.");
        return;
    }

    if (parseDay(from).getTime() > parseDay(to).getTime()) {
        toast("La date de début doit précéder la date de fin.");
        return;
    }

    period = { preset: "custom", from, to };
    savePeriod(period);
    render();
});

function render(): void {
    const resolved = resolvePeriod(period);
    const start = startOfDay(resolved.start);
    const end = endOfDay(resolved.end);

    renderChips();

    if (captionElement) {
        captionElement.textContent =
            period.preset === "custom"
                ? resolved.buttonLabel
                : `${PRESET_LABELS[period.preset]} · comparé à la ${resolved.comparedTo === "hier" ? "veille" : "période précédente"}`;
    }

    const current = computeFigures(start, end);
    const previous = computeFigures(
        resolved.previousStart,
        resolved.previousEnd
    );

    const blocks: Array<HTMLElement | null> = [
        buildResultCard(current, previous, resolved.comparedTo),
        buildKpis(current, previous, resolved.comparedTo),
        buildAlerts(current),
        buildCashFlow(start, end),
        buildPosition(),
        buildExpenses(current),
        buildMethods(current),
        buildTopProducts(current)
    ];

    content.replaceChildren(
        ...blocks.filter((block): block is HTMLElement => block !== null)
    );
}

if (period.preset === "custom" && customPanel) {
    customPanel.hidden = false;

    if (fromInput && period.from) fromInput.value = period.from;
    if (toInput && period.to) toInput.value = period.to;
}

render();
