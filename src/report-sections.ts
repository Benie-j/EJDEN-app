// src/report-sections.ts
// Transforme un Report en sections (indicateurs + tableaux). La même structure
// alimente l'écran, l'export Excel, l'export PDF et l'impression : un seul calcul,
// des chiffres identiques partout.

import { type Report, fmtDay, rangeLabel } from "./report-engine.js";
import { type Table, type PdfBlock } from "./report-files.js";
import { type ReportPermissions } from "./report-permissions.js";
import { formatPercent, percentChange } from "./report-stats.js";

export type SectionId = "sales" | "products" | "stock" | "clients" | "payments" | "credits" | "team" | "movements" | "analyses";

export interface Kpi { id: string; label: string; value: string; delta?: string; tone?: "up" | "down" }
export interface STable extends Table { id: string }
export interface ChartData { title: string; labels: string[]; values: number[] }

export interface Section { id: SectionId; label: string; kpis: Kpi[]; tables: STable[]; chart?: ChartData; message?: string }

export const SECTION_LABELS: Record<SectionId, string> = {
    sales: "Ventes", products: "Produits", stock: "Stock", clients: "Clients", payments: "Paiements",
    credits: "Crédits", team: "Équipe", movements: "Mouvements", analyses: "Analyses"
};

const n0 = (v: number): string => Math.round(v).toLocaleString("fr-FR");
export const fcfa = (v: number): string => `${n0(v)} FCFA`;
const num = (v: number, d = 1): string => v.toLocaleString("fr-FR", { maximumFractionDigits: d });

export function delta(cur: number, prev: number | undefined | null): Pick<Kpi, "delta" | "tone"> {
    if (prev === undefined || prev === null) return {};

    const ch = percentChange(cur, prev);

    return ch === null ? {} : { delta: `${ch > 0 ? "↑" : ch < 0 ? "↓" : "="} ${formatPercent(ch)}`, tone: ch > 0 ? "up" : ch < 0 ? "down" : undefined };
}

export function permissionFor(id: SectionId, p: ReportPermissions): boolean {
    if (!p.view_reports) return false;
    if (id === "payments" || id === "credits") return p.view_financial_reports;
    if (id === "team") return p.view_team_reports;
    if (id === "analyses") return p.view_advanced_analytics;

    return true;
}

function t(id: string, title: string, headers: string[], rows: Array<Array<string | number>>, note?: string): STable {
    return { id, title, headers, rows, note };
}

export function buildSections(r: Report, p: ReportPermissions): Section[] {
    const T = r.totals;
    const P = r.previous;
    const days = r.daily.length;
    const out: Section[] = [];
    const wantMargin = p.view_financial_reports;

    /* Ventes */
    out.push({
        id: "sales", label: "Ventes",
        kpis: [
            { id: "revenue", label: "Chiffre d'affaires", value: fcfa(T.revenue), ...delta(T.revenue, P?.revenue) },
            { id: "count", label: "Transactions", value: n0(T.count), ...delta(T.count, P?.count) },
            { id: "units", label: "Produits vendus", value: num(T.units), ...delta(T.units, P?.units) },
            { id: "average", label: "Panier moyen", value: fcfa(T.average), ...delta(T.average, P?.average) },
            { id: "cancelled", label: "Ventes annulées", value: `${T.cancelledCount} (${fcfa(T.cancelledAmount)})` },
            ...(wantMargin ? [{ id: "margin", label: "Marge brute", value: T.margin === null ? "—" : fcfa(T.margin) }] : [])
        ],
        chart: { title: days > 62 ? "Chiffre d'affaires par semaine" : "Chiffre d'affaires par jour", labels: (days > 62 ? r.weekly : r.daily).map((d) => d.label), values: (days > 62 ? r.weekly : r.daily).map((d) => d.revenue) },
        tables: [
            t("by-day", "Ventes par jour", ["Jour", "Transactions", "CA (FCFA)"], r.daily.filter((d) => d.count > 0).map((d) => [fmtDay(d.date), d.count, Math.round(d.revenue)])),
            t("by-week", "Ventes par semaine", ["Semaine", "Transactions", "CA (FCFA)"], r.weekly.filter((d) => d.count > 0).map((d) => [d.label, d.count, Math.round(d.revenue)])),
            t("by-month", "Ventes par mois", ["Mois", "Transactions", "CA (FCFA)"], r.monthly.filter((d) => d.count > 0).map((d) => [d.label, d.count, Math.round(d.revenue)])),
            t("by-weekday", "Activité par jour de la semaine", ["Jour", "Transactions", "CA (FCFA)", "CA moyen/jour"], r.weekdays.filter((d) => d.count > 0).map((d) => [d.label, d.count, Math.round(d.revenue), Math.round(d.avgPerDay)])),
            t("by-hour", "Activité par heure", ["Heure", "Transactions", "CA (FCFA)"], r.hours.filter((h) => h.count > 0).map((h) => [`${String(h.hour).padStart(2, "0")}h`, h.count, Math.round(h.revenue)]))
        ]
    });

    /* Produits */
    const byQty = [...r.products].sort((a, b) => b.qty - a.qty);
    const rising = r.products.filter((x) => x.prevQty !== null && x.prevQty > 0 && x.qty > x.prevQty).sort((a, b) => b.qty / b.prevQty! - a.qty / a.prevQty!);
    const falling = r.products.filter((x) => x.prevQty !== null && x.prevQty > 0 && x.qty < x.prevQty).sort((a, b) => a.qty / a.prevQty! - b.qty / b.prevQty!);
    const prow = (x: Report["products"][number]) => [x.name, x.category, x.qty, Math.round(x.amount), Math.round(x.share * 10) / 10, Math.round(x.frequency * 1000) / 10];
    const ph = ["Produit", "Catégorie", "Qté vendue", "CA (FCFA)", "Part (%)", "Fréquence (% jours)"];

    out.push({
        id: "products", label: "Produits",
        kpis: [{ id: "p-sold", label: "Produits vendus (références)", value: n0(r.products.length) }, { id: "p-none", label: "Produits sans vente", value: n0(r.noSaleProducts.length) }],
        tables: [
            t("top", "Produits les plus vendus", ph, r.products.map(prow)),
            t("bottom", "Produits les moins vendus", ph, byQty.slice().reverse().map(prow)),
            ...(r.previous ? [
                t("rising", "Produits en progression", ["Produit", "Qté", "Qté période comparée"], rising.map((x) => [x.name, x.qty, x.prevQty!])),
                t("falling", "Produits en baisse", ["Produit", "Qté", "Qté période comparée"], falling.map((x) => [x.name, x.qty, x.prevQty!]))
            ] : []),
            t("nosale", "Produits sans vente", ["Produit", "Stock actuel"], r.noSaleProducts.map((x) => [x.name, x.stock])),
            ...(r.products.some((x) => x.abc) ? [t("abc", "Classification ABC (80 / 15 / 5 % du CA)", ["Produit", "Classe", "Part (%)"], r.products.map((x) => [x.name, x.abc ?? "", Math.round(x.share * 10) / 10]))] : [])
        ],
        message: r.products.some((x) => x.abc) ? undefined : "Classification ABC indisponible : au moins 10 produits vendus sont nécessaires."
    });

    /* Stock */
    const st = r.stock;

    out.push({
        id: "stock", label: "Stock",
        kpis: [
            { id: "s-value", label: "Valeur du stock (prix d'achat)", value: fcfa(st.value) },
            { id: "s-in", label: "Entrées (période)", value: num(st.entries) },
            { id: "s-out", label: "Sorties (période)", value: num(st.exits) },
            { id: "s-rupt", label: "Ruptures", value: String(st.rows.filter((x) => x.status === "rupture").length) },
            { id: "s-low", label: "Proches de la rupture", value: String(st.rows.filter((x) => x.status === "faible").length) },
            { id: "s-rot", label: "Rotation moyenne", value: st.rotation === null ? "—" : `${num(st.rotation, 2)}×` }
        ],
        tables: [
            t("levels", "Stock actuel", ["Produit", "Stock", "Seuil", "Valeur (FCFA)", "Vendu (période)", "Statut"], st.rows.map((x) => [x.name, x.stock, x.threshold, Math.round(x.value), x.sold, x.status === "rupture" ? "Rupture" : x.status === "faible" ? "Faible" : "OK"])),
            t("risk", "Risque de rupture estimé", ["Produit", "Stock", "Vente moyenne/jour", "Jours restants", "Fiabilité"], st.rows.filter((x) => x.daysLeft !== null).sort((a, b) => a.daysLeft! - b.daysLeft!).map((x) => [x.name, x.stock, Math.round(x.dailyRate! * 100) / 100, Math.round(x.daysLeft! * 10) / 10, r.historyDays >= 30 ? "Moyenne" : "Faible (historique limité)"]), "Estimation fondée sur le rythme de vente de la période ; elle ne tient pas compte des réapprovisionnements futurs."),
            t("lowrot", "Produits à faible rotation", ["Produit", "Stock", "Vendu (période)"], st.rows.filter((x) => x.stock > 0 && x.sold === 0).map((x) => [x.name, x.stock, 0]))
        ]
    });

    /* Clients */
    const c = r.clients;

    out.push({
        id: "clients", label: "Clients",
        kpis: [
            { id: "c-total", label: "Clients enregistrés", value: String(c.total) },
            { id: "c-new", label: "Nouveaux clients", value: String(c.newCount) },
            { id: "c-active", label: "Clients actifs (période)", value: String(c.active) },
            { id: "c-rec", label: "Clients récurrents", value: String(c.recurring) },
            { id: "c-inactive", label: "Clients inactifs", value: String(c.inactive) },
            { id: "c-avg", label: "Montant moyen par client", value: fcfa(c.avgAmount) }
        ],
        tables: [
            t("best", "Meilleurs clients", ["Client", "Achats", "Montant (FCFA)", "Panier moyen", "Dernier achat", "Fréquence (jours)"], c.rows.filter((x) => x.count > 0).map((x) => [x.name, x.count, Math.round(x.amount), Math.round(x.average), x.lastAt ? fmtDay(new Date(x.lastAt)) : "—", x.intervalDays === null ? "—" : Math.round(x.intervalDays)])),
            t("inactive", "Clients inactifs", ["Client", "Dernier achat"], c.rows.filter((x) => x.count === 0 && x.status === "inactif").map((x) => [x.name, x.lastAt ? fmtDay(new Date(x.lastAt)) : "Jamais"]))
        ],
        message: "Segmentation RFM : disponible lorsque l'historique clients sera suffisant (fonction prévue)."
    });

    /* Paiements & crédits */
    const pay = r.payments;

    out.push({
        id: "payments", label: "Paiements",
        kpis: [
            { id: "pay-collected", label: "Montant encaissé", value: fcfa(pay.collected) },
            { id: "pay-receive", label: "Montant à recevoir", value: fcfa(pay.toReceive) },
            { id: "pay-credit", label: "Ventes à crédit", value: `${pay.creditSales} (${fcfa(pay.creditSalesAmount)})` }
        ],
        chart: { title: "Répartition des moyens de paiement (FCFA)", labels: pay.methods.map((m) => m.label), values: pay.methods.map((m) => m.amount) },
        tables: [t("methods", "Moyens de paiement", ["Moyen", "Transactions", "Montant (FCFA)", "Part (%)"], pay.methods.map((m) => [m.label, m.count, Math.round(m.amount), Math.round(m.share * 10) / 10]))]
    });

    out.push({
        id: "credits", label: "Crédits",
        kpis: [
            { id: "cr-share", label: "Part des ventes à crédit", value: formatPercent(pay.creditShare, false), ...(pay.prevCreditShare !== null ? delta(pay.creditShare, pay.prevCreditShare) : {}) },
            { id: "cr-repaid", label: "Crédits remboursés", value: fcfa(pay.repaid) },
            { id: "cr-late", label: "Crédits en retard", value: `${pay.overdueCount} (${fcfa(pay.overdue)})` }
        ],
        tables: [t("credit-list", "Ventes à crédit de la période", ["Date", "Client", "Montant (FCFA)", "Reste à payer (FCFA)"], pay.creditList.map((x) => [fmtDay(new Date(x.date)), x.client, Math.round(x.amount), Math.round(x.remaining)]))]
    });

    /* Équipe */
    out.push({
        id: "team", label: "Équipe", kpis: [],
        tables: [t("users", "Activité par utilisateur", ["Utilisateur", "Transactions", "Montant (FCFA)", "Annulations"], r.team.users.map((u) => [u.name, u.count, Math.round(u.amount), u.cancelled]))],
        message: r.team.note
    });

    out.push({
        id: "movements", label: "Mouvements", kpis: [],
        tables: [t("mv", "Mouvements de stock", ["Date", "Produit", "Type", "Quantité", "Avant", "Après", "Motif"], r.stock.movements.map((m) => [fmtDay(new Date(m.at)), m.product, m.type, m.quantity, m.before, m.after, m.reason]))]
    });

    /* Analyses */
    const an: STable[] = [];
    const na = (id: string, title: string, reason: string) => an.push(t(id, title, ["Analyse"], [[`Analyse indisponible — ${reason}`]]));

    if (r.variability.available) an.push(t("var", "Variabilité des ventes quotidiennes", ["Moyenne", "Médiane", "Écart-type", "Variance", "Coef. de variation"], [[Math.round(r.variability.mean), Math.round(r.variability.median), Math.round(r.variability.std), Math.round(r.variability.variance), r.variability.cv === null ? "—" : `${Math.round(r.variability.cv * 100)} %`]]));
    else na("var", "Variabilité", r.variability.reason);

    if (r.trend.available) an.push(t("trend", "Tendance", ["Direction", "Évolution sur l'historique", "Pente (FCFA/jour)", "Dynamique", "Fiabilité"], [[r.trend.direction, formatPercent(r.trend.relative), Math.round(r.trend.slopePerDay), r.trend.acceleration ?? "—", r.trend.confidence]]));
    else na("trend", "Tendance", r.trend.reason);

    if (r.anomalies.available) an.push(t("anom", "Anomalies détectées", ["Jour", "CA (FCFA)", "Z-score", "Type"], r.anomalies.items.map((x) => [x.day, Math.round(x.value), Math.round(x.z * 10) / 10, x.kind]), `Activité habituelle : ${n0(r.anomalies.low)} – ${n0(r.anomalies.high)} FCFA. Fiabilité : ${r.anomalies.confidence}.`));
    else na("anom", "Anomalies", r.anomalies.reason);

    if (r.seasonality.available) an.push(t("season", "Saisonnalité hebdomadaire (écart à la moyenne quotidienne)", ["Jour", "Écart (%)"], r.seasonality.weekday.map((x) => [x.label, Math.round(x.index)]), `${r.seasonality.monthNote} Fiabilité : ${r.seasonality.confidence}.`));
    else na("season", "Saisonnalité", r.seasonality.reason);

    if (r.forecast.available) an.push(t("fc", "Prévision des ventes (7 prochains jours)", ["Estimation (FCFA)", "Minimum", "Maximum", "Fiabilité"], [[Math.round(r.forecast.expectedRevenue), Math.round(r.forecast.low), Math.round(r.forecast.high), r.forecast.confidence]], "Estimation simple fondée sur la moyenne des 14 derniers jours ; ce n'est pas une garantie."));
    else na("fc", "Prévision", r.forecast.reason);

    an.push(t("insights", "Insights EJDEN", ["Type", "Importance", "Observation", "Explication", "Période", "Données", "Confiance"], r.insights.map((i) => [i.type, i.level, i.title, i.explanation, i.period, i.data, i.confidence ?? "—"])));
    out.push({ id: "analyses", label: "Analyses", kpis: [], tables: an });

    /* Crédits : liste réelle */
    return out.filter((s) => permissionFor(s.id, p));
}

/* Résumé de contexte pour en-têtes (période, filtres, comparaison) */
export function describeFilters(r: Report, names: { product: string; client: string }): string[] {
    const f = r.filters;
    const parts = [`Période : ${rangeLabel(f.range)}`];
    const crit: string[] = [];

    if (f.productId) crit.push(`Produit : ${names.product}`);
    if (f.category) crit.push(`Catégorie : ${f.category}`);
    if (f.clientId) crit.push(`Client : ${names.client}`);
    if (f.method) crit.push(`Paiement : ${f.method}`);
    if (f.status !== "active") crit.push(`Statut : ${f.status === "all" ? "toutes" : f.status === "cancelled" ? "annulées" : "à crédit"}`);

    parts.push(crit.length ? `Filtres : ${crit.join(" · ")}` : "Filtres : aucun");

    if (r.comparison) parts.push(r.previous ? `Comparaison : ${rangeLabel(r.comparison)}` : `Comparaison : ${rangeLabel(r.comparison)} (indisponible)`);

    return parts;
}

export function toPdfBlocks(sections: Section[], r: Report, summary: boolean): PdfBlock[] {
    const blocks: PdfBlock[] = [];

    for (const s of sections) {
        blocks.push({ kind: "h", text: s.label });

        if (s.kpis.length) blocks.push({ kind: "kpis", items: s.kpis.map((k) => [k.label, k.delta ? `${k.value}  ${k.delta}` : k.value]) });

        if (s.chart) blocks.push({ kind: "bars", title: s.chart.title, labels: s.chart.labels, values: s.chart.values });

        for (const tb of s.tables) {
            if (summary && s.id === "sales" && tb.id !== "by-day" && tb.id !== "by-weekday") continue;
            if (summary && (tb.id === "bottom" || tb.id === "by-hour" || tb.id === "by-week" || tb.id === "by-month")) continue;

            blocks.push({ kind: "table", table: tb });
        }

        if (s.message) blocks.push({ kind: "text", lines: [s.message] });
    }

    void r;

    return blocks;
}
