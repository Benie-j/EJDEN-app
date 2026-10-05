// src/statistiques.ts
// Statistiques d'exploitation : prévisions, produits (ABC), stock (rotation,
// ruptures), clients et paniers. Méthodes classiques du commerce de détail.
// Texte via textContent uniquement. Les prévisions sont des estimations.

import {
    type Product,
    type Sale,
    getClients,
    getExpenses,
    getProducts,
    getSales
} from "./storage.js";
import { el, money } from "./ui.js";

function byId<T extends HTMLElement>(id: string): T {
    const node = document.getElementById(id);

    if (!node) throw new Error(`EJDEN : élément #${id} introuvable.`);

    return node as T;
}

const DAY = 86_400_000;
const NS = "http://www.w3.org/2000/svg";

type Tab = "forecast" | "products" | "stock" | "clients";

let tab: Tab = "forecast";
let horizon = 90;

/* =========================================================
   Données et outils
   ========================================================= */

interface Row { sale: Sale; at: number }

function activeSales(): Row[] {
    const rows: Row[] = [];

    for (const sale of getSales()) {
        const at = new Date(sale.createdAt).getTime();

        if (!sale.cancelledAt && !Number.isNaN(at)) rows.push({ sale, at });
    }

    return rows;
}

function dayStart(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, n: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

/** Lundi = 0 … dimanche = 6. */
function weekday(date: Date): number {
    return (date.getDay() + 6) % 7;
}

function weekStart(date: Date): Date {
    return addDays(dayStart(date), -weekday(date));
}

function sum(values: number[]): number {
    return values.reduce((a, b) => a + b, 0);
}

function compact(value: number): string {
    const v = Math.abs(value);
    const s = value < 0 ? "−" : "";

    if (v >= 1e6) return `${s}${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
    if (v >= 1e3) return `${s}${Math.round(v / 1e3)} k`;

    return `${s}${Math.round(v)}`;
}

function pct(value: number, digits = 0): string {
    return `${value.toLocaleString("fr-FR", { maximumFractionDigits: digits })} %`;
}

function signedPct(value: number): string {
    return `${value > 0 ? "+" : ""}${pct(value, 1)}`;
}

function qty(value: number): string {
    return value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

/** Régression linéaire simple : tendance + écart-type des résidus. */
function linearFit(y: number[]): { slope: number; intercept: number; sd: number } {
    const n = y.length;
    const xMean = (n - 1) / 2;
    const yMean = sum(y) / n;
    let num = 0;
    let den = 0;

    y.forEach((value, x) => {
        num += (x - xMean) * (value - yMean);
        den += (x - xMean) ** 2;
    });

    const slope = den === 0 ? 0 : num / den;
    const intercept = yMean - slope * xMean;
    const residuals = y.map((value, x) => value - (intercept + slope * x));
    const sd = n > 2 ? Math.sqrt(sum(residuals.map((r) => r * r)) / (n - 2)) : 0;

    return { slope, intercept, sd };
}

function project(y: number[], count: number): { values: number[]; sd: number; slope: number; mean: number } {
    const fit = linearFit(y);
    const cap = Math.max(...y) * 2;
    const values: number[] = [];

    for (let k = 1; k <= count; k += 1) {
        values.push(Math.min(cap, Math.max(0, fit.intercept + fit.slope * (y.length - 1 + k))));
    }

    return { values, sd: fit.sd, slope: fit.slope, mean: sum(y) / y.length };
}

/* ---------- Composants ---------- */

function section(title: string, ...children: Array<Element | null>): HTMLElement {
    const box = el("section", "rp-section");

    box.append(el("h2", undefined, title));

    for (const child of children) if (child) box.append(child);

    return box;
}

function note(text: string): HTMLElement {
    return el("p", "st-note", text);
}

function empty(text: string): HTMLElement {
    return el("p", "rp-empty", text);
}

function line(label: string, value: string, tone?: "positive" | "negative"): HTMLElement {
    const node = el("div", tone ? `rp-row is-${tone}` : "rp-row");

    node.append(el("span", undefined, label), el("strong", undefined, value));

    return node;
}

function kpi(label: string, value: string, main = false): HTMLElement {
    const node = el("div", main ? "rp-kpi is-main" : "rp-kpi");

    node.append(el("span", undefined, label), el("strong", undefined, value));

    return node;
}

function kpis(...items: HTMLElement[]): HTMLElement {
    const grid = el("div", "rp-kpis");

    grid.append(...items);

    return grid;
}

function badge(text: string, tone: "" | "good" | "warn" | "bad" = ""): HTMLElement {
    return el("span", `st-badge${tone ? ` is-${tone}` : ""}`, text);
}

function item(title: string, value: string, detail: string, meter?: { ratio: number; tone?: "good" | "warn" | "bad" }): HTMLElement {
    const node = el("div", "st-item");
    const head = el("div", "st-item-head");

    head.append(el("span", undefined, title), el("strong", undefined, value));
    node.append(head);

    if (detail) node.append(el("small", undefined, detail));

    if (meter) {
        const bar = el("div", `st-meter${meter.tone ? ` is-${meter.tone}` : ""}`);
        const fill = el("div");

        fill.style.width = `${Math.max(2, Math.min(100, meter.ratio * 100))}%`;
        bar.append(fill);
        node.append(bar);
    }

    return node;
}

function svgNode<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
    const node = document.createElementNS(NS, tag);

    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));

    if (text !== undefined) node.textContent = text;

    return node;
}

/** Histogramme avec barres de prévision (pointillées) et fourchette d'incertitude. */
function barChart(labels: string[], values: number[], forecast: number[], forecastLabels: string[], sd: number): SVGElement {
    const W = 340;
    const H = 170;
    const left = 4;
    const top = 14;
    const bottom = 22;
    const all = [...values, ...forecast];
    const max = Math.max(1, ...all, ...forecast.map((v) => v + sd)) * 1.08;
    const slot = (W - left * 2) / all.length;
    const barW = Math.min(26, slot * 0.7);
    const plotH = H - top - bottom;
    const svg = svgNode("svg", { viewBox: `0 0 ${W} ${H}`, class: "st-chart", role: "img", "aria-label": "Graphique des ventes et prévision" });
    const yOf = (v: number): number => top + plotH * (1 - v / max);

    svg.append(svgNode("line", { x1: left, x2: W - left, y1: top + plotH, y2: top + plotH, class: "st-axis" }));
    svg.append(svgNode("text", { x: left, y: 9 }, compact(max)));

    all.forEach((value, i) => {
        const isForecast = i >= values.length;
        const x = left + slot * i + (slot - barW) / 2;
        const y = yOf(value);

        svg.append(svgNode("rect", { x, y, width: barW, height: Math.max(1, top + plotH - y), rx: 2, class: isForecast ? "st-bar is-forecast" : "st-bar" }));

        const label = isForecast ? forecastLabels[i - values.length] : labels[i];

        if (all.length <= 16 || i % 2 === 0 || isForecast) {
            svg.append(svgNode("text", { x: x + barW / 2, y: H - 8, "text-anchor": "middle" }, label));
        }

        if (isForecast) {
            const cx = x + barW / 2;

            svg.append(svgNode("line", { x1: cx, x2: cx, y1: yOf(value + sd), y2: yOf(Math.max(0, value - sd)), class: "st-band" }));
            svg.append(svgNode("text", { x: cx, y: Math.max(10, yOf(value + sd) - 3), "text-anchor": "middle" }, compact(value)));
        }
    });

    return svg;
}

function legend(): HTMLElement {
    const box = el("div", "st-legend");
    const a = el("span");
    const b = el("span");

    a.append(el("i"), document.createTextNode("Réalisé"));
    b.append(el("i", "is-forecast"), document.createTextNode("Prévision (trait orange : fourchette probable)"));
    box.append(a, b);

    return box;
}

/* =========================================================
   1. PRÉVISIONS
   ========================================================= */

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function trendBadge(slope: number, mean: number): HTMLElement {
    const rel = mean > 0 ? (slope / mean) * 100 : 0;

    return rel > 3 ? badge("Hausse", "good") : rel < -3 ? badge("Baisse", "bad") : badge("Stable");
}

function buildForecast(rows: Row[]): HTMLElement[] {
    const out: HTMLElement[] = [];
    const now = new Date();
    const today = dayStart(now);
    const first = rows.length > 0 ? Math.min(...rows.map((r) => r.at)) : Date.now();

    if (rows.length === 0) {
        return [section("Prévisions", empty("Aucune vente enregistrée : les prévisions apparaîtront dès les premières ventes."))];
    }

    /* Prévision à court terme : moyenne par jour de la semaine (8 dernières semaines) */
    const from = new Date(Math.max(dayStart(new Date(first)).getTime(), addDays(today, -56).getTime()));
    const daysCovered = Math.round((today.getTime() - from.getTime()) / DAY);
    const perDay = new Array<number>(7).fill(0);
    const dayCount = new Array<number>(7).fill(0);

    for (let d = new Date(from); d < today; d = addDays(d, 1)) dayCount[weekday(d)] += 1;

    for (const { sale, at } of rows) {
        if (at >= from.getTime() && at < today.getTime()) perDay[weekday(new Date(at))] += sale.total;
    }

    const avg = perDay.map((total, i) => (dayCount[i] > 0 ? total / dayCount[i] : 0));
    const expected = (date: Date): number => avg[weekday(date)];
    let next7 = 0;
    let next30 = 0;

    for (let i = 1; i <= 30; i += 1) {
        const value = expected(addDays(today, i));

        next30 += value;
        if (i <= 7) next7 += value;
    }

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const realized = sum(rows.filter((r) => r.at >= monthStart.getTime()).map((r) => r.sale.total));
    let remaining = 0;

    for (let d = addDays(today, 1); d <= monthEnd; d = addDays(d, 1)) remaining += expected(d);

    if (daysCovered >= 14) {
        out.push(
            section(
                "Prévision à court terme",
                kpis(
                    kpi("7 prochains jours", money(next7)),
                    kpi("30 prochains jours", money(next30)),
                    kpi(`Fin ${MONTHS[now.getMonth()]} (projetée)`, money(realized + remaining), true)
                ),
                line("Réalisé ce mois-ci", money(realized)),
                line("Encore attendu d'ici la fin du mois", money(remaining)),
                note("Méthode : moyenne des ventes de chaque jour de la semaine sur les 8 dernières semaines, appliquée aux jours à venir.")
            )
        );
    } else {
        out.push(section("Prévision à court terme", empty(`Il faut au moins 14 jours d'historique (actuellement ${Math.max(0, daysCovered)}).`)));
    }

    /* Prévision hebdomadaire */
    const w0 = weekStart(today);
    const weekly: number[] = [];
    const weekLabels: string[] = [];

    for (let i = 12; i >= 1; i -= 1) {
        const start = addDays(w0, -7 * i);
        const end = addDays(start, 7);

        weekly.push(sum(rows.filter((r) => r.at >= start.getTime() && r.at < end.getTime()).map((r) => r.sale.total)));
        weekLabels.push(`${start.getDate()}/${start.getMonth() + 1}`);
    }

    const firstWeek = weekly.findIndex((v) => v > 0);
    const wSeries = firstWeek === -1 ? [] : weekly.slice(firstWeek);

    if (wSeries.length >= 4) {
        const wForecast = project(wSeries, 4);
        const labels = weekLabels.slice(firstWeek);
        const futureLabels = [1, 2, 3, 4].map((k) => {
            const d = addDays(w0, 7 * (k - 1));

            return `${d.getDate()}/${d.getMonth() + 1}`;
        });

        out.push(
            section(
                "Ventes par semaine",
                barChart(labels, wSeries, wForecast.values, futureLabels, wForecast.sd),
                legend(),
                line("Tendance", ""),
                line("Prévision des 4 prochaines semaines", money(sum(wForecast.values))),
                note("Méthode : droite de tendance (régression linéaire) sur les semaines complètes ; la fourchette correspond à l'écart habituel autour de cette droite.")
            )
        );

        // Remplace la ligne « Tendance » par un badge.
        const row = out[out.length - 1].querySelectorAll(".rp-row")[0];

        row.replaceChildren(el("span", undefined, "Tendance"), trendBadge(wForecast.slope, wForecast.mean));
    } else {
        out.push(section("Ventes par semaine", empty("Il faut au moins 4 semaines complètes de ventes pour tracer une tendance.")));
    }

    /* Prévision mensuelle + croissance */
    const monthly: number[] = [];
    const monthLabels: string[] = [];

    for (let i = 12; i >= 1; i -= 1) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

        monthly.push(sum(rows.filter((r) => r.at >= start.getTime() && r.at < end.getTime()).map((r) => r.sale.total)));
        monthLabels.push(MONTHS[start.getMonth()]);
    }

    const firstMonth = monthly.findIndex((v) => v > 0);
    const mSeries = firstMonth === -1 ? [] : monthly.slice(firstMonth);

    if (mSeries.length >= 3) {
        const mForecast = project(mSeries, 3);
        const futureLabels = [0, 1, 2].map((k) => MONTHS[(now.getMonth() + k) % 12]);
        const last = mSeries[mSeries.length - 1];
        const prev = mSeries[mSeries.length - 2];
        const best = Math.max(...mSeries);
        const worst = Math.min(...mSeries);
        const offset = monthly.length - mSeries.length;
        const bestLabel = monthLabels[offset + mSeries.indexOf(best)];
        const worstLabel = monthLabels[offset + mSeries.indexOf(worst)];
        const recent3 = sum(mSeries.slice(-3));
        const before3 = mSeries.length >= 6 ? sum(mSeries.slice(-6, -3)) : 0;
        const yoyBase = monthly.length >= 12 ? monthly[0] : 0;
        const rows2: HTMLElement[] = [
            line("Dernier mois complet vs précédent", prev > 0 ? signedPct(((last - prev) / prev) * 100) : "—", prev > 0 && last >= prev ? "positive" : "negative")
        ];

        if (before3 > 0) {
            rows2.push(line("3 derniers mois vs 3 mois d'avant", signedPct(((recent3 - before3) / before3) * 100), recent3 >= before3 ? "positive" : "negative"));
        }

        if (yoyBase > 0) rows2.push(line("Même mois, il y a un an", signedPct(((last - yoyBase) / yoyBase) * 100), last >= yoyBase ? "positive" : "negative"));

        rows2.push(line("Meilleur mois", `${bestLabel} · ${money(best)}`), line("Mois le plus faible", `${worstLabel} · ${money(worst)}`));
        rows2.push(line("Prévision des 3 prochains mois", money(sum(mForecast.values))));

        out.push(
            section(
                "Ventes par mois et croissance",
                barChart(monthLabels.slice(offset), mSeries, mForecast.values, futureLabels, mForecast.sd),
                legend(),
                ...rows2,
                note("Avec moins de 24 mois d'historique, la saisonnalité annuelle ne peut pas être mesurée : la prévision suit uniquement la tendance.")
            )
        );
    } else {
        out.push(section("Ventes par mois et croissance", empty("Il faut au moins 3 mois complets de ventes.")));
    }

    out.push(buildBreakEven(rows, realized + remaining, daysCovered >= 14));
    out.push(buildRhythm(rows, avg));

    return out;
}

/** Seuil de rentabilité mensuel = charges fixes ÷ taux de marge brute. */
function buildBreakEven(rows: Row[], projectedMonth: number, hasProjection: boolean): HTMLElement {
    const now = new Date();
    const from3 = new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const charges = sum(
        getExpenses()
            .filter((e) => {
                const at = new Date(e.createdAt).getTime();

                return e.category !== "marchandises" && at >= from3 && at < monthStart;
            })
            .map((e) => e.amount)
    );
    const sales = rows.filter((r) => r.at >= Date.now() - 90 * DAY && r.sale.items.every((i) => i.unitCost !== undefined));
    const revenue = sum(sales.map((r) => r.sale.total));
    const margin = sum(
        sales.map((r) => sum(r.sale.items.map((i) => (i.unitPrice - (i.unitCost ?? 0)) * i.quantity)) - r.sale.discount)
    );

    if (revenue <= 0 || margin <= 0) {
        return section("Seuil de rentabilité", empty("Données insuffisantes : il faut des ventes avec prix d'achat connu."));
    }

    if (charges <= 0) {
        return section("Seuil de rentabilité", empty("Aucune charge (loyer, transport…) enregistrée sur les 3 derniers mois complets."));
    }

    const monthlyCharges = charges / 3;
    const rate = margin / revenue;
    const threshold = monthlyCharges / rate;
    const rows3: HTMLElement[] = [
        line("Charges mensuelles moyennes", money(monthlyCharges)),
        line("Taux de marge brute", pct(rate * 100, 1)),
        line("Chiffre d'affaires minimum par mois", money(threshold))
    ];
    let meter: HTMLElement | null = null;

    if (hasProjection) {
        const ratio = projectedMonth / threshold;

        rows3.push(
            line(
                "Projection de ce mois",
                `${money(projectedMonth)} (${pct(ratio * 100)})`,
                ratio >= 1 ? "positive" : "negative"
            )
        );
        meter = item("Atteinte du seuil", ratio >= 1 ? "Rentable" : "Sous le seuil", "", {
            ratio: Math.min(1, ratio),
            tone: ratio >= 1 ? "good" : ratio >= 0.8 ? "warn" : "bad"
        });
    }

    return section(
        "Seuil de rentabilité",
        ...rows3,
        meter,
        note("Seuil = charges mensuelles (hors marchandises) ÷ taux de marge brute. En dessous, le mois se termine à perte.")
    );
}

/** Jours et heures de forte activité sur 90 jours. */
function buildRhythm(rows: Row[], dayAverage: number[]): HTMLElement {
    const since = Date.now() - 90 * DAY;
    const grid = Array.from({ length: 7 }, () => new Array<number>(12).fill(0));
    let total = 0;
    const hourly = new Array<number>(24).fill(0);

    for (const { sale, at } of rows) {
        if (at < since) continue;

        const date = new Date(at);

        grid[weekday(date)][Math.floor(date.getHours() / 2)] += 1;
        hourly[date.getHours()] += sale.total;
        total += 1;
    }

    if (total < 10) {
        return section("Jours et heures de pointe", empty("Il faut au moins 10 ventes sur 90 jours."));
    }

    const max = Math.max(...grid.flat());
    const heat = el("div", "st-heat");

    heat.append(el("span"));

    for (let b = 0; b < 12; b += 1) heat.append(el("span", "st-h-label", b % 2 === 0 ? String(b * 2) : ""));

    grid.forEach((cells, day) => {
        heat.append(el("span", "st-h-label", WEEKDAYS[day].slice(0, 1)));

        for (const count of cells) {
            const cell = el("span", count === 0 ? "st-cell is-0" : "st-cell");

            if (count > 0) cell.style.opacity = String(0.2 + 0.8 * (count / max));

            heat.append(cell);
        }
    });

    const bestDay = dayAverage.indexOf(Math.max(...dayAverage));
    const worstDay = dayAverage.indexOf(Math.min(...dayAverage));
    const bestHour = hourly.indexOf(Math.max(...hourly));

    return section(
        "Jours et heures de pointe",
        heat,
        note("Chaque case = tranche de 2 h (0 à 22 h), du lundi au dimanche. Plus la case est foncée, plus il y a de ventes."),
        line("Meilleur jour", `${WEEKDAYS[bestDay]} · ${money(dayAverage[bestDay])} en moyenne`),
        line("Jour le plus calme", `${WEEKDAYS[worstDay]} · ${money(dayAverage[worstDay])} en moyenne`),
        line("Meilleure heure", `${bestHour} h – ${bestHour + 1} h`)
    );
}

/* =========================================================
   2. PRODUITS : ABC, catégories, tendances, marges
   ========================================================= */

function buildProducts(rows: Row[]): HTMLElement[] {
    const now = Date.now();
    const start = now - horizon * DAY;
    const prevStart = start - horizon * DAY;
    const current = new Map<string, { name: string; amount: number; quantity: number }>();
    const previous = new Map<string, number>();

    for (const { sale, at } of rows) {
        if (at < prevStart) continue;

        for (const it of sale.items) {
            if (at >= start) {
                const e = current.get(it.productId) ?? { name: it.productName, amount: 0, quantity: 0 };

                e.amount += it.total;
                e.quantity += it.quantity;
                current.set(it.productId, e);
            } else {
                previous.set(it.productId, (previous.get(it.productId) ?? 0) + it.quantity);
            }
        }
    }

    const products = getProducts();
    const out: HTMLElement[] = [];
    const ranked = [...current.entries()].sort((a, b) => b[1].amount - a[1].amount);
    const totalAmount = sum(ranked.map(([, v]) => v.amount));

    if (ranked.length === 0) {
        return [section("Produits", empty("Aucune vente sur cette période."))];
    }

    /* ABC (Pareto) */
    const classes = { A: [] as typeof ranked, B: [] as typeof ranked, C: [] as typeof ranked };
    let cumulative = 0;

    for (const entry of ranked) {
        const before = cumulative / totalAmount;

        cumulative += entry[1].amount;
        (before < 0.8 ? classes.A : before < 0.95 ? classes.B : classes.C).push(entry);
    }

    const share = (list: typeof ranked): number => (sum(list.map(([, v]) => v.amount)) / totalAmount) * 100;
    const unsold = products.filter((p) => !current.has(p.id)).length;

    out.push(
        section(
            "Analyse ABC (Pareto)",
            item(`Classe A · ${classes.A.length} produit${classes.A.length > 1 ? "s" : ""}`, pct(share(classes.A)), "Vos produits stars : ne jamais être en rupture.", { ratio: share(classes.A) / 100, tone: "good" }),
            item(`Classe B · ${classes.B.length} produit${classes.B.length > 1 ? "s" : ""}`, pct(share(classes.B)), "Ventes régulières : suivi normal.", { ratio: share(classes.B) / 100, tone: "warn" }),
            item(`Classe C · ${classes.C.length} produit${classes.C.length > 1 ? "s" : ""}`, pct(share(classes.C)), "Faible contribution : limiter le stock.", { ratio: share(classes.C) / 100 }),
            line("Produits du catalogue sans aucune vente", String(unsold)),
            note("Méthode : produits triés par chiffre d'affaires ; A = jusqu'à 80 % cumulés, B = jusqu'à 95 %, C = le reste."),
            ...classes.A.slice(0, 5).map(([, v]) => line(`${v.name} (A)`, `${money(v.amount)} · ${pct((v.amount / totalAmount) * 100, 1)}`))
        )
    );

    /* Catégories */
    const byProduct = new Map(products.map((p) => [p.id, p]));
    const categories = new Map<string, number>();

    for (const [id, v] of current) {
        const name = byProduct.get(id)?.category ?? "Sans catégorie";

        categories.set(name, (categories.get(name) ?? 0) + v.amount);
    }

    const categoryRows = [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    if (categoryRows.length > 1) {
        out.push(
            section(
                "Chiffre d'affaires par catégorie",
                ...categoryRows.map(([name, amount]) => item(name, money(amount), pct((amount / totalAmount) * 100, 1), { ratio: amount / categoryRows[0][1] }))
            )
        );
    }

    /* Hausses et baisses de volumes */
    const moves: Array<{ name: string; now: number; before: number; change: number }> = [];

    for (const [id, v] of current) {
        const before = previous.get(id) ?? 0;

        if (before >= 3 || v.quantity >= 3) moves.push({ name: v.name, now: v.quantity, before, change: before > 0 ? ((v.quantity - before) / before) * 100 : 100 });
    }

    for (const [id, before] of previous) {
        if (!current.has(id) && before >= 3) {
            const name = byProduct.get(id)?.name ?? "Produit supprimé";

            moves.push({ name, now: 0, before, change: -100 });
        }
    }

    const risers = moves.filter((m) => m.change > 10).sort((a, b) => b.change - a.change).slice(0, 4);
    const fallers = moves.filter((m) => m.change < -10).sort((a, b) => a.change - b.change).slice(0, 4);

    if (risers.length + fallers.length > 0) {
        out.push(
            section(
                "Produits en hausse / en baisse",
                ...risers.map((m) => item(m.name, signedPct(m.change), `${qty(m.before)} → ${qty(m.now)} unités`)),
                ...fallers.map((m) => item(m.name, signedPct(m.change), `${qty(m.before)} → ${qty(m.now)} unités`)),
                note("Comparaison des quantités vendues avec la période précédente de même durée.")
            )
        );
    }

    /* Marges du catalogue */
    const priced = products.filter((p) => p.purchasePrice > 0 && p.salePrice > 0);
    const loss = priced.filter((p) => p.salePrice < p.purchasePrice);
    const thin = priced
        .filter((p) => p.salePrice >= p.purchasePrice && (p.salePrice - p.purchasePrice) / p.salePrice < 0.1)
        .sort((a, b) => (a.salePrice - a.purchasePrice) / a.salePrice - (b.salePrice - b.purchasePrice) / b.salePrice);

    if (loss.length + thin.length > 0) {
        out.push(
            section(
                "Prix à revoir",
                ...loss.slice(0, 5).map((p) => item(p.name, "Vendu à perte", `Achat ${money(p.purchasePrice)} · vente ${money(p.salePrice)}`)),
                ...thin.slice(0, 5).map((p) => item(p.name, `Marge ${pct(((p.salePrice - p.purchasePrice) / p.salePrice) * 100, 1)}`, `Achat ${money(p.purchasePrice)} · vente ${money(p.salePrice)}`)),
                note("Produits dont le prix de vente est inférieur au prix d'achat ou laisse moins de 10 % de marge.")
            )
        );
    }

    return out;
}

/* =========================================================
   3. STOCK : rotation, couverture, ruptures, stock dormant
   ========================================================= */

function buildStock(rows: Row[]): HTMLElement[] {
    const products = getProducts();
    const now = Date.now();
    const sold30 = new Map<string, number>();
    const lastSale = new Map<string, number>();
    let cogs90 = 0;
    let units30 = 0;
    const byProduct = new Map<string, Product>(products.map((p) => [p.id, p]));

    for (const { sale, at } of rows) {
        for (const it of sale.items) {
            lastSale.set(it.productId, Math.max(lastSale.get(it.productId) ?? 0, at));

            if (at >= now - 30 * DAY) {
                sold30.set(it.productId, (sold30.get(it.productId) ?? 0) + it.quantity);
                units30 += it.quantity;
            }

            if (at >= now - 90 * DAY) {
                cogs90 += (it.unitCost ?? byProduct.get(it.productId)?.purchasePrice ?? 0) * it.quantity;
            }
        }
    }

    if (products.length === 0) return [section("Stock", empty("Aucun produit enregistré."))];

    const stockCost = sum(products.map((p) => Math.max(0, p.stock) * p.purchasePrice));
    const stockUnits = sum(products.map((p) => Math.max(0, p.stock)));
    const out: HTMLElement[] = [];

    /* Rotation */
    const firstSale = rows.length > 0 ? Math.min(...rows.map((r) => r.at)) : now;
    const span = Math.min(90, Math.max(1, Math.round((now - firstSale) / DAY)));
    const turnover = stockCost > 0 ? (cogs90 / span) * 365 / stockCost : 0;
    const daysOfStock = cogs90 > 0 ? stockCost / (cogs90 / span) : 0;
    const sellThrough = units30 + stockUnits > 0 ? (units30 / (units30 + stockUnits)) * 100 : 0;
    const level = turnover >= 6 ? badge("Très bonne", "good") : turnover >= 3 ? badge("Correcte", "good") : turnover >= 1.5 ? badge("Faible", "warn") : badge("Très faible", "bad");

    const rotationHead = line("Appréciation", "");

    rotationHead.replaceChildren(el("span", undefined, "Rotation du stock"), level);
    out.push(
        section(
            "Rotation du stock",
            kpis(
                kpi("Rotation annuelle", cogs90 > 0 ? `${qty(turnover)} ×` : "—", true),
                kpi("Jours de stock", cogs90 > 0 ? `${Math.round(daysOfStock)} j` : "—"),
                kpi("Taux d'écoulement (30 j)", pct(sellThrough))
            ),
            rotationHead,
            line("Valeur du stock (prix d'achat)", money(stockCost)),
            note("Rotation = coût des produits vendus (annualisé) ÷ valeur du stock. Elle indique combien de fois le stock se renouvelle par an : au-dessus de 3, c'est sain ; en dessous de 1,5, trop d'argent dort en rayon.")
        )
    );

    /* Couverture : produits qui vont manquer */
    const risks = products
        .map((p) => ({ p, velocity: (sold30.get(p.id) ?? 0) / 30 }))
        .filter(({ p, velocity }) => velocity > 0 && p.stock >= 0)
        .map(({ p, velocity }) => ({ p, velocity, cover: p.stock / velocity }))
        .filter(({ cover }) => cover <= 14)
        .sort((a, b) => a.cover - b.cover);

    out.push(
        section(
            "Ruptures à prévoir",
            ...(risks.length === 0
                ? [empty("Aucun produit à risque : tous couvrent plus de 14 jours de ventes.")]
                : risks.slice(0, 10).map(({ p, velocity, cover }) => {
                      const toBuy = Math.max(1, Math.ceil(velocity * 30 - p.stock));

                      return item(
                          p.name,
                          p.stock === 0 ? "En rupture" : `${Math.max(0, Math.floor(cover))} j restants`,
                          `Stock ${qty(p.stock)} · vend ~${qty(velocity * 7)}/semaine · à commander pour 30 jours : ${qty(toBuy)}`,
                          { ratio: Math.min(1, cover / 14), tone: cover <= 3 ? "bad" : cover <= 7 ? "warn" : undefined }
                      );
                  })),
            ...(risks.some(({ p }) => p.stock === 0)
                ? [line("Ventes perdues estimées par semaine", money(sum(risks.filter(({ p }) => p.stock === 0).map(({ p, velocity }) => velocity * 7 * p.salePrice))), "negative")]
                : []),
            note("Couverture = stock actuel ÷ ventes moyennes par jour des 30 derniers jours. La quantité conseillée couvre 30 jours de ventes.")
        )
    );

    /* Sur-stock et stock dormant */
    const dormant = products
        .filter((p) => p.stock > 0 && now - (lastSale.get(p.id) ?? 0) > 60 * DAY)
        .map((p) => ({ p, value: p.stock * p.purchasePrice, since: lastSale.has(p.id) ? Math.floor((now - (lastSale.get(p.id) ?? 0)) / DAY) : null }))
        .sort((a, b) => b.value - a.value);
    const overstock = products
        .map((p) => ({ p, velocity: (sold30.get(p.id) ?? 0) / 30 }))
        .filter(({ p, velocity }) => velocity > 0 && p.stock / velocity > 120)
        .sort((a, b) => b.p.stock / b.velocity - a.p.stock / a.velocity)
        .slice(0, 5);
    const dormantValue = sum(dormant.map((d) => d.value));

    out.push(
        section(
            "Stock dormant et sur-stock",
            kpis(kpi("Capital immobilisé", money(dormantValue), true), kpi("Produits dormants", String(dormant.length))),
            ...dormant.slice(0, 6).map(({ p, value, since }) =>
                item(p.name, money(value), since === null ? `Jamais vendu · ${qty(p.stock)} en stock` : `Aucune vente depuis ${since} jours · ${qty(p.stock)} en stock`)
            ),
            ...overstock.map(({ p, velocity }) => item(p.name, `${Math.round(p.stock / velocity)} j de stock`, "Plus de 4 mois de ventes en rayon : inutile de recommander.")),
            note("Dormant = en stock mais sans vente depuis plus de 60 jours. Pensez à une promotion ou à un lot pour récupérer cet argent.")
        )
    );

    return out;
}

/* =========================================================
   4. CLIENTS ET PANIERS
   ========================================================= */

function buildClients(rows: Row[]): HTMLElement[] {
    const now = Date.now();
    const start = now - horizon * DAY;
    const period = rows.filter((r) => r.at >= start);
    const out: HTMLElement[] = [];

    if (period.length === 0) return [section("Clients et paniers", empty("Aucune vente sur cette période."))];

    /* Paniers */
    const totals = period.map((r) => r.sale.total).sort((a, b) => a - b);
    const mean = sum(totals) / totals.length;
    const median = totals[Math.floor(totals.length / 2)];
    const itemsPer = sum(period.map((r) => sum(r.sale.items.map((i) => i.quantity)))) / period.length;
    const creditShare = (sum(period.filter((r) => r.sale.paymentMethod === "credit").map((r) => r.sale.total)) / sum(totals)) * 100;

    out.push(
        section(
            "Paniers",
            kpis(
                kpi("Panier moyen", money(mean), true),
                kpi("Panier médian", money(median)),
                kpi("Articles par vente", qty(itemsPer)),
                kpi("Vente la plus élevée", money(totals[totals.length - 1]))
            ),
            line("Part des ventes à crédit", pct(creditShare, 1), creditShare > 30 ? "negative" : undefined),
            note("Le panier médian est moins sensible aux gros achats isolés que la moyenne.")
        )
    );

    /* Produits achetés ensemble */
    const pairs = new Map<string, { a: string; b: string; count: number }>();
    let multi = 0;

    for (const { sale } of period) {
        const names = [...new Map(sale.items.map((i) => [i.productId, i.productName])).entries()].slice(0, 15);

        if (names.length < 2) continue;

        multi += 1;

        for (let i = 0; i < names.length; i += 1) {
            for (let j = i + 1; j < names.length; j += 1) {
                const [x, y] = names[i][0] < names[j][0] ? [names[i], names[j]] : [names[j], names[i]];
                const key = `${x[0]}|${y[0]}`;
                const entry = pairs.get(key) ?? { a: x[1], b: y[1], count: 0 };

                entry.count += 1;
                pairs.set(key, entry);
            }
        }
    }

    const topPairs = [...pairs.values()].filter((p) => p.count >= 2).sort((a, b) => b.count - a.count).slice(0, 5);

    out.push(
        section(
            "Produits souvent achetés ensemble",
            ...(topPairs.length === 0
                ? [empty("Pas encore assez de paniers à plusieurs produits pour détecter des associations.")]
                : topPairs.map((p) => item(`${p.a} + ${p.b}`, `${p.count} fois`, `${pct((p.count / period.length) * 100, 1)} des ventes`, { ratio: p.count / topPairs[0].count }))),
            line("Ventes avec plusieurs produits", pct((multi / period.length) * 100)),
            note("Idée : placez ces produits côte à côte ou proposez-les en lot.")
        )
    );

    /* Clients identifiés */
    const clients = new Map(getClients().map((c) => [c.id, c.name]));
    const known = rows.filter((r) => r.sale.customerId !== null && clients.has(r.sale.customerId ?? ""));
    const perClient = new Map<string, { name: string; amount: number; count: number; first: number; last: number; inPeriod: number }>();

    for (const { sale, at } of known) {
        const id = sale.customerId ?? "";
        const e = perClient.get(id) ?? { name: clients.get(id) ?? "Client", amount: 0, count: 0, first: at, last: at, inPeriod: 0 };

        e.first = Math.min(e.first, at);
        e.last = Math.max(e.last, at);

        if (at >= start) {
            e.amount += sale.total;
            e.count += 1;
            e.inPeriod += 1;
        }

        perClient.set(id, e);
    }

    const active = [...perClient.values()].filter((c) => c.inPeriod > 0);
    const identified = period.filter((r) => r.sale.customerId !== null && clients.has(r.sale.customerId ?? "")).length;

    if (active.length === 0) {
        out.push(
            section(
                "Clients identifiés",
                empty("Aucune vente rattachée à une fiche client sur cette période."),
                note("Choisissez un client au moment de la vente pour suivre sa fidélité et son historique d'achats.")
            )
        );

        return out;
    }

    const fresh = active.filter((c) => c.first >= start).length;
    const returning = active.length - fresh;
    const repeat = active.filter((c) => c.count >= 2).length;
    const sleeping = [...perClient.values()].filter((c) => c.last < now - 60 * DAY && c.count >= 2 && c.first < now - 60 * DAY).sort((a, b) => b.amount - a.amount);
    const topClients = [...active].sort((a, b) => b.amount - a.amount).slice(0, 5);
    const topShare = sum(topClients.map((c) => c.amount));

    out.push(
        section(
            "Clients identifiés",
            kpis(kpi("Clients actifs", String(active.length), true), kpi("Nouveaux", String(fresh)), kpi("Fidèles (revenus)", String(returning)), kpi("Taux de réachat", pct((repeat / active.length) * 100))),
            line("Ventes rattachées à un client", pct((identified / period.length) * 100)),
            note("Taux de réachat = part des clients actifs ayant acheté au moins 2 fois sur la période.")
        )
    );

    out.push(
        section(
            "Meilleurs clients",
            ...topClients.map((c) => item(c.name, money(c.amount), `${c.count} achat${c.count > 1 ? "s" : ""} · panier moyen ${money(c.amount / c.count)}`, { ratio: c.amount / topClients[0].amount })),
            line("Poids des 5 meilleurs dans les ventes identifiées", pct((topShare / Math.max(1, sum(active.map((c) => c.amount)))) * 100))
        )
    );

    if (sleeping.length > 0) {
        out.push(
            section(
                "Clients à relancer",
                ...sleeping.slice(0, 5).map((c) => item(c.name, `${Math.floor((now - c.last) / DAY)} j sans achat`, `${c.count} achats au total`)),
                note("Clients qui achetaient régulièrement mais ne sont pas revenus depuis plus de 60 jours.")
            )
        );
    }

    return out;
}

/* =========================================================
   Navigation
   ========================================================= */

function render(): void {
    const rows = activeSales();
    const blocks = tab === "forecast" ? buildForecast(rows) : tab === "products" ? buildProducts(rows) : tab === "stock" ? buildStock(rows) : buildClients(rows);

    byId("content").replaceChildren(...blocks);
    byId("horizonBar").hidden = tab === "forecast" || tab === "stock";
}

for (const button of document.querySelectorAll<HTMLButtonElement>(".st-tab")) {
    button.addEventListener("click", () => {
        tab = (button.dataset.tab ?? "forecast") as Tab;

        for (const other of document.querySelectorAll(".st-tab")) other.classList.toggle("is-active", other === button);

        render();
        window.scrollTo(0, 0);
    });
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-horizon]")) {
    button.addEventListener("click", () => {
        horizon = Number(button.dataset.horizon ?? 90);

        for (const other of document.querySelectorAll("[data-horizon]")) other.classList.toggle("is-active", other === button);

        render();
    });
}

render();
