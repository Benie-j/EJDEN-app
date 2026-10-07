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
    } catch {
        // stockage indisponible : thème sombre
    }

    const query = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = (): void => {
        const dark = choice === "dark" || (choice === "auto" && query.matches);
        const root = document.documentElement;

        root.dataset.theme = dark ? "dark" : "light";
        root.style.colorScheme = dark ? "dark" : "light";
    };

    apply();

    if (choice === "auto") {
        query.addEventListener("change", apply);
    }

    // Taille du texte et animations : appliquées dès le chargement de la page.
    try {
        const size = localStorage.getItem("ejden_text_size");
        const zoom = size === "large" ? "1.1" : size === "xlarge" ? "1.2" : "";

        if (zoom !== "") {
            document.documentElement.style.setProperty("zoom", zoom);
        }

        if (localStorage.getItem("ejden_reduce_motion") === "1") {
            const link = document.createElement("link");

            link.id = "reduce-motion-css";
            link.rel = "stylesheet";
            link.href = "css/reduce-motion.css";
            document.head.append(link);
        }
    } catch {
        // stockage indisponible : affichage par défaut
    }
})();
