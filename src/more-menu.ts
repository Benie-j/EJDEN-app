// src/more-menu.ts
// Menu « Plus » : feuille qui s'ouvre depuis le bouton à trois points
// et donne accès aux modules, groupés par catégorie.
// Construit en DOM (textContent) : aucune injection HTML possible.

import { MODULE_CATEGORIES, type AppModule } from "./modules.js";

export interface MoreMenuOptions {
    trigger: HTMLElement | null;
    // Appelé quand on touche un module pas encore disponible.
    onSoon: (label: string) => void;
}

function node<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string
): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;

    return element;
}

function createTile(
    module: AppModule,
    onSoon: (label: string) => void,
    close: () => void
): HTMLElement {
    const content = (): Node[] => {
        const initial = node(
            "span",
            "more-tile-icon",
            module.label.charAt(0).toUpperCase()
        );

        initial.setAttribute("aria-hidden", "true");

        const text = node("span", "more-tile-text");

        text.append(
            node("strong", undefined, module.label),
            node("small", undefined, module.description)
        );

        return [initial, text];
    };

    if (module.href !== null) {
        const link = node("a", "more-tile");

        link.href = module.href;
        link.append(...content());

        return link;
    }

    const button = node("button", "more-tile is-soon");

    button.type = "button";
    button.append(...content(), node("span", "more-tile-badge", "Bientôt"));

    button.addEventListener("click", () => {
        close();
        onSoon(module.label);
    });

    return button;
}

export function setupMoreMenu(options: MoreMenuOptions): void {
    const { trigger, onSoon } = options;

    if (!trigger) {
        return;
    }

    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");

    // --- Construction de la feuille (une seule fois) ---
    const overlay = node("div", "more-overlay");
    const panel = node("div", "more-panel");
    const header = node("div", "more-header");
    const title = node("h2", undefined, "Tous les modules");
    const closeButton = node("button", "more-close");

    overlay.id = "moreOverlay";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "moreTitle");
    title.id = "moreTitle";

    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Fermer");
    closeButton.textContent = "✕";

    header.append(title, closeButton);

    const body = node("div", "more-body");

    for (const category of MODULE_CATEGORIES) {
        const section = node("section", "more-category");
        const grid = node("div", "more-grid");

        section.append(node("h3", undefined, category.label));

        for (const module of category.modules) {
            grid.append(createTile(module, onSoon, close));
        }

        section.append(grid);
        body.append(section);
    }

    panel.append(header, body);
    overlay.append(panel);
    document.body.append(overlay);

    // --- Ouverture / fermeture ---
    let previousOverflow = "";

    function open(): void {
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        overlay.classList.add("is-open");
        trigger?.setAttribute("aria-expanded", "true");
        closeButton.focus();
    }

    function close(): void {
        if (!overlay.classList.contains("is-open")) {
            return;
        }

        overlay.classList.remove("is-open");
        document.body.style.overflow = previousOverflow;
        trigger?.setAttribute("aria-expanded", "false");
        trigger?.focus();
    }

    trigger.addEventListener("click", open);
    closeButton.addEventListener("click", close);

    // Un appui sur le fond (hors de la feuille) ferme.
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            close();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            close();
        }
    });

    // Retour arrière du navigateur (cache) : la feuille repart fermée.
    window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
            overlay.classList.remove("is-open");
            document.body.style.overflow = "";
            trigger.setAttribute("aria-expanded", "false");
        }
    });
}
