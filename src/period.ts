// src/period.ts
// Calcul des périodes du tableau de bord (aucun accès au stockage ici).
// Les jours sont comptés en heure locale, bornes incluses.

import type { PeriodChoice, PeriodPreset } from "./storage.js";

export interface ResolvedPeriod {
    start: Date;
    end: Date;
    // Période précédente de même durée (pour comparer).
    previousStart: Date;
    previousEnd: Date;
    // Texte court des cartes : « Aujourd'hui », « 7 jours »…
    label: string;
    // Texte du bouton : « Aujourd'hui », « 12 sept. – 3 oct. »…
    buttonLabel: string;
    // Fin de la phrase de comparaison : « hier » ou « période précédente ».
    comparedTo: string;
}

export const PRESET_LABELS: Record<Exclude<PeriodPreset, "custom">, string> = {
    today: "Aujourd'hui",
    "7d": "7 derniers jours",
    "1m": "1 mois",
    "3m": "3 mois",
    "6m": "6 mois"
};

const SHORT_LABELS: Record<PeriodPreset, string> = {
    today: "Aujourd'hui",
    "7d": "7 jours",
    "1m": "1 mois",
    "3m": "3 mois",
    "6m": "6 mois",
    custom: "Personnalisée"
};

export function startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfDay(date: Date): Date {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        23,
        59,
        59,
        999
    );
}

function addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Recule de n mois en gardant le jour (31 mars − 1 mois → 28 ou 29 février). */
function addMonths(date: Date, months: number): Date {
    const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
    const lastDay = new Date(
        target.getFullYear(),
        target.getMonth() + 1,
        0
    ).getDate();

    return new Date(
        target.getFullYear(),
        target.getMonth(),
        Math.min(date.getDate(), lastDay)
    );
}

/** « 2026-10-04 » → date locale (sans décalage de fuseau). */
export function parseDay(value: string): Date {
    const [y, m, d] = value.split("-").map(Number);

    return new Date(y, m - 1, d);
}

/** Date locale → « 2026-10-04 » (valeur d'un champ date). */
export function formatDay(date: Date): string {
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    return `${date.getFullYear()}-${m}-${d}`;
}

function shortDate(date: Date, withYear: boolean): string {
    return date
        .toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
            ...(withYear ? { year: "numeric" } : {})
        })
        .replace(".", "");
}

export function resolvePeriod(
    choice: PeriodChoice,
    now: Date = new Date()
): ResolvedPeriod {
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
    const sameYear =
        start.getFullYear() === end.getFullYear() &&
        end.getFullYear() === today.getFullYear();

    const customLabel =
        start.getTime() === startOfDay(end).getTime()
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
