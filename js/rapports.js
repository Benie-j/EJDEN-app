// src/rapports.ts
// Centre de rapports EJDEN : période, comparaison, filtres, rapports par catégorie,
// analyses, rapport personnalisé, exports Excel / PDF et impression.
// Les textes issus des données passent uniquement par textContent.
import { getClients, getProducts, getShopSettings, getUserProfile } from "./storage.js";
import { getCategories } from "./storage.js";
import { COMPARE_LABELS, PERIOD_LABELS, computeReport, emptyFilters, methodLabel, rangeLabel, resolveComparison, resolvePeriod, sod } from "./report-engine.js";
import { buildPdf, buildXlsx, saveFile } from "./report-files.js";
import { can } from "./report-permissions.js";
import { getReportPermissions } from "./report-permissions.js";
import { SECTION_LABELS, buildSections, describeFilters, fcfa, permissionFor, toPdfBlocks } from "./report-sections.js";
import { shareText } from "./share.js";
import { createToast, el } from "./ui.js";
function byId(id) {
    const node = document.getElementById(id);
    if (!node)
        throw new Error(`EJDEN : élément #${id} introuvable.`);
    return node;
}
const toast = createToast();
const perms = getReportPermissions();
const SVG = "http://www.w3.org/2000/svg";
const state = {
    tab: "overview",
    period: "month",
    custom: null,
    compare: "previous",
    cmpCustom: null,
    filters: { productId: "", category: "", clientId: "", method: "", status: "active" },
    reportSub: "sales",
    analysisSub: "trends",
    exportSel: new Set(["sales", "products", "stock", "clients", "payments", "credits", "movements", "analyses"]),
    expanded: new Set(),
    print: { detail: false, charts: true, landscape: false },
    builder: {
        period: "month", custom: null,
        cats: new Set(["sales", "products", "payments"]),
        picks: new Set(["revenue", "count", "average", "products/top", "payments/methods"]),
        charts: true, detail: false
    }
};
const ANALYSIS_SUBS = [["trends", "Tendances"], ["compare", "Comparaisons"], ["anomalies", "Anomalies"], ["forecast", "Prévisions"], ["insights", "Insights EJDEN"]];
const REPORT_SUBS = ["sales", "products", "stock", "clients", "payments", "credits", "team"];
/* ---------- Calcul ---------- */
function currentRange() { return resolvePeriod(state.period, state.custom ?? undefined); }
function buildReport(periodKey = state.period, custom = state.custom) {
    const range = resolvePeriod(periodKey, custom ?? undefined);
    const filters = { ...emptyFilters(range), ...state.filters };
    const cmp = resolveComparison(state.compare, periodKey, range, state.cmpCustom ?? undefined);
    const report = computeReport(filters, cmp);
    return { report, sections: buildSections(report, perms) };
}
function filterNames() {
    return {
        product: getProducts().find((p) => p.id === state.filters.productId)?.name ?? "",
        client: getClients().find((c) => c.id === state.filters.clientId)?.name ?? ""
    };
}
/* ---------- Composants ---------- */
function kpiGrid(kpis, mainFirst = false) {
    const grid = el("div", "rc-kpis");
    kpis.forEach((k, i) => {
        const card = el("div", mainFirst && i === 0 ? "rc-kpi is-main" : "rc-kpi");
        card.append(el("span", undefined, k.label), el("strong", undefined, k.value));
        if (k.delta)
            card.append(el("em", k.tone ? `is-${k.tone}` : undefined, k.delta));
        grid.append(card);
    });
    return grid;
}
function cardWith(title, ...children) {
    const card = el("section", "rc-card");
    card.append(el("h2", undefined, title), ...children);
    return card;
}
function emptyText(text = "Aucune donnée disponible pour cette période.") {
    return el("p", "rc-empty", text);
}
function unavailable(title, reason) {
    const card = el("section", "rc-card rc-unavailable");
    card.append(el("strong", undefined, `${title} — analyse indisponible`), el("p", undefined, reason), el("p", undefined, "Continuez à utiliser EJDEN pour améliorer la précision de cette analyse."));
    return card;
}
function chartEl(c) {
    if (c.values.length === 0 || c.values.every((v) => v === 0))
        return null;
    const w = 320;
    const h = 150;
    const pad = 16;
    const max = Math.max(...c.values, 1);
    const bw = (w - 2 * pad) / c.values.length;
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.setAttribute("class", "rc-chart");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", c.title);
    c.values.forEach((v, i) => {
        const bh = (v / max) * (h - 44);
        const r = document.createElementNS(SVG, "rect");
        const tip = document.createElementNS(SVG, "title");
        r.setAttribute("class", "rc-bar");
        r.setAttribute("x", String(pad + i * bw + bw * 0.12));
        r.setAttribute("y", String(h - 22 - bh));
        r.setAttribute("width", String(Math.max(1, bw * 0.76)));
        r.setAttribute("height", String(Math.max(v > 0 ? 1 : 0, bh)));
        r.setAttribute("rx", "2");
        tip.textContent = `${c.labels[i] ?? ""} : ${Math.round(v).toLocaleString("fr-FR")}`;
        r.append(tip);
        svg.append(r);
    });
    const axis = document.createElementNS(SVG, "line");
    axis.setAttribute("class", "rc-axis");
    axis.setAttribute("x1", String(pad));
    axis.setAttribute("x2", String(w - pad));
    axis.setAttribute("y1", String(h - 22));
    axis.setAttribute("y2", String(h - 22));
    svg.append(axis);
    const label = (txt, x, y, anchor) => {
        const t = document.createElementNS(SVG, "text");
        t.setAttribute("x", String(x));
        t.setAttribute("y", String(y));
        t.setAttribute("text-anchor", anchor);
        t.textContent = txt;
        svg.append(t);
    };
    label(c.labels[0] ?? "", pad, h - 8, "start");
    label(c.labels[c.labels.length - 1] ?? "", w - pad, h - 8, "end");
    label(`max ${Math.round(max).toLocaleString("fr-FR")}`, w - pad, 10, "end");
    const wrap = el("div", "rc-card");
    wrap.append(el("h3", undefined, c.title), svg);
    return wrap;
}
function tableEl(t, key, limit) {
    const card = el("section", "rc-card");
    card.append(el("h3", undefined, t.title));
    if (t.rows.length === 0) {
        card.append(emptyText(t.note));
        return card;
    }
    const expanded = state.expanded.has(key);
    const rows = limit !== null && !expanded ? t.rows.slice(0, limit) : t.rows;
    const table = el("table", "rc-table");
    const head = el("tr");
    const isNum = (v) => typeof v === "number";
    t.headers.forEach((h, i) => head.append(Object.assign(el("th", i > 0 && isNum(t.rows[0][i]) ? "is-num" : undefined, h), {})));
    const thead = el("thead");
    thead.append(head);
    table.append(thead);
    const body = el("tbody");
    for (const row of rows) {
        const tr = el("tr");
        row.forEach((v, i) => tr.append(el("td", isNum(v) ? "is-num" : undefined, typeof v === "number" ? v.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : v)));
        body.append(tr);
    }
    table.append(body);
    const scroll = el("div", "rc-scroll");
    scroll.append(table);
    card.append(scroll);
    if (t.note && t.rows.length > 0 && t.rows[0].length > 1)
        card.append(el("p", undefined, t.note));
    if (limit !== null && t.rows.length > limit && !expanded) {
        const more = el("button", "secondary-button rc-more", `Afficher les ${t.rows.length} lignes`);
        more.type = "button";
        more.addEventListener("click", () => { state.expanded.add(key); render(); });
        card.append(more);
    }
    return card;
}
function sectionView(s, limit, prefix, charts = true) {
    const out = [];
    if (s.kpis.length)
        out.push(kpiGrid(s.kpis));
    if (charts && s.chart) {
        const c = chartEl(s.chart);
        if (c)
            out.push(c);
    }
    for (const t of s.tables)
        out.push(tableEl(t, `${prefix}/${s.id}/${t.id}`, limit));
    if (s.message)
        out.push(el("p", "rc-note", s.message));
    return out;
}
function insightCard(i) {
    const c = el("article", `rc-insight is-${i.level}`);
    c.append(el("strong", undefined, i.title), el("p", undefined, i.explanation), el("small", undefined, `${i.type} · ${i.period} · ${i.data}${i.confidence ? ` · confiance ${i.confidence}` : ""}`));
    return c;
}
/* ---------- Vues ---------- */
function viewOverview(r, sections) {
    const sales = sections.find((s) => s.id === "sales");
    const out = [];
    if (r.totals.count === 0 && r.totals.cancelledCount === 0)
        out.push(emptyText());
    out.push(kpiGrid(sales.kpis.slice(0, 4), true));
    if (r.comparison && r.previousNote)
        out.push(el("p", "rc-note", r.previousNote));
    else if (r.previous && r.comparison)
        out.push(el("p", "rc-empty", `Comparé à : ${rangeLabel(r.comparison)}`));
    if (sales.chart) {
        const c = chartEl(sales.chart);
        if (c)
            out.push(c);
    }
    if (r.insights.length > 0 && perms.view_advanced_analytics) {
        const box = cardWith("Insights EJDEN");
        r.insights.slice(0, 3).forEach((i) => box.append(insightCard(i)));
        out.push(box);
    }
    else if (perms.view_advanced_analytics) {
        out.push(unavailable("Insights EJDEN", "Pas encore assez de données pour produire des observations utiles."));
    }
    const money = sections.find((s) => s.id === "payments");
    if (money)
        out.push(kpiGrid(money.kpis));
    return out;
}
function viewReports(sections) {
    const s = sections.find((x) => x.id === state.reportSub);
    if (!s)
        return [el("p", "rc-note", "Vous n'avez pas accès à ce rapport.")];
    const out = sectionView(s, 10, "view");
    if (s.id === "stock") {
        const mv = sections.find((x) => x.id === "movements");
        if (mv)
            out.push(...mv.tables.map((t) => tableEl(t, "view/movements", 10)));
    }
    return out;
}
function viewAnalyses(r) {
    if (!perms.view_advanced_analytics)
        return [el("p", "rc-note", "Vous n'avez pas accès aux analyses avancées.")];
    const out = [];
    const num = (v) => Math.round(v).toLocaleString("fr-FR");
    switch (state.analysisSub) {
        case "trends": {
            if (r.trend.available) {
                const t = r.trend;
                out.push(cardWith("Tendance des ventes", el("p", undefined, `Direction : ${t.direction}${t.acceleration && t.acceleration !== "stable" ? ` (${t.acceleration})` : ""}`), el("p", undefined, `Évolution estimée sur ${r.historyDays} jours : ${t.relative > 0 ? "+" : ""}${t.relative.toFixed(1).replace(".", ",")} %`), el("p", undefined, `Pente : ${num(t.slopePerDay)} FCFA/jour · R² ${t.r2.toFixed(2).replace(".", ",")} · fiabilité ${t.confidence}`)));
                const last = t.ma7.slice(-60);
                const labels = r.daily.length ? last.map((_, i) => String(i + 1)) : [];
                const c = chartEl({ title: "Moyenne mobile 7 jours (60 derniers jours)", labels, values: last.map((v) => v ?? 0) });
                if (c)
                    out.push(c);
            }
            else
                out.push(unavailable("Tendance", r.trend.reason));
            if (r.variability.available) {
                const v = r.variability;
                out.push(cardWith("Variabilité des ventes quotidiennes", el("p", undefined, `Moyenne ${num(v.mean)} · médiane ${num(v.median)} FCFA`), el("p", undefined, `Écart-type ${num(v.std)} · variance ${num(v.variance)}${v.cv !== null ? ` · coefficient de variation ${Math.round(v.cv * 100)} %` : ""}`)));
            }
            else
                out.push(unavailable("Variabilité", r.variability.reason));
            if (r.seasonality.available) {
                const rows = r.seasonality.weekday.map((x) => el("p", undefined, `${x.label} : ${x.index > 0 ? "+" : ""}${Math.round(x.index)} % par rapport à votre moyenne quotidienne`));
                out.push(cardWith("Saisonnalité (jours de la semaine)", ...rows, el("p", undefined, `${r.seasonality.monthNote} Fiabilité : ${r.seasonality.confidence}.`)));
            }
            else
                out.push(unavailable("Saisonnalité", r.seasonality.reason));
            break;
        }
        case "compare": {
            if (!r.comparison)
                out.push(el("p", "rc-note", "Choisissez une période de comparaison dans « Comparer avec »."));
            else if (!r.previous)
                out.push(unavailable("Comparaison", r.previousNote ?? "Données insuffisantes."));
            else {
                const p = r.previous;
                const rows = [["Chiffre d'affaires (FCFA)", r.totals.revenue, p.revenue], ["Transactions", r.totals.count, p.count], ["Panier moyen (FCFA)", r.totals.average, p.average], ["Produits vendus", r.totals.units, p.units]];
                const table = el("table", "rc-table");
                const head = el("tr");
                ["Indicateur", "Période", "Comparée", "Évolution"].forEach((h) => head.append(el("th", undefined, h)));
                const thead = el("thead");
                thead.append(head);
                table.append(thead);
                const body = el("tbody");
                for (const [label, a, b] of rows) {
                    const tr = el("tr");
                    const ch = b === 0 ? "—" : `${a >= b ? "↑ +" : "↓ −"}${Math.abs(((a - b) / b) * 100).toFixed(1).replace(".", ",")} %`;
                    [label, num(a), num(b), ch].forEach((v) => tr.append(el("td", undefined, v)));
                    body.append(tr);
                }
                table.append(body);
                const sc = el("div", "rc-scroll");
                sc.append(table);
                out.push(cardWith(`${rangeLabel(r.filters.range)} vs ${rangeLabel(r.comparison)}`, sc));
            }
            out.push(el("p", "rc-note", "Les comparaisons contextuelles (ex. un lundi avec les lundis précédents) sont fiables à partir de 4 semaines d'historique ; voir Tendances > Saisonnalité."));
            break;
        }
        case "anomalies": {
            if (!r.anomalies.available) {
                out.push(unavailable("Anomalies", r.anomalies.reason));
                break;
            }
            const a = r.anomalies;
            out.push(cardWith("Activité habituelle", el("p", undefined, `${num(a.low)} – ${num(a.high)} FCFA par jour (fiabilité ${a.confidence})`)));
            out.push(a.items.length === 0 ? cardWith("Valeurs inhabituelles", emptyText("Aucune valeur inhabituelle sur cette période.")) : cardWith("Valeurs inhabituelles", ...a.items.map((x) => el("p", undefined, `${x.day} : ${num(x.value)} FCFA — activité exceptionnellement ${x.kind} (z = ${x.z.toFixed(1).replace(".", ",")})`))));
            break;
        }
        case "forecast": {
            if (r.forecast.available) {
                const f = r.forecast;
                out.push(cardWith(`Ventes estimées, ${f.nextDays} prochains jours`, el("p", undefined, `Environ ${num(f.expectedRevenue)} FCFA (entre ${num(f.low)} et ${num(f.high)})`), el("p", undefined, `Fiabilité : ${f.confidence}. Estimation fondée sur la moyenne des 14 derniers jours, sans garantie.`)));
            }
            else
                out.push(unavailable("Prévision des ventes", r.forecast.reason));
            const risk = r.stock.rows.filter((x) => x.daysLeft !== null).sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 10);
            out.push(risk.length === 0 ? unavailable("Risque de rupture", "EJDEN a besoin d'au moins 7 jours d'historique et de ventes sur les produits concernés.") : cardWith("Risque de rupture estimé", ...risk.map((x) => el("p", undefined, `${x.name} : stock ${x.stock}, ${x.dailyRate.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}/jour → environ ${Math.max(0, Math.round(x.daysLeft))} jour(s)${r.historyDays < 30 ? " (historique limité)" : ""}`))));
            break;
        }
        default: {
            if (r.insights.length === 0)
                out.push(unavailable("Insights EJDEN", "Aucune observation notable pour cette période ou historique insuffisant."));
            else
                r.insights.forEach((i) => out.push(insightCard(i)));
        }
    }
    return out;
}
/* ---------- Rapport personnalisé ---------- */
function viewCustom() {
    const b = state.builder;
    const out = [];
    const rerender = () => render();
    const check = (label, on, change) => {
        const row = el("label", "rc-check");
        const input = el("input");
        input.type = "checkbox";
        input.checked = on;
        input.addEventListener("change", () => { change(input.checked); rerender(); });
        row.append(input, el("span", undefined, label));
        return row;
    };
    const step = (n, title, ...nodes) => {
        const card = el("section", "rc-card");
        const h = el("h2", "rc-step-title");
        h.append(el("b", undefined, String(n)), document.createTextNode(title));
        card.append(h, ...nodes);
        return card;
    };
    // 1. Période
    const sel = el("select");
    Object.keys(PERIOD_LABELS).forEach((k) => { const o = el("option", undefined, PERIOD_LABELS[k]); o.value = k; sel.append(o); });
    sel.value = b.period;
    sel.setAttribute("aria-label", "Période du rapport personnalisé");
    sel.addEventListener("change", () => { b.period = sel.value; if (b.period === "custom" && !b.custom)
        b.custom = currentRange(); rerender(); });
    const p1 = [sel];
    if (b.period === "custom") {
        const g = el("div", "rc-grid2");
        g.append(dateField("Du", b.custom.start, (d) => { b.custom = { start: d, end: b.custom.end }; rerender(); }), dateField("Au", b.custom.end, (d) => { b.custom = { start: b.custom.start, end: d }; rerender(); }));
        p1.push(g);
    }
    out.push(step(1, "Période", ...p1));
    // 2. Catégories
    const catBox = el("div", "rc-checks");
    const allIds = ["sales", "products", "stock", "clients", "payments", "credits", "team", "movements", "analyses"];
    for (const id of allIds.filter((i) => permissionFor(i, perms)))
        catBox.append(check(SECTION_LABELS[id], b.cats.has(id), (v) => { if (v)
            b.cats.add(id);
        else
            b.cats.delete(id); }));
    out.push(step(2, "Catégories", catBox));
    // 3. Indicateurs
    const { sections } = buildReport(b.period, b.custom);
    const ind = el("div", "rc-checks");
    for (const s of sections.filter((x) => b.cats.has(x.id))) {
        ind.append(el("p", "rc-group", s.label));
        s.kpis.forEach((k) => ind.append(check(k.label, b.picks.has(k.id), (v) => { if (v)
            b.picks.add(k.id);
        else
            b.picks.delete(k.id); })));
        s.tables.forEach((t) => { const key = `${s.id}/${t.id}`; ind.append(check(`Tableau : ${t.title}`, b.picks.has(key), (v) => { if (v)
            b.picks.add(key);
        else
            b.picks.delete(key); })); });
    }
    if (b.cats.size === 0)
        ind.append(emptyText("Choisissez au moins une catégorie."));
    out.push(step(3, "Indicateurs", ind));
    // 4. Filtres
    out.push(step(4, "Filtres", el("p", "rc-empty", describeFilters(buildReport(b.period, b.custom).report, filterNames()).slice(1).join(" — ") + ". Modifiez les filtres en haut de la page.")));
    // 5-6. Graphiques et détail
    out.push(step(5, "Graphiques", check("Inclure les graphiques", b.charts, (v) => { b.charts = v; })));
    out.push(step(6, "Niveau de détail", check("Détail complet (sinon résumé : 10 lignes par tableau)", b.detail, (v) => { b.detail = v; })));
    // 7. Aperçu
    const custom = customSections();
    const prev = el("section", "rc-card");
    prev.append(el("h2", "rc-step-title"), ...[]);
    prev.firstElementChild.append(el("b", undefined, "7"), document.createTextNode("Aperçu"));
    if (custom.length === 0)
        prev.append(emptyText("Sélectionnez des indicateurs pour voir l'aperçu."));
    else
        for (const s of custom) {
            prev.append(el("h3", undefined, s.label));
            sectionView(s, b.detail ? null : 10, "custom", b.charts).forEach((n) => prev.append(n));
        }
    out.push(prev);
    // 8. Export
    const btns = el("div", "rc-btns");
    btns.append(actionButton("Excel", () => doExport("xlsx", custom, "Rapport_personnalisé"), "export_reports"), actionButton("PDF", () => doExport("pdf", custom, "Rapport_personnalisé"), "export_reports"), actionButton("Imprimer", () => openPrint(custom, b.charts, b.detail), "print_reports"));
    out.push(step(8, "Exporter / imprimer", btns));
    return out;
}
function customSections() {
    const b = state.builder;
    const { sections } = buildReport(b.period, b.custom);
    const out = [];
    for (const s of sections) {
        if (!b.cats.has(s.id))
            continue;
        const kpis = s.kpis.filter((k) => b.picks.has(k.id));
        const tables = s.tables.filter((t) => b.picks.has(`${s.id}/${t.id}`));
        if (kpis.length + tables.length === 0)
            continue;
        out.push({ ...s, kpis, tables, chart: b.charts && kpis.length > 0 ? s.chart : undefined, message: undefined });
    }
    return out;
}
/* ---------- Export / impression ---------- */
function dateField(label, value, onChange) {
    const f = el("div", "field");
    const id = `d${Math.random().toString(36).slice(2, 8)}`;
    const input = el("input");
    const lab = el("label", undefined, label);
    lab.htmlFor = id;
    input.id = id;
    input.type = "date";
    input.value = toInput(value);
    input.addEventListener("change", () => { const d = fromInput(input.value); if (d)
        onChange(d);
    else
        toast("Date invalide."); });
    f.append(lab, input);
    return f;
}
function actionButton(label, run, perm, primary = true) {
    const b = el("button", primary ? "primary-button" : "secondary-button", label);
    b.type = "button";
    b.disabled = !can(perm);
    b.addEventListener("click", run);
    return b;
}
function fileBase(range) {
    const a = range.start;
    const e = range.end;
    const month = (d) => d.toLocaleDateString("fr-FR", { month: "long" }).replace(/^./, (c) => c.toUpperCase());
    const p2 = (n) => String(n).padStart(2, "0");
    if (a.getFullYear() === e.getFullYear() && a.getMonth() === e.getMonth())
        return `${p2(a.getDate())}-${p2(e.getDate())}_${month(a)}_${a.getFullYear()}`;
    return `${p2(a.getDate())}-${p2(a.getMonth() + 1)}-${a.getFullYear()}_au_${p2(e.getDate())}-${p2(e.getMonth() + 1)}-${e.getFullYear()}`;
}
function who() {
    const u = getUserProfile();
    return `${u.firstName} ${u.lastName}`.trim();
}
async function doExport(kind, sections, baseName = "Rapport") {
    if (!can("export_reports")) {
        toast("Export non autorisé.");
        return;
    }
    if (sections.length === 0) {
        toast("Sélectionnez au moins un rapport.");
        return;
    }
    const isCustom = baseName !== "Rapport";
    const { report } = isCustom ? buildReport(state.builder.period, state.builder.custom) : buildReport();
    const shop = getShopSettings();
    const range = report.filters.range;
    const name = `EJDEN_${baseName}_${fileBase(range)}.${kind}`;
    const ctx = describeFilters(report, filterNames());
    const now = new Date().toLocaleString("fr-FR");
    try {
        let result;
        if (kind === "xlsx") {
            const sales = sections.find((s) => s.id === "sales");
            const synth = {
                name: "Synthèse",
                lines: [shop.name || "EJDEN", ...ctx, `Généré le ${now}${who() ? ` par ${who()}` : ""}`],
                kpis: (sales?.kpis ?? []).map((k) => [k.label, k.delta ? `${k.value} (${k.delta})` : k.value]),
                tables: [{ title: "Insights EJDEN", headers: ["Type", "Importance", "Observation", "Explication", "Période", "Confiance"], rows: perms.view_advanced_analytics ? report.insights.map((i) => [i.type, i.level, i.title, i.explanation, i.period, i.confidence ?? "—"]) : [], note: report.insights.length ? undefined : "Aucun insight disponible pour cette période." }]
            };
            const sheets = [synth, ...sections.map((s) => ({ name: s.label, kpis: s.kpis.map((k) => [k.label, k.value]), tables: s.tables, lines: [...(s.message ? [s.message] : []), ...ctx.slice(0, 1)] }))];
            result = await saveFile(name, buildXlsx(sheets, `EJDEN — ${shop.name || "Rapport"}`), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        }
        else {
            const bytes = buildPdf(toPdfBlocks(sections, report, !state.print.detail), {
                landscape: state.print.landscape, title: isCustom ? "Rapport personnalisé" : "Rapport d'activité", shop: shop.name || "EJDEN",
                subtitle: [...ctx, `Généré le ${now}${who() ? ` par ${who()}` : ""}`], footer: `${shop.name || "EJDEN"} — rapport généré par EJDEN`,
                summary: !state.print.detail, charts: state.print.charts
            });
            result = await saveFile(name, bytes, "application/pdf");
        }
        if (result !== "cancelled")
            toast(result === "shared" ? "Fichier prêt à partager." : "Fichier téléchargé.");
    }
    catch {
        toast("Impossible de créer le fichier.");
    }
}
function closePrint() {
    const area = byId("printArea");
    area.hidden = true;
    area.classList.remove("is-preview");
    area.replaceChildren();
}
function openPrint(sections, charts, detail) {
    if (!can("print_reports")) {
        toast("Impression non autorisée.");
        return;
    }
    if (sections.length === 0) {
        toast("Sélectionnez au moins un rapport.");
        return;
    }
    const isCustom = state.tab === "custom";
    const { report } = isCustom ? buildReport(state.builder.period, state.builder.custom) : buildReport();
    const shop = getShopSettings();
    const area = byId("printArea");
    const head = el("header", "rc-print-head");
    head.append(el("h1", undefined, shop.name || "EJDEN"), el("p", undefined, isCustom ? "Rapport personnalisé" : "Rapport d'activité"));
    describeFilters(report, filterNames()).forEach((l) => head.append(el("p", undefined, l)));
    head.append(el("p", undefined, `Généré le ${new Date().toLocaleString("fr-FR")}${who() ? ` par ${who()}` : ""}${shop.phone ? ` · Tél ${shop.phone}` : ""}`));
    const bar = el("div", "rc-print-bar");
    const close = el("button", undefined, "Fermer");
    const go = el("button", undefined, "Imprimer");
    close.type = "button";
    go.type = "button";
    close.addEventListener("click", closePrint);
    go.addEventListener("click", () => window.print());
    bar.append(close, go);
    area.replaceChildren(bar, head);
    for (const s of sections) {
        area.append(el("h2", undefined, s.label));
        sectionView(s, detail ? null : 10, "print", charts).forEach((n) => area.append(n));
    }
    area.classList.toggle("is-landscape", state.print.landscape);
    area.classList.add("is-preview");
    area.hidden = false;
    area.scrollTop = 0;
}
function viewExport() {
    const out = [];
    const ids = ["sales", "products", "stock", "clients", "payments", "credits", "team", "movements", "analyses"].filter((i) => permissionFor(i, perms));
    const checks = el("div", "rc-checks");
    const mk = (label, on, change) => {
        const row = el("label", "rc-check");
        const input = el("input");
        input.type = "checkbox";
        input.checked = on;
        input.addEventListener("change", () => change(input.checked));
        row.append(input, el("span", undefined, label));
        return row;
    };
    ids.forEach((id) => checks.append(mk(SECTION_LABELS[id], state.exportSel.has(id), (v) => { if (v)
        state.exportSel.add(id);
    else
        state.exportSel.delete(id); })));
    out.push(cardWith("Rapports à exporter", checks));
    const opts = el("div", "rc-checks");
    opts.append(mk("Détail complet (sinon résumé)", state.print.detail, (v) => { state.print.detail = v; }), mk("Inclure les graphiques", state.print.charts, (v) => { state.print.charts = v; }), mk("Orientation paysage", state.print.landscape, (v) => { state.print.landscape = v; }));
    out.push(cardWith("Options PDF et impression", opts));
    const pick = () => buildReport().sections.filter((s) => state.exportSel.has(s.id));
    const btns = el("div", "rc-btns");
    btns.append(actionButton("Excel", () => void doExport("xlsx", pick()), "export_reports"), actionButton("PDF", () => void doExport("pdf", pick()), "export_reports"), actionButton("Aperçu / impression", () => openPrint(pick(), state.print.charts, state.print.detail), "print_reports", false));
    out.push(cardWith("Exporter", btns));
    const share = el("button", "secondary-button", "Partager un résumé (texte)");
    share.type = "button";
    share.addEventListener("click", () => {
        const { report } = buildReport();
        const T = report.totals;
        const text = [`*${getShopSettings().name || "EJDEN"}*`, `Rapport — ${rangeLabel(report.filters.range)}`, "", `Chiffre d'affaires : ${fcfa(T.revenue)}`, `Transactions : ${T.count}`, `Panier moyen : ${fcfa(T.average)}`].join("\n");
        void shareText("Rapport EJDEN", text).then((m) => { if (m)
            toast(m); });
    });
    out.push(share);
    return out;
}
/* ---------- Rendu principal ---------- */
function toInput(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromInput(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m)
        return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 ? d : null;
}
function renderSubtabs() {
    const box = byId("subtabs");
    box.replaceChildren();
    const chips = state.tab === "reports"
        ? REPORT_SUBS.filter((i) => permissionFor(i, perms)).map((i) => [i, SECTION_LABELS[i], state.reportSub === i])
        : state.tab === "analyses" ? ANALYSIS_SUBS.map(([k, l]) => [k, l, state.analysisSub === k]) : [];
    for (const [key, label, active] of chips) {
        const b = el("button", active ? "rc-chip is-active" : "rc-chip", label);
        b.type = "button";
        b.addEventListener("click", () => { if (state.tab === "reports")
            state.reportSub = key;
        else
            state.analysisSub = key; render(); });
        box.append(b);
    }
}
function render() {
    const view = byId("view");
    const range = currentRange();
    byId("customRange").hidden = state.period !== "custom";
    byId("customCompare").hidden = state.compare !== "custom";
    document.querySelectorAll(".rc-tab").forEach((t) => {
        t.classList.toggle("is-active", t.dataset.tab === state.tab);
        t.setAttribute("aria-selected", String(t.dataset.tab === state.tab));
    });
    renderSubtabs();
    if (!perms.view_reports) {
        view.replaceChildren(el("p", "rc-note", "Vous n'avez pas accès aux rapports."));
        return;
    }
    const { report, sections } = buildReport();
    byId("periodInfo").textContent = `Période analysée : ${rangeLabel(range)}${report.comparison ? ` · comparée à ${rangeLabel(report.comparison)}` : ""}`;
    const nodes = state.tab === "overview" ? viewOverview(report, sections)
        : state.tab === "reports" ? viewReports(sections)
            : state.tab === "analyses" ? viewAnalyses(report)
                : state.tab === "custom" ? viewCustom()
                    : viewExport();
    view.replaceChildren(...nodes);
}
/* ---------- Contrôles ---------- */
function fill(select, options, value) {
    select.replaceChildren(...options.map(([v, l]) => { const o = el("option", undefined, l); o.value = v; return o; }));
    select.value = value;
}
function initControls() {
    const period = byId("periodSelect");
    const compare = byId("compareSelect");
    const methods = [["", "Tous"], ...["cash", "mobile_money", "card", "other", "credit"].map((m) => [m, methodLabel(m)])];
    fill(period, Object.keys(PERIOD_LABELS).map((k) => [k, PERIOD_LABELS[k]]), state.period);
    fill(compare, Object.keys(COMPARE_LABELS).map((k) => [k, COMPARE_LABELS[k]]), state.compare);
    fill(byId("fProduct"), [["", "Tous"], ...getProducts().map((p) => [p.id, p.name])], "");
    fill(byId("fCategory"), [["", "Toutes"], ...getCategories().map((c) => [c, c])], "");
    fill(byId("fClient"), [["", "Tous"], ...getClients().map((c) => [c.id, c.name])], "");
    fill(byId("fMethod"), methods, "");
    fill(byId("fStatus"), [["active", "Ventes valides"], ["all", "Toutes (annulées incluses)"], ["cancelled", "Annulées"], ["credit", "À crédit"]], "active");
    const today = new Date();
    byId("dateFrom").value = toInput(new Date(today.getFullYear(), today.getMonth(), 1));
    byId("dateTo").value = toInput(today);
    byId("cmpFrom").value = toInput(new Date(today.getFullYear(), today.getMonth() - 1, 1));
    byId("cmpTo").value = toInput(new Date(today.getFullYear(), today.getMonth(), 0));
    const readCustom = () => {
        const a = fromInput(byId("dateFrom").value);
        const b = fromInput(byId("dateTo").value);
        if (!a || !b) {
            toast("Choisissez une date de début et une date de fin valides.");
            return;
        }
        state.custom = { start: sod(a), end: sod(b) };
        render();
    };
    const readCompare = () => {
        const a = fromInput(byId("cmpFrom").value);
        const b = fromInput(byId("cmpTo").value);
        if (!a || !b) {
            toast("Dates de comparaison invalides.");
            return;
        }
        state.cmpCustom = { start: sod(a), end: sod(b) };
        render();
    };
    period.addEventListener("change", () => {
        state.period = period.value;
        if (state.period === "custom") {
            const a = fromInput(byId("dateFrom").value);
            const b = fromInput(byId("dateTo").value);
            if (a && b)
                state.custom = { start: a, end: b };
        }
        render();
    });
    compare.addEventListener("change", () => {
        state.compare = compare.value;
        if (state.compare === "custom") {
            const a = fromInput(byId("cmpFrom").value);
            const b = fromInput(byId("cmpTo").value);
            if (a && b)
                state.cmpCustom = { start: a, end: b };
        }
        render();
    });
    for (const id of ["dateFrom", "dateTo"])
        byId(id).addEventListener("change", readCustom);
    for (const id of ["cmpFrom", "cmpTo"])
        byId(id).addEventListener("change", readCompare);
    const bind = (id, apply) => byId(id).addEventListener("change", (e) => { apply(e.target.value); render(); });
    bind("fProduct", (v) => { state.filters.productId = v; });
    bind("fCategory", (v) => { state.filters.category = v; });
    bind("fClient", (v) => { state.filters.clientId = v; });
    bind("fMethod", (v) => { state.filters.method = v; });
    bind("fStatus", (v) => { state.filters.status = v; });
    byId("resetFilters").addEventListener("click", () => {
        state.filters = { productId: "", category: "", clientId: "", method: "", status: "active" };
        ["fProduct", "fCategory", "fClient", "fMethod"].forEach((id) => { byId(id).value = ""; });
        byId("fStatus").value = "active";
        render();
    });
    const toggle = byId("filtersToggle");
    toggle.addEventListener("click", () => {
        const panel = byId("filtersPanel");
        panel.hidden = !panel.hidden;
        toggle.setAttribute("aria-expanded", String(!panel.hidden));
    });
    document.querySelectorAll(".rc-tab").forEach((t) => t.addEventListener("click", () => { state.tab = t.dataset.tab; render(); }));
    window.addEventListener("afterprint", () => { });
}
initControls();
render();
//# sourceMappingURL=rapports.js.map