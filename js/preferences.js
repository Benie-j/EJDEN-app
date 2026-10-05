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
//# sourceMappingURL=preferences.js.map