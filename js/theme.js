"use strict";
// src/theme.ts
// Script classique chargé en tête de chaque page (avant le premier affichage)
// pour appliquer le thème sans flash. Sombre par défaut, quel que soit
// l'appareil ; « auto » suit l'appareil. Réglage : ejden_theme.
(() => {
    let choice = "dark";
    try {
        const stored = localStorage.getItem("ejden_theme");
        if (stored === "light" || stored === "auto" || stored === "dark") {
            choice = stored;
        }
    }
    catch {
        // stockage indisponible : thème sombre
    }
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
        const dark = choice === "dark" || (choice === "auto" && query.matches);
        const root = document.documentElement;
        root.dataset.theme = dark ? "dark" : "light";
        root.style.colorScheme = dark ? "dark" : "light";
    };
    apply();
    if (choice === "auto") {
        query.addEventListener("change", apply);
    }
})();
//# sourceMappingURL=theme.js.map