// src/preferences.ts
// Préférences de l'application : thème et langue.
export const APP_VERSION = "1.0.0";
const THEME_KEY = "ejden_theme";
const LANG_KEY = "ejden_lang";
/** Sombre par défaut, quel que soit le thème de l'appareil. */
export function getThemeChoice() {
    try {
        const value = localStorage.getItem(THEME_KEY);
        if (value === "light" || value === "auto" || value === "dark") {
            return value;
        }
    }
    catch (error) {
        console.error("Impossible de lire le thème.", error);
    }
    return "dark";
}
export function applyTheme(choice) {
    const dark = choice === "dark" ||
        (choice === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
}
export function saveThemeChoice(choice) {
    try {
        localStorage.setItem(THEME_KEY, choice);
        applyTheme(choice);
        return true;
    }
    catch (error) {
        console.error("Impossible d'enregistrer le thème.", error);
        return false;
    }
}
export function getLanguage() {
    return "fr";
}
export function saveLanguage(language) {
    try {
        localStorage.setItem(LANG_KEY, language);
        document.documentElement.lang = language;
        return true;
    }
    catch (error) {
        console.error("Impossible d'enregistrer la langue.", error);
        return false;
    }
}
const TEXT_SIZE_KEY = "ejden_text_size";
const MOTION_KEY = "ejden_reduce_motion";
const THRESHOLD_KEY = "ejden_default_threshold";
const CREDIT_KEY = "ejden_allow_credit";
export const TEXT_SIZE_ZOOM = {
    normal: 1,
    large: 1.1,
    xlarge: 1.2
};
export function getTextSize() {
    try {
        const value = localStorage.getItem(TEXT_SIZE_KEY);
        if (value === "large" || value === "xlarge") {
            return value;
        }
    }
    catch (error) {
        console.error("Impossible de lire la taille du texte.", error);
    }
    return "normal";
}
/** Taille du texte : agrandit toute l'interface (zoom de la page). */
export function saveTextSize(size) {
    try {
        localStorage.setItem(TEXT_SIZE_KEY, size);
        document.documentElement.style.setProperty("zoom", String(TEXT_SIZE_ZOOM[size]));
        return true;
    }
    catch (error) {
        console.error("Impossible d'enregistrer la taille du texte.", error);
        return false;
    }
}
export function getReduceMotion() {
    try {
        return localStorage.getItem(MOTION_KEY) === "1";
    }
    catch {
        return false;
    }
}
/** Réduction des animations : charge une feuille de style qui les neutralise. */
export function saveReduceMotion(enabled) {
    try {
        localStorage.setItem(MOTION_KEY, enabled ? "1" : "0");
        const existing = document.getElementById("reduce-motion-css");
        if (enabled && !existing) {
            const link = document.createElement("link");
            link.id = "reduce-motion-css";
            link.rel = "stylesheet";
            link.href = "css/reduce-motion.css";
            document.head.append(link);
        }
        else if (!enabled && existing) {
            existing.remove();
        }
        return true;
    }
    catch (error) {
        console.error("Impossible d'enregistrer ce réglage.", error);
        return false;
    }
}
/** Seuil d'alerte proposé pour un nouveau produit (0 = aucun). */
export function getDefaultThreshold() {
    try {
        const value = Number(localStorage.getItem(THRESHOLD_KEY));
        return Number.isInteger(value) && value > 0 && value <= 1_000_000 ? value : 0;
    }
    catch {
        return 0;
    }
}
export function saveDefaultThreshold(value) {
    try {
        if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
            return false;
        }
        localStorage.setItem(THRESHOLD_KEY, String(value));
        return true;
    }
    catch (error) {
        console.error("Impossible d'enregistrer le seuil.", error);
        return false;
    }
}
/** Ventes à crédit autorisées (oui par défaut). */
export function getAllowCredit() {
    try {
        return localStorage.getItem(CREDIT_KEY) !== "0";
    }
    catch {
        return true;
    }
}
export function saveAllowCredit(enabled) {
    try {
        localStorage.setItem(CREDIT_KEY, enabled ? "1" : "0");
        return true;
    }
    catch (error) {
        console.error("Impossible d'enregistrer ce réglage.", error);
        return false;
    }
}
//# sourceMappingURL=preferences.js.map