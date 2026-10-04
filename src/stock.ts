// src/stock.ts
// Page Stock : niveaux, alertes, entrées, sorties, inventaire, historique.
// Tout texte venant des données passe par textContent (jamais innerHTML).

import {
    type Product,
    type StockHistoryEntry,
    type StockMovementType,
    STOCK_REASONS,
    LIMITS,
    getProducts,
    getStockHistory,
    getStockSummary,
    getStockValue,
    recordStockMovement,
    rememberEditingProduct
} from "./storage.js";
import {
    createToast,
    el,
    money,
    shortDateLabel,
    timeLabel
} from "./ui.js";

const listElement = document.querySelector<HTMLElement>("#stockList");
const emptyElement = document.querySelector<HTMLElement>("#stockEmpty");
const emptyTitle = document.querySelector<HTMLElement>("#stockEmptyTitle");
const emptyText = document.querySelector<HTMLElement>("#stockEmptyText");
const searchInput = document.querySelector<HTMLInputElement>("#stockSearch");
const filterButtons =
    document.querySelectorAll<HTMLButtonElement>(".filter-button");
const movementsSection =
    document.querySelector<HTMLElement>("#movementsSection");
const movementsList = document.querySelector<HTMLElement>("#movementsList");

if (!listElement) {
    throw new Error("EJDEN : #stockList est introuvable.");
}

const list: HTMLElement = listElement;
const toast = createToast();

type Filter = "all" | "low" | "out";
type Status = "ok" | "low" | "out";

let activeFilter: Filter = "all";

// Fiche ouverte : elle reste ouverte après chaque enregistrement.
let openProductId: string | null = null;


/* =========================================================
   Outils
   ========================================================= */

function statusOf(product: Product): Status {
    if (product.stock <= 0) {
        return "out";
    }

    return product.stockThreshold > 0 && product.stock <= product.stockThreshold
        ? "low"
        : "ok";
}

const STATUS_ORDER: Record<Status, number> = { out: 0, low: 1, ok: 2 };

function signed(value: number): string {
    return `${value > 0 ? "+" : "−"} ${Math.abs(value).toLocaleString("fr-FR")}`;
}

function setText(selector: string, text: string): void {
    const node = document.querySelector<HTMLElement>(selector);

    if (node) {
        node.textContent = text;
    }
}

function detailRow(label: string, value: string): HTMLElement {
    const row = el("div", "detail-row");

    row.append(el("span", undefined, label), el("span", undefined, value));

    return row;
}

function dateTimeLabel(iso: string): string {
    const date = new Date(iso);

    return Number.isNaN(date.getTime())
        ? ""
        : `${shortDateLabel(date)} ${timeLabel(date)}`;
}

function movementRow(entry: StockHistoryEntry, withName: boolean): HTMLElement {
    const row = el("div", "movement-row");
    const main = el("div", "movement-main");
    const side = el("div", "movement-side");

    main.append(
        el("strong", undefined, withName ? entry.productName : entry.label),
        el(
            "span",
            undefined,
            withName
                ? `${entry.label} · ${dateTimeLabel(entry.createdAt)}`
                : dateTimeLabel(entry.createdAt)
        )
    );

    side.append(
        el("strong", entry.delta > 0 ? "is-in" : "is-out", signed(entry.delta))
    );

    if (entry.after !== undefined) {
        side.append(el("span", undefined, `stock : ${entry.after}`));
    }

    row.append(main, side);

    return row;
}


/* =========================================================
   Formulaire d'un mouvement
   ========================================================= */

const TAB_LABELS: Record<StockMovementType, string> = {
    in: "Entrée",
    out: "Sortie",
    adjust: "Inventaire"
};

const QUANTITY_LABELS: Record<StockMovementType, string> = {
    in: "Quantité reçue",
    out: "Quantité sortie",
    adjust: "Quantité comptée en rayon"
};

const ERROR_MESSAGES: Record<string, string> = {
    not_found: "Produit introuvable.",
    invalid_quantity: "Quantité invalide : un nombre entier est attendu.",
    too_much: "Quantité supérieure au stock disponible.",
    too_high: `Quantité trop grande (${LIMITS.stockMax.toLocaleString("fr-FR")} max).`,
    unchanged: "Le stock compté est identique au stock actuel.",
    invalid_reason: "Indiquez un motif.",
    storage: "Impossible d'enregistrer le mouvement."
};

function createMovementForm(
    product: Product,
    type: StockMovementType
): HTMLFormElement {
    const form = el("form", "stock-form");

    form.noValidate = true;
    form.autocomplete = "off";

    // Quantité
    const quantityField = el("div", "field");
    const quantityId = `qty-${product.id}`;
    const quantityLabel = el("label", undefined, QUANTITY_LABELS[type]);
    const quantityInput = el("input");

    quantityLabel.htmlFor = quantityId;
    quantityInput.id = quantityId;
    quantityInput.type = "number";
    quantityInput.inputMode = "numeric";
    quantityInput.min = type === "adjust" ? "0" : "1";
    quantityInput.step = "1";
    quantityInput.placeholder =
        type === "out"
            ? `Max ${product.stock}`
            : type === "adjust"
              ? `Actuellement ${product.stock}`
              : "Ex. : 24";

    quantityField.append(quantityLabel, quantityInput);

    // Motif
    const reasonField = el("div", "field");
    const reasonId = `reason-${product.id}`;
    const reasonLabel = el("label", undefined, "Motif");
    const reasonSelect = el("select");

    reasonLabel.htmlFor = reasonId;
    reasonSelect.id = reasonId;

    for (const reason of STOCK_REASONS[type]) {
        const option = el("option", undefined, reason);

        option.value = reason;
        reasonSelect.append(option);
    }

    reasonField.append(reasonLabel, reasonSelect);

    // Précision (facultative)
    const noteField = el("div", "field");
    const noteId = `note-${product.id}`;
    const noteLabel = el("label", undefined, "Précision (facultatif)");
    const noteInput = el("input");

    noteLabel.htmlFor = noteId;
    noteInput.id = noteId;
    noteInput.type = "text";
    noteInput.maxLength = 40;
    noteInput.placeholder = "Ex. : livraison du lundi";

    noteField.append(noteLabel, noteInput);

    form.append(quantityField, reasonField, noteField);

    if (type === "adjust") {
        form.append(
            el(
                "p",
                "stock-form-hint",
                "Entrez la quantité réellement comptée : le stock sera remplacé par ce chiffre."
            )
        );
    }

    const submit = el("button", "primary-button", "Enregistrer");

    submit.type = "submit";
    form.append(submit);

    quantityInput.addEventListener("input", () => {
        quantityInput.classList.remove("is-invalid");
    });

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const raw = quantityInput.value.trim();
        const quantity = raw === "" ? Number.NaN : Number(raw);

        const note = noteInput.value.replace(/\s+/g, " ").trim();
        const reason = note ? `${reasonSelect.value} — ${note}` : reasonSelect.value;

        submit.disabled = true;

        const result = recordStockMovement(product.id, type, quantity, reason);

        if (!result.ok) {
            submit.disabled = false;
            quantityInput.classList.add("is-invalid");
            toast(ERROR_MESSAGES[result.reason] ?? ERROR_MESSAGES.storage);
            quantityInput.focus();
            return;
        }

        const movement = result.movement;

        toast(
            type === "adjust"
                ? `Inventaire enregistré : ${movement.after} en stock.`
                : `${TAB_LABELS[type]} enregistrée : ${movement.after} en stock.`
        );

        openProductId = product.id;
        render();
    });

    return form;
}


/* =========================================================
   Fiche produit
   ========================================================= */

function createProductCard(product: Product): HTMLElement {
    const status = statusOf(product);
    const card = el("details", "row-card");
    const summary = el("summary");

    card.open = product.id === openProductId;

    card.addEventListener("toggle", () => {
        if (card.open) {
            openProductId = product.id;
        } else if (openProductId === product.id) {
            openProductId = null;
        }
    });

    // --- Résumé ---
    const main = el("div", "row-main");

    main.append(
        el("strong", undefined, product.name),
        el(
            "span",
            undefined,
            product.stockThreshold > 0
                ? `Seuil d'alerte : ${product.stockThreshold}`
                : "Pas de seuil d'alerte"
        )
    );

    const side = el("div", "row-side");
    const level = el("strong", "stock-level", String(product.stock));

    level.append(el("small", undefined, " en stock"));

    side.append(
        level,
        el(
            "span",
            status === "out" ? "badge is-out" : status === "low" ? "badge is-debt" : "badge",
            status === "out" ? "Rupture" : status === "low" ? "Stock faible" : "OK"
        )
    );

    summary.append(main, side);

    // --- Détail ---
    const details = el("div", "row-details");

    details.append(
        detailRow("Prix d'achat", money(product.purchasePrice)),
        detailRow("Prix de vente", money(product.salePrice)),
        detailRow(
            "Valeur du stock",
            money(product.stock * product.purchasePrice)
        )
    );

    // --- Actions ---
    const tabs = el("div", "stock-tabs");
    const formHolder = el("div");
    let activeType: StockMovementType | null = null;

    const tabButtons = new Map<StockMovementType, HTMLButtonElement>();

    for (const type of ["in", "out", "adjust"] as const) {
        const button = el("button", undefined, TAB_LABELS[type]);

        button.type = "button";
        tabButtons.set(type, button);

        button.addEventListener("click", () => {
            // Un second appui referme le formulaire.
            activeType = activeType === type ? null : type;

            tabButtons.forEach((item, key) => {
                item.classList.toggle("is-active", key === activeType);
            });

            if (activeType === null) {
                formHolder.replaceChildren();
                return;
            }

            const form = createMovementForm(product, activeType);

            formHolder.replaceChildren(form);
            form.querySelector("input")?.focus();
        });

        tabs.append(button);
    }

    details.append(tabs, formHolder);

    // --- Historique du produit ---
    const history = getStockHistory(product.id).slice(0, 5);

    if (history.length > 0) {
        details.append(el("h3", "detail-title", "Derniers mouvements"));

        for (const entry of history) {
            details.append(movementRow(entry, false));
        }
    }

    const edit = el("a", "edit-link", "Modifier le produit");

    edit.href = `modifier-produit.html?id=${encodeURIComponent(product.id)}`;
    edit.addEventListener("click", () => {
        rememberEditingProduct(product.id);
    });

    details.append(edit);
    card.append(summary, details);

    return card;
}


/* =========================================================
   Affichage
   ========================================================= */

function matches(product: Product, query: string): boolean {
    if (activeFilter !== "all" && statusOf(product) !== activeFilter) {
        return false;
    }

    if (query === "") {
        return true;
    }

    return (
        product.name.toLowerCase().includes(query) ||
        (product.barcode ?? "").includes(query.replace(/\s+/g, "")) ||
        (product.category ?? "").toLowerCase().includes(query)
    );
}

function render(): void {
    const query = (searchInput?.value ?? "").trim().toLowerCase();
    const all = getProducts();

    // Résumé (sur tous les produits, pas seulement ceux affichés)
    const value = getStockValue();
    const summary = getStockSummary(0);

    setText("#summaryValue", Math.round(value.cost).toLocaleString("fr-FR"));
    setText(
        "#summaryValueNote",
        `FCFA · ${summary.productsCount} produit${summary.productsCount > 1 ? "s" : ""} · valeur de vente ${Math.round(value.retail).toLocaleString("fr-FR")}`
    );
    setText("#summaryLow", String(summary.lowCount));
    setText("#summaryOut", String(summary.outCount));

    // Liste : ruptures d'abord, puis stock faible, puis le reste
    const products = all
        .filter((product) => matches(product, query))
        .sort(
            (a, b) =>
                STATUS_ORDER[statusOf(a)] - STATUS_ORDER[statusOf(b)] ||
                a.name.localeCompare(b.name, "fr")
        );

    if (emptyElement) {
        emptyElement.hidden = products.length > 0;
    }

    if (products.length === 0) {
        const none = all.length === 0;

        if (emptyTitle) {
            emptyTitle.textContent = none ? "Aucun produit" : "Aucun résultat";
        }

        if (emptyText) {
            emptyText.textContent = none
                ? "Ajoutez des produits pour suivre votre stock."
                : "Aucun produit ne correspond à votre recherche ou à ce filtre.";
        }
    }

    // Le lien « Ajouter un produit » n'a de sens que sans produit.
    const emptyLink = emptyElement?.querySelector<HTMLElement>(".empty-link");

    if (emptyLink) {
        emptyLink.hidden = all.length > 0;
    }

    list.replaceChildren(...products.map(createProductCard));

    // Derniers mouvements (tous produits)
    const recent = getStockHistory().slice(0, 15);

    if (movementsSection) {
        movementsSection.hidden = recent.length === 0;
    }

    movementsList?.replaceChildren(...recent.map((entry) => movementRow(entry, true)));
}


/* =========================================================
   Événements
   ========================================================= */

searchInput?.addEventListener("input", render);

function setFilter(value: string | undefined): void {
    if (value !== "all" && value !== "low" && value !== "out") {
        return;
    }

    activeFilter = value;

    filterButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.filter === value);
    });
}

filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
        setFilter(button.dataset.filter);
        render();
    });
});

// Liens du dashboard : stock.html?filter=low|out
setFilter(new URLSearchParams(window.location.search).get("filter") ?? undefined);

window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        render();
    }
});

render();
