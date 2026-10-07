// src/report-stats.ts
// Outils statistiques purs (aucun accès au stockage). Chaque fonction qui exige un
// minimum de données renvoie null si l'échantillon est insuffisant : l'appelant
// affiche alors « analyse indisponible » au lieu d'inventer un résultat.

export const MIN = {
    // Jours d'historique nécessaires
    trendDays: 14,
    anomalyDays: 14,
    weekdayWeeks: 4,
    forecastDays: 21,
    seasonMonths: 12,
    // Achats minimum
    clientRecurring: 2
} as const;

export function sum(values: number[]): number {
    return values.reduce((a, b) => a + b, 0);
}

export function mean(values: number[]): number | null {
    return values.length === 0 ? null : sum(values) / values.length;
}

export function median(values: number[]): number | null {
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function variance(values: number[]): number | null {
    const m = mean(values);

    if (m === null || values.length < 2) return null;

    return sum(values.map((v) => (v - m) ** 2)) / (values.length - 1);
}

export function stdDev(values: number[]): number | null {
    const v = variance(values);

    return v === null ? null : Math.sqrt(v);
}

export function coefVariation(values: number[]): number | null {
    const m = mean(values);
    const s = stdDev(values);

    return m === null || s === null || m === 0 ? null : s / Math.abs(m);
}

export function zScore(value: number, sample: number[]): number | null {
    const m = mean(sample);
    const s = stdDev(sample);

    return m === null || s === null || s === 0 ? null : (value - m) / s;
}

export function movingAverage(values: number[], window: number): Array<number | null> {
    return values.map((_, i) =>
        i + 1 < window ? null : sum(values.slice(i + 1 - window, i + 1)) / window
    );
}

/** Régression linéaire simple : pente par pas de temps et R². */
export function linearTrend(values: number[]): { slope: number; intercept: number; r2: number } | null {
    const n = values.length;

    if (n < 3) return null;

    const mx = (n - 1) / 2;
    const my = sum(values) / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;

    values.forEach((y, x) => {
        sxy += (x - mx) * (y - my);
        sxx += (x - mx) ** 2;
        syy += (y - my) ** 2;
    });

    if (sxx === 0) return null;

    const slope = sxy / sxx;

    return { slope, intercept: my - slope * mx, r2: syy === 0 ? 0 : (sxy * sxy) / (sxx * syy) };
}

export function percentChange(current: number, previous: number): number | null {
    return previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
}

export type Confidence = "faible" | "moyenne" | "élevée";

export function confidenceFromSample(n: number, low: number, high: number): Confidence {
    return n >= high ? "élevée" : n >= low ? "moyenne" : "faible";
}

export function formatPercent(value: number, signed = true): string {
    const text = Math.abs(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 });

    return `${signed ? (value > 0 ? "+" : value < 0 ? "−" : "") : ""}${text} %`;
}
