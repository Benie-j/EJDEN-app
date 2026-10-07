// src/report-engine.ts
// Moteur de calcul du module Rapports : lit les données EJDEN réelles, applique les
// filtres et produit un rapport structuré. Aucune donnée fictive : sans données,
// les listes sont vides et les analyses sont marquées « indisponibles ».

import {
    type PaymentMethod,
    type Sale,
    CREDIT_OVERDUE_DAYS,
    getClients,
    getCreditPayments,
    getProducts,
    getRemainingMap,
    getSales,
    getStockMovements
} from "./storage.js";
import {
    type Confidence,
    MIN,
    coefVariation,
    confidenceFromSample,
    formatPercent,
    linearTrend,
    mean,
    median,
    movingAverage,
    percentChange,
    stdDev,
    sum,
    zScore
} from "./report-stats.js";

/* ---------- Périodes ---------- */

export type PeriodKey =
    | "today" | "yesterday" | "week" | "last_week" | "month" | "last_month"
    | "year" | "last_year" | "7d" | "30d" | "90d" | "custom";

export type CompareKey = "none" | "previous" | "duration" | "last_year" | "custom";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
    today: "Aujourd'hui", yesterday: "Hier", week: "Cette semaine", last_week: "Semaine précédente",
    month: "Ce mois", last_month: "Mois précédent", year: "Cette année", last_year: "Année précédente",
    "7d": "7 derniers jours", "30d": "30 derniers jours", "90d": "90 derniers jours", custom: "Période personnalisée"
};

export const COMPARE_LABELS: Record<CompareKey, string> = {
    none: "Aucune comparaison", previous: "Période précédente", duration: "Même durée précédente",
    last_year: "Même période, année précédente", custom: "Période personnalisée"
};

export interface Range { start: Date; end: Date }

const DAY = 86_400_000;

export function sod(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
export function eod(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }
function addDays(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

export function dayCount(r: Range): number {
    return Math.max(1, Math.round((sod(r.end).getTime() - sod(r.start).getTime()) / DAY) + 1);
}

export function resolvePeriod(key: PeriodKey, custom?: Range, now = new Date()): Range {
    const today = sod(now);
    const mondayOffset = (today.getDay() + 6) % 7;
    const monday = addDays(today, -mondayOffset);
    const y = now.getFullYear();
    const m = now.getMonth();

    switch (key) {
        case "today": return { start: today, end: eod(today) };
        case "yesterday": return { start: addDays(today, -1), end: eod(addDays(today, -1)) };
        case "week": return { start: monday, end: eod(today) };
        case "last_week": return { start: addDays(monday, -7), end: eod(addDays(monday, -1)) };
        case "month": return { start: new Date(y, m, 1), end: eod(today) };
        case "last_month": return { start: new Date(y, m - 1, 1), end: eod(new Date(y, m, 0)) };
        case "year": return { start: new Date(y, 0, 1), end: eod(today) };
        case "last_year": return { start: new Date(y - 1, 0, 1), end: eod(new Date(y - 1, 11, 31)) };
        case "7d": return { start: addDays(today, -6), end: eod(today) };
        case "30d": return { start: addDays(today, -29), end: eod(today) };
        case "90d": return { start: addDays(today, -89), end: eod(today) };
        case "custom": {
            const c = custom ?? { start: today, end: today };
            const a = sod(c.start);
            const b = sod(c.end);

            return a <= b ? { start: a, end: eod(b) } : { start: b, end: eod(a) };
        }
    }
}

export function resolveComparison(
    key: CompareKey, period: PeriodKey, current: Range, custom?: Range
): Range | null {
    if (key === "none") return null;

    if (key === "custom") return custom ? { start: sod(custom.start), end: eod(custom.end) } : null;

    if (key === "last_year") {
        return {
            start: new Date(current.start.getFullYear() - 1, current.start.getMonth(), current.start.getDate()),
            end: eod(new Date(current.end.getFullYear() - 1, current.end.getMonth(), current.end.getDate()))
        };
    }

    const n = dayCount(current);

    // « Période précédente » respecte le calendrier pour mois / année / semaine.
    if (key === "previous") {
        if (period === "month" || period === "last_month") {
            const s = new Date(current.start.getFullYear(), current.start.getMonth() - 1, 1);
            const lastDay = new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate();
            const e = new Date(s.getFullYear(), s.getMonth(), Math.min(current.end.getDate(), lastDay));

            return { start: s, end: eod(period === "last_month" ? new Date(s.getFullYear(), s.getMonth() + 1, 0) : e) };
        }

        if (period === "year" || period === "last_year") {
            const s = new Date(current.start.getFullYear() - 1, 0, 1);

            return { start: s, end: eod(new Date(s.getFullYear(), current.end.getMonth(), current.end.getDate())) };
        }
    }

    return { start: addDays(sod(current.start), -n), end: eod(addDays(sod(current.start), -1)) };
}

/* ---------- Filtres ---------- */

export type StatusFilter = "all" | "active" | "cancelled" | "credit";

export interface Filters {
    range: Range;
    productId: string;      // "" = tous
    category: string;       // "" = toutes
    clientId: string;       // "" = tous
    method: PaymentMethod | "";
    status: StatusFilter;
}

export function emptyFilters(range: Range): Filters {
    return { range, productId: "", category: "", clientId: "", method: "", status: "active" };
}

/* ---------- Données normalisées ---------- */

interface Line { productId: string; name: string; qty: number; amount: number; cost: number | null }

interface SaleView {
    sale: Sale;
    at: number;
    lines: Line[];
    amount: number;          // montant filtré (CA de la vente)
    cancelled: boolean;
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
    cash: "Espèces", mobile_money: "Mobile Money", card: "Carte", other: "Autre", credit: "Crédit"
};

export function methodLabel(m: PaymentMethod): string { return METHOD_LABEL[m]; }

function viewsOf(sales: Sale[], f: Filters, range: Range, categoryOf: Map<string, string>): SaleView[] {
    const from = range.start.getTime();
    const to = range.end.getTime();
    const itemFilter = f.productId !== "" || f.category !== "";
    const out: SaleView[] = [];

    for (const sale of sales) {
        const at = new Date(sale.createdAt).getTime();

        if (!Number.isFinite(at) || at < from || at > to) continue;
        if (f.method && sale.paymentMethod !== f.method) continue;
        if (f.clientId && sale.customerId !== f.clientId) continue;

        const cancelled = Boolean(sale.cancelledAt);

        // « active » garde les annulées dans la vue : elles sont comptées à part, jamais dans le CA.
        if (f.status === "cancelled" && !cancelled) continue;
        if (f.status === "credit" && (cancelled || sale.remaining <= 0)) continue;

        let items = sale.items;

        if (f.productId) items = items.filter((i) => i.productId === f.productId);
        if (f.category) items = items.filter((i) => (categoryOf.get(i.productId) ?? "") === f.category);
        if (itemFilter && items.length === 0) continue;

        const lines: Line[] = items.map((i) => ({
            productId: i.productId, name: i.productName, qty: i.quantity, amount: i.total,
            cost: i.unitCost === undefined ? null : i.unitCost * i.quantity
        }));

        out.push({ sale, at, lines, amount: itemFilter ? sum(lines.map((l) => l.amount)) : sale.total, cancelled });
    }

    return out;
}

/* ---------- Rapport ---------- */

export interface Totals {
    revenue: number; count: number; units: number; average: number;
    cancelledCount: number; cancelledAmount: number; margin: number | null;
}

export interface ProductRow {
    id: string; name: string; category: string; qty: number; amount: number; share: number;
    frequency: number; prevQty: number | null; abc: "A" | "B" | "C" | null;
}

export interface StockRow {
    id: string; name: string; stock: number; threshold: number; value: number;
    sold: number; dailyRate: number | null; daysLeft: number | null; status: "rupture" | "faible" | "ok";
    rotation: number | null;
}

export interface ClientRow {
    id: string; name: string; count: number; amount: number; average: number;
    lastAt: number | null; intervalDays: number | null; isNew: boolean; status: "actif" | "inactif";
}

export interface DayPoint { day: string; label: string; revenue: number; count: number; date: Date }

export type InsightLevel = "info" | "positif" | "attention" | "alerte";

export interface Insight {
    id: string; type: string; level: InsightLevel; title: string; explanation: string;
    period: string; data: string; confidence: Confidence | null;
}

export interface Unavailable { available: false; reason: string }
export type Maybe<T> = ({ available: true } & T) | Unavailable;

export interface Report {
    filters: Filters;
    comparison: Range | null;
    historyDays: number;
    totals: Totals;
    previous: Totals | null;
    previousNote: string | null;
    daily: DayPoint[];
    weekly: Array<{ label: string; revenue: number; count: number }>;
    monthly: Array<{ label: string; revenue: number; count: number }>;
    weekdays: Array<{ label: string; revenue: number; count: number; avgPerDay: number }>;
    hours: Array<{ hour: number; count: number; revenue: number }>;
    products: ProductRow[];
    noSaleProducts: Array<{ id: string; name: string; stock: number }>;
    stock: { rows: StockRow[]; value: number; entries: number; exits: number; movements: Movement[]; rotation: number | null };
    clients: { rows: ClientRow[]; total: number; newCount: number; active: number; recurring: number; inactive: number; avgAmount: number };
    payments: { methods: Array<{ method: PaymentMethod; label: string; count: number; amount: number; share: number }>; collected: number; toReceive: number; creditSales: number; creditSalesAmount: number; repaid: number; overdue: number; overdueCount: number; creditList: Array<{ date: number; client: string; amount: number; remaining: number }>; creditShare: number; prevCreditShare: number | null };
    team: { users: Array<{ name: string; count: number; amount: number; cancelled: number }>; note: string };
    trend: Maybe<{ slopePerDay: number; relative: number; r2: number; direction: "hausse" | "baisse" | "stable"; acceleration: "accélération" | "ralentissement" | "stable" | null; ma7: Array<number | null>; confidence: Confidence }>;
    anomalies: Maybe<{ low: number; high: number; items: Array<{ day: string; value: number; z: number; kind: "élevée" | "faible" }>; cv: number | null; confidence: Confidence }>;
    seasonality: Maybe<{ weekday: Array<{ label: string; index: number }>; confidence: Confidence; monthNote: string }>;
    forecast: Maybe<{ nextDays: number; expectedRevenue: number; low: number; high: number; confidence: Confidence }>;
    variability: Maybe<{ mean: number; median: number; std: number; variance: number; cv: number | null }>;
    insights: Insight[];
}

export interface Movement {
    at: number; product: string; type: string; quantity: number; before: number; after: number; reason: string;
}

const WD = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function dayKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtDay(d: Date): string {
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function rangeLabel(r: Range): string {
    return dayCount(r) === 1 ? fmtDay(r.start) : `${fmtDay(r.start)} → ${fmtDay(r.end)}`;
}

function totalsOf(views: SaleView[]): Totals {
    const ok = views.filter((v) => !v.cancelled);
    const cancelled = views.filter((v) => v.cancelled);
    const revenue = sum(ok.map((v) => v.amount));
    let cost = 0;
    let known = true;

    for (const v of ok) for (const l of v.lines) {
        if (l.cost === null) known = false; else cost += l.cost;
    }

    return {
        revenue, count: ok.length, units: sum(ok.flatMap((v) => v.lines.map((l) => l.qty))),
        average: ok.length ? revenue / ok.length : 0,
        cancelledCount: cancelled.length, cancelledAmount: sum(cancelled.map((v) => v.amount)),
        margin: ok.length && known ? revenue - cost : null
    };
}

function dailySeries(views: SaleView[], range: Range): DayPoint[] {
    const map = new Map<string, { revenue: number; count: number }>();

    for (const v of views) {
        if (v.cancelled) continue;

        const k = dayKey(new Date(v.at));
        const e = map.get(k) ?? { revenue: 0, count: 0 };

        e.revenue += v.amount;
        e.count += 1;
        map.set(k, e);
    }

    const out: DayPoint[] = [];

    for (let d = sod(range.start); d <= range.end; d = addDays(d, 1)) {
        const e = map.get(dayKey(d));

        out.push({
            day: dayKey(d), date: d, revenue: e?.revenue ?? 0, count: e?.count ?? 0,
            label: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
        });
    }

    return out;
}

function weekStart(d: Date): Date { return addDays(sod(d), -((d.getDay() + 6) % 7)); }

function groupBy(points: DayPoint[], keyOf: (d: Date) => { key: string; label: string }) {
    const map = new Map<string, { label: string; revenue: number; count: number }>();

    for (const p of points) {
        const { key, label } = keyOf(p.date);
        const e = map.get(key) ?? { label, revenue: 0, count: 0 };

        e.revenue += p.revenue;
        e.count += p.count;
        map.set(key, e);
    }

    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
}

export function computeReport(f: Filters, compare: Range | null, now = new Date()): Report {
    const sales = getSales();
    const products = getProducts();
    const clients = getClients();
    const categoryOf = new Map(products.map((p) => [p.id, p.category ?? ""]));
    const productOf = new Map(products.map((p) => [p.id, p]));
    const views = viewsOf(sales, f, f.range, categoryOf);
    const totals = totalsOf(views);
    const nDays = dayCount(f.range);

    /* Historique disponible (toutes ventes non annulées, sans filtre) */
    const times = sales.filter((s) => !s.cancelledAt).map((s) => new Date(s.createdAt).getTime()).filter(Number.isFinite);
    const firstAt = times.length ? Math.min(...times) : null;
    const historyDays = firstAt === null ? 0 : Math.max(1, Math.round((sod(now).getTime() - sod(new Date(firstAt)).getTime()) / DAY) + 1);

    /* Comparaison : seulement si la période comparée a de la donnée ET existe dans l'historique */
    let previous: Totals | null = null;
    let previousNote: string | null = null;
    let prevViews: SaleView[] = [];

    if (compare) {
        prevViews = viewsOf(sales, f, compare, categoryOf);

        if (firstAt === null || compare.end.getTime() < firstAt) {
            previousNote = "Comparaison indisponible : aucune donnée n'existe avant cette période.";
        } else if (prevViews.length === 0) {
            previousNote = "Comparaison indisponible : aucune vente sur la période comparée.";
        } else {
            previous = totalsOf(prevViews);
        }
    }

    const daily = dailySeries(views, f.range);
    const weekly = groupBy(daily, (d) => { const w = weekStart(d); return { key: dayKey(w), label: `Sem. ${w.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}` }; });
    const monthly = groupBy(daily, (d) => ({ key: `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`, label: d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" }) }));

    const okViews = views.filter((v) => !v.cancelled);
    const wdTotals = WD.map((label, i) => {
        const days = daily.filter((d) => d.date.getDay() === i);

        return { label, revenue: sum(days.map((d) => d.revenue)), count: sum(days.map((d) => d.count)), avgPerDay: days.length ? sum(days.map((d) => d.revenue)) / days.length : 0 };
    });
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, revenue: 0 }));

    for (const v of okViews) {
        const h = hours[new Date(v.at).getHours()]!;

        h.count += 1;
        h.revenue += v.amount;
    }

    /* Produits */
    const pm = new Map<string, { name: string; qty: number; amount: number; days: Set<string> }>();

    for (const v of okViews) for (const l of v.lines) {
        const e = pm.get(l.productId) ?? { name: l.name, qty: 0, amount: 0, days: new Set<string>() };

        e.qty += l.qty;
        e.amount += l.amount;
        e.days.add(dayKey(new Date(v.at)));
        pm.set(l.productId, e);
    }

    const prevQty = new Map<string, number>();

    if (previous) for (const v of prevViews) if (!v.cancelled) for (const l of v.lines) prevQty.set(l.productId, (prevQty.get(l.productId) ?? 0) + l.qty);

    const prodTotal = sum([...pm.values()].map((e) => e.amount));
    const sortedProducts = [...pm.entries()].sort((a, b) => b[1].amount - a[1].amount);
    let cumulative = 0;
    const productRows: ProductRow[] = sortedProducts.map(([id, e]) => {
        const share = prodTotal > 0 ? (e.amount / prodTotal) * 100 : 0;
        const before = cumulative;

        cumulative += share;

        return {
            id, name: productOf.get(id)?.name ?? e.name, category: categoryOf.get(id) || "Sans catégorie",
            qty: e.qty, amount: e.amount, share, frequency: e.days.size / nDays,
            prevQty: previous ? (prevQty.get(id) ?? 0) : null,
            abc: sortedProducts.length >= 10 ? (before < 80 ? "A" : before < 95 ? "B" : "C") : null
        };
    });
    const noSaleProducts = products
        .filter((p) => !pm.has(p.id) && (f.productId === "" || f.productId === p.id) && (f.category === "" || (p.category ?? "") === f.category))
        .map((p) => ({ id: p.id, name: p.name, stock: p.stock }));

    /* Stock (état actuel + rythme de vente observé sur la période) */
    const rows: StockRow[] = products
        .filter((p) => (f.productId === "" || f.productId === p.id) && (f.category === "" || (p.category ?? "") === f.category))
        .map((p) => {
            const sold = pm.get(p.id)?.qty ?? 0;
            const daysObserved = Math.min(nDays, historyDays || nDays);
            const rate = historyDays >= 7 && sold > 0 ? sold / daysObserved : null;

            return {
                id: p.id, name: p.name, stock: p.stock, threshold: p.stockThreshold, value: p.stock * p.purchasePrice,
                sold, dailyRate: rate, daysLeft: rate && rate > 0 ? p.stock / rate : null,
                status: p.stock <= 0 ? "rupture" as const : p.stock <= p.stockThreshold ? "faible" as const : "ok" as const,
                rotation: p.stock > 0 && sold > 0 ? sold / p.stock : null
            };
        });
    const movements: Movement[] = getStockMovements()
        .map((m) => ({ at: new Date(m.createdAt).getTime(), product: m.productName, type: m.type === "in" ? "Entrée" : m.type === "out" ? "Sortie" : "Ajustement", quantity: m.quantity, before: m.before, after: m.after, reason: m.reason, pid: m.productId }))
        .filter((m) => m.at >= f.range.start.getTime() && m.at <= f.range.end.getTime() && (f.productId === "" || m.pid === f.productId) && (f.category === "" || (categoryOf.get(m.pid) ?? "") === f.category))
        .sort((a, b) => b.at - a.at)
        .map(({ pid: _p, ...rest }) => rest);
    const rotationRows = rows.filter((r) => r.rotation !== null);
    const stock = {
        rows, value: sum(rows.map((r) => r.value)),
        entries: sum(movements.filter((m) => m.quantity > 0).map((m) => m.quantity)),
        exits: sum(movements.filter((m) => m.quantity < 0).map((m) => -m.quantity)),
        movements, rotation: rotationRows.length ? mean(rotationRows.map((r) => r.rotation!)) : null
    };

    /* Clients */
    const clientRows: ClientRow[] = [];
    const allClientSales = new Map<string, number[]>();

    for (const s of sales) if (!s.cancelledAt && s.customerId) {
        const list = allClientSales.get(s.customerId) ?? [];

        list.push(new Date(s.createdAt).getTime());
        allClientSales.set(s.customerId, list);
    }

    for (const c of clients) {
        if (f.clientId && c.id !== f.clientId) continue;

        const mine = okViews.filter((v) => v.sale.customerId === c.id);
        const history = (allClientSales.get(c.id) ?? []).sort((a, b) => a - b);
        const gaps = history.slice(1).map((t, i) => (t - history[i]!) / DAY);
        const interval = gaps.length >= 2 ? median(gaps) : null;
        const last = history.length ? history[history.length - 1]! : null;
        const idle = last === null ? null : (now.getTime() - last) / DAY;

        clientRows.push({
            id: c.id, name: c.name, count: mine.length, amount: sum(mine.map((v) => v.amount)),
            average: mine.length ? sum(mine.map((v) => v.amount)) / mine.length : 0,
            lastAt: last, intervalDays: interval,
            isNew: new Date(c.createdAt).getTime() >= f.range.start.getTime() && new Date(c.createdAt).getTime() <= f.range.end.getTime(),
            status: idle !== null && idle <= Math.max(30, (interval ?? 0) * 2) ? "actif" : "inactif"
        });
    }

    clientRows.sort((a, b) => b.amount - a.amount);

    const buyers = clientRows.filter((c) => c.count > 0);
    const clientsBlock = {
        rows: clientRows, total: clientRows.length, newCount: clientRows.filter((c) => c.isNew).length,
        active: buyers.length, recurring: buyers.filter((c) => c.count >= MIN.clientRecurring).length,
        inactive: clientRows.filter((c) => c.count === 0 && c.status === "inactif").length,
        avgAmount: buyers.length ? sum(buyers.map((c) => c.amount)) / buyers.length : 0
    };

    /* Paiements & crédits */
    const remaining = getRemainingMap(sales);
    const methodMap = new Map<PaymentMethod, { count: number; amount: number }>();

    for (const v of okViews) {
        const e = methodMap.get(v.sale.paymentMethod) ?? { count: 0, amount: 0 };

        e.count += 1;
        e.amount += v.amount;
        methodMap.set(v.sale.paymentMethod, e);
    }

    const creditViews = okViews.filter((v) => v.sale.remaining > 0);
    const payAll = getCreditPayments().filter((p) => !p.cancelledAt);
    const saleIds = new Set(okViews.map((v) => v.sale.id));
    const toReceive = sum(okViews.map((v) => remaining.get(v.sale.id) ?? 0));
    const overdue = okViews.filter((v) => (remaining.get(v.sale.id) ?? 0) > 0 && (now.getTime() - v.at) / DAY > CREDIT_OVERDUE_DAYS);
    const repaid = sum(payAll.filter((p) => saleIds.has(p.saleId) || (new Date(p.createdAt).getTime() >= f.range.start.getTime() && new Date(p.createdAt).getTime() <= f.range.end.getTime() && f.productId === "" && f.category === "" && f.clientId === "")).map((p) => p.amount));
    const creditShare = totals.revenue > 0 ? (sum(creditViews.map((v) => v.amount)) / totals.revenue) * 100 : 0;
    const prevOk = prevViews.filter((v) => !v.cancelled);
    const prevCreditShare = previous && previous.revenue > 0 ? (sum(prevOk.filter((v) => v.sale.remaining > 0).map((v) => v.amount)) / previous.revenue) * 100 : null;
    const payments = {
        methods: [...methodMap.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([method, e]) => ({ method, label: METHOD_LABEL[method], count: e.count, amount: e.amount, share: totals.revenue > 0 ? (e.amount / totals.revenue) * 100 : 0 })),
        collected: Math.max(0, totals.revenue - toReceive), toReceive, creditSales: creditViews.length,
        creditSalesAmount: sum(creditViews.map((v) => v.amount)), repaid,
        overdue: sum(overdue.map((v) => remaining.get(v.sale.id) ?? 0)), overdueCount: overdue.length, creditShare,
        creditList: creditViews.map((v) => ({ date: v.at, client: (v.sale.customerId ? clients.find((c) => c.id === v.sale.customerId)?.name : null) ?? v.sale.borrowerName ?? "Client de passage", amount: v.amount, remaining: remaining.get(v.sale.id) ?? 0 })).sort((a, b) => b.date - a.date), prevCreditShare
    };

    /* Équipe : EJDEN n'enregistre pas l'auteur des ventes (mono-utilisateur) */
    const team = {
        users: [{ name: "Utilisateur principal", count: totals.count, amount: totals.revenue, cancelled: totals.cancelledCount }],
        note: "EJDEN n'enregistre pas encore l'auteur de chaque opération : le détail par utilisateur sera disponible avec la gestion multi-utilisateurs."
    };

    /* ----- Analyses avancées ----- */
    const allDaily = dailySeries(
        viewsOf(sales, { ...f, status: "active" }, { start: addDays(sod(now), -Math.max(historyDays, 1) + 1), end: eod(now) }, categoryOf),
        { start: addDays(sod(now), -Math.max(historyDays, 1) + 1), end: eod(now) }
    );
    const series = allDaily.map((d) => d.revenue);
    const activeDays = allDaily.filter((d) => d.count > 0).length;

    const insufficient = (reason: string): Unavailable => ({ available: false, reason });
    const need = (days: number, what: string) => `EJDEN ne dispose pas encore de suffisamment d'historique (${days} jours minimum, ${historyDays} actuellement) pour ${what}.`;

    // Tendance (sur l'historique complet, filtres appliqués)
    let trend: Report["trend"] = insufficient(need(MIN.trendDays, "déterminer une tendance fiable"));

    if (historyDays >= MIN.trendDays && activeDays >= 5) {
        const lt = linearTrend(series);
        const avg = mean(series) ?? 0;

        if (lt) {
            const rel = avg > 0 ? ((lt.slope * (series.length - 1)) / avg) * 100 : 0;
            const half = Math.floor(series.length / 2);
            const s1 = linearTrend(series.slice(0, half));
            const s2 = linearTrend(series.slice(half));
            const accel = s1 && s2 ? (s2.slope - s1.slope > Math.abs(avg) * 0.02 ? "accélération" : s1.slope - s2.slope > Math.abs(avg) * 0.02 ? "ralentissement" : "stable") : null;

            trend = {
                available: true, slopePerDay: lt.slope, relative: rel, r2: lt.r2,
                direction: lt.r2 < 0.1 || Math.abs(rel) < 5 ? "stable" : rel > 0 ? "hausse" : "baisse",
                acceleration: accel, ma7: movingAverage(series, 7),
                confidence: confidenceFromSample(historyDays, MIN.trendDays, 60)
            };
        }
    }

    // Variabilité & anomalies
    const sd = stdDev(series);
    let variability: Report["variability"] = insufficient(need(MIN.anomalyDays, "mesurer la variabilité"));

    if (historyDays >= MIN.anomalyDays && sd !== null) {
        variability = { available: true, mean: mean(series)!, median: median(series)!, std: sd, variance: sd * sd, cv: coefVariation(series) };
    }

    let anomalies: Report["anomalies"] = insufficient(need(MIN.anomalyDays, "détecter des valeurs inhabituelles"));

    if (historyDays >= MIN.anomalyDays && activeDays >= 7 && sd !== null && sd > 0) {
        const items: Array<{ day: string; value: number; z: number; kind: "élevée" | "faible" }> = [];

        for (const d of allDaily) {
            if (d.date < sod(f.range.start) || d.date > f.range.end) continue;

            // Référence = autres jours (sans le jour testé) pour ne pas se « masquer » soi-même
            const sample = allDaily.filter((x) => x.day !== d.day).map((x) => x.revenue);
            const z = zScore(d.revenue, sample);

            if (z !== null && Math.abs(z) >= 2.5 && (d.revenue > 0 || z < 0)) {
                items.push({ day: fmtDay(d.date), value: d.revenue, z, kind: z > 0 ? "élevée" : "faible" });
            }
        }

        const m = mean(series)!;

        anomalies = { available: true, low: Math.max(0, m - sd), high: m + sd, items: items.slice(0, 10), cv: coefVariation(series), confidence: confidenceFromSample(historyDays, MIN.anomalyDays, 60) };
    }

    // Saisonnalité hebdomadaire
    let seasonality: Report["seasonality"] = insufficient(need(MIN.weekdayWeeks * 7, "analyser la saisonnalité (jours de la semaine)"));

    if (historyDays >= MIN.weekdayWeeks * 7 && activeDays >= 10) {
        const overall = mean(series) ?? 0;
        const idx = WD.map((label, i) => {
            const vals = allDaily.filter((d) => d.date.getDay() === i).map((d) => d.revenue);

            return { label, index: overall > 0 && vals.length ? ((mean(vals)! - overall) / overall) * 100 : 0 };
        });

        seasonality = {
            available: true, weekday: idx, confidence: confidenceFromSample(historyDays, 28, 90),
            monthNote: historyDays >= MIN.seasonMonths * 30 ? "Historique suffisant pour une analyse mensuelle." : `Saisonnalité mensuelle indisponible : ${MIN.seasonMonths} mois d'historique sont nécessaires.`
        };
    }

    // Prévision simple (moyenne mobile + tendance), explicable
    let forecast: Report["forecast"] = insufficient(need(MIN.forecastDays, "estimer les ventes futures"));

    if (historyDays >= MIN.forecastDays && activeDays >= 10 && sd !== null) {
        const recent = series.slice(-14);
        const base = mean(recent) ?? 0;
        const n = 7;
        const exp = Math.max(0, base * n);
        const err = (sd / Math.sqrt(1)) * Math.sqrt(n);

        forecast = { available: true, nextDays: n, expectedRevenue: exp, low: Math.max(0, exp - err), high: exp + err, confidence: confidenceFromSample(historyDays, MIN.forecastDays, 90) };
    }

    const report: Report = {
        filters: f, comparison: compare, historyDays, totals, previous, previousNote, daily, weekly, monthly,
        weekdays: wdTotals, hours, products: productRows, noSaleProducts, stock, clients: clientsBlock, payments, team,
        trend, anomalies, seasonality, forecast, variability, insights: []
    };

    report.insights = buildInsights(report, series, allDaily);

    return report;
}

function buildInsights(r: Report, series: number[], allDaily: DayPoint[]): Insight[] {
    const out: Insight[] = [];
    const per = rangeLabel(r.filters.range);
    const add = (i: Omit<Insight, "id">) => out.push({ ...i, id: `i${out.length + 1}` });

    if (r.totals.count === 0) return out;

    if (r.previous && r.previous.revenue > 0) {
        const ch = percentChange(r.totals.revenue, r.previous.revenue);

        if (ch !== null && Math.abs(ch) >= 5) {
            add({ type: "Ventes", level: ch > 0 ? "positif" : "attention", title: ch > 0 ? `Vos ventes progressent de ${formatPercent(ch, false)}` : `Vos ventes reculent de ${formatPercent(ch, false)}`, explanation: `Chiffre d'affaires comparé à la période de référence.`, period: per, data: `${r.totals.count} ventes, ${r.previous.count} ventes sur la période comparée`, confidence: confidenceFromSample(r.previous.count, 10, 40) });
        }
    }

    if (r.trend.available && r.trend.direction !== "stable") {
        add({ type: "Tendance", level: r.trend.direction === "hausse" ? "positif" : "attention", title: r.trend.direction === "hausse" ? "Tendance des ventes à la hausse" : "Tendance des ventes à la baisse", explanation: `Pente estimée sur ${r.historyDays} jours (${formatPercent(r.trend.relative)} sur l'historique${r.trend.acceleration && r.trend.acceleration !== "stable" ? `, ${r.trend.acceleration}` : ""}).`, period: `${r.historyDays} derniers jours`, data: `Régression linéaire, R² = ${r.trend.r2.toFixed(2)}`, confidence: r.trend.confidence });
    }

    if (r.anomalies.available) {
        for (const a of r.anomalies.items.slice(0, 2)) {
            add({ type: "Anomalie", level: "attention", title: `Activité exceptionnellement ${a.kind} le ${a.day}`, explanation: `${Math.round(a.value).toLocaleString("fr-FR")} FCFA, alors que l'activité habituelle se situe entre ${Math.round(r.anomalies.low).toLocaleString("fr-FR")} et ${Math.round(r.anomalies.high).toLocaleString("fr-FR")} FCFA.`, period: a.day, data: `Z-score = ${a.z.toFixed(1)}`, confidence: r.anomalies.confidence });
        }
    }

    for (const s of r.stock.rows.filter((x) => x.daysLeft !== null && x.daysLeft <= 7 && x.stock > 0).sort((a, b) => a.daysLeft! - b.daysLeft!).slice(0, 3)) {
        add({ type: "Stock", level: s.daysLeft! <= 3 ? "alerte" : "attention", title: `Le stock de « ${s.name} » pourrait être insuffisant dans environ ${Math.max(1, Math.round(s.daysLeft!))} jour(s)`, explanation: `Stock ${s.stock}, vente moyenne ${s.dailyRate!.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}/jour.`, period: per, data: "Rythme de vente observé sur la période", confidence: confidenceFromSample(r.historyDays, 7, 30) });
    }

    const ruptures = r.stock.rows.filter((x) => x.status === "rupture").length;

    if (ruptures > 0) add({ type: "Stock", level: "alerte", title: `${ruptures} produit(s) en rupture de stock`, explanation: "Stock à zéro actuellement.", period: "Aujourd'hui", data: "Stock actuel", confidence: null });

    if (r.payments.prevCreditShare !== null && Math.abs(r.payments.creditShare - r.payments.prevCreditShare) >= 5) {
        add({ type: "Crédits", level: r.payments.creditShare > r.payments.prevCreditShare ? "attention" : "positif", title: `Les ventes à crédit représentent ${formatPercent(r.payments.creditShare, false)} de vos ventes, contre ${formatPercent(r.payments.prevCreditShare, false)} sur la période précédente`, explanation: "Part du chiffre d'affaires non encaissée à la vente.", period: per, data: `${r.payments.creditSales} vente(s) à crédit`, confidence: null });
    }

    if (r.payments.overdueCount > 0) add({ type: "Crédits", level: "alerte", title: `${r.payments.overdueCount} crédit(s) en retard`, explanation: `${Math.round(r.payments.overdue).toLocaleString("fr-FR")} FCFA restent à encaisser depuis plus de ${CREDIT_OVERDUE_DAYS} jours.`, period: per, data: "Ventes à crédit non soldées", confidence: null });

    const late = r.clients.rows.filter((c) => c.intervalDays !== null && c.lastAt !== null && (Date.now() - c.lastAt) / DAY > c.intervalDays! * 2 && c.count === 0);

    if (late.length > 0) add({ type: "Clients", level: "info", title: `${late.length} client(s) n'ont effectué aucun achat depuis plus de 2 fois leur fréquence habituelle`, explanation: "Fréquence calculée sur leurs achats passés (au moins 3 achats).", period: per, data: "Intervalle médian entre achats", confidence: "moyenne" });

    void series; void allDaily;

    return out;
}
