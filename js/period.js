// src/period.ts
// Calcul des périodes du tableau de bord (aucun accès au stockage ici).
// Les jours sont comptés en heure locale, bornes incluses.
export const PRESET_LABELS = {
    today: "Aujourd'hui",
    "7d": "7 derniers jours",
    "1m": "1 mois",
    "3m": "3 mois",
    "6m": "6 mois"
};
const SHORT_LABELS = {
    today: "Aujourd'hui",
    "7d": "7 jours",
    "1m": "1 mois",
    "3m": "3 mois",
    "6m": "6 mois",
    custom: "Personnalisée"
};
export function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
export function endOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}
function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
/** Recule de n mois en gardant le jour (31 mars − 1 mois → 28 ou 29 février). */
function addMonths(date, months) {
    const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
}
/** « 2026-10-04 » → date locale (sans décalage de fuseau). */
export function parseDay(value) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
}
/** Date locale → « 2026-10-04 » (valeur d'un champ date). */
export function formatDay(date) {
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${m}-${d}`;
}
function shortDate(date, withYear) {
    return date
        .toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        ...(withYear ? { year: "numeric" } : {})
    })
        .replace(".", "");
}
export function resolvePeriod(choice, now = new Date()) {
    const today = startOfDay(now);
    let start = today;
    let end = endOfDay(today);
    switch (choice.preset) {
        case "7d":
            start = addDays(today, -6);
            break;
        case "1m":
            start = addDays(addMonths(today, -1), 1);
            break;
        case "3m":
            start = addDays(addMonths(today, -3), 1);
            break;
        case "6m":
            start = addDays(addMonths(today, -6), 1);
            break;
        case "custom":
            if (choice.from !== null && choice.to !== null) {
                start = startOfDay(parseDay(choice.from));
                end = endOfDay(parseDay(choice.to));
            }
            break;
        default:
            break;
    }
    // Durée en jours (bornes incluses) ; la période précédente la précède directement.
    const days = Math.round((startOfDay(end).getTime() - start.getTime()) / 86_400_000) + 1;
    const previousEnd = endOfDay(addDays(start, -1));
    const previousStart = addDays(start, -days);
    const isCustom = choice.preset === "custom";
    const sameYear = start.getFullYear() === end.getFullYear() &&
        end.getFullYear() === today.getFullYear();
    const customLabel = start.getTime() === startOfDay(end).getTime()
        ? shortDate(start, !sameYear)
        : `${shortDate(start, !sameYear)} – ${shortDate(end, !sameYear)}`;
    return {
        start,
        end,
        previousStart,
        previousEnd,
        label: isCustom ? customLabel : SHORT_LABELS[choice.preset],
        buttonLabel: isCustom
            ? customLabel
            : choice.preset === "today"
                ? "Aujourd'hui"
                : SHORT_LABELS[choice.preset],
        comparedTo: choice.preset === "today" ? "hier" : "période précédente"
    };
}
//# sourceMappingURL=period.js.map