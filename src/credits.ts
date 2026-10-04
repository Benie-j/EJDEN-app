// src/credits.ts
// Page Crédits : tout ce que les clients doivent, par débiteur,
// avec encaissement direct. Textes via textContent (jamais innerHTML).

import {
    CREDIT_OVERDUE_DAYS,
    type CreditGroup,
    getCreditsSummary
} from "./storage.js";
import { createPaymentForm } from "./credit-ui.js";
import { createToast, el, money, shortDateLabel } from "./ui.js";

const searchInput = document.querySelector<HTMLInputElement>("#creditSearch");
const filterButtons = document.querySelectorAll<HTMLButtonElement>(".filter-button");
const listElement = document.querySelector<HTMLElement>("#creditsList");
const emptyElement = document.querySelector<HTMLElement>("#creditsEmpty");
const emptyTitle = document.querySelector<HTMLElement>("#creditsEmptyTitle");
const emptyText = document.querySelector<HTMLElement>("#creditsEmptyText");

if (!listElement) {
    throw new Error("EJDEN : #creditsList est introuvable.");
}

const list: HTMLElement = listElement;
const toast = createToast();

type Filter = "all" | "overdue";

let activeFilter: Filter = "all";

// Fiche ouverte : elle reste ouverte après un encaissement.
let openKey: string | null = null;

function setText(selector: string, text: string): void {
    const node = document.querySelector<HTMLElement>(selector);

    if (node) {
        node.textContent = text;
    }
}

function format(value: number): string {
    return Math.round(value).toLocaleString("fr-FR");
}

function ageLabel(days: number): string {
    if (days <= 0) return "aujourd'hui";
    if (days === 1) return "il y a 1 jour";

    return `il y a ${days} jours`;
}

function detailRow(label: string, value: string, extraClass = ""): HTMLElement {
    const row = el("div", `detail-row ${extraClass}`.trim());

    row.append(el("span", undefined, label), el("span", undefined, value));

    return row;
}

function createGroupCard(group: CreditGroup): HTMLElement {
    const card = el("details", "row-card");
    const summary = el("summary");

    card.open = group.key === openKey;

    card.addEventListener("toggle", () => {
        if (card.open) {
            openKey = group.key;
        } else if (openKey === group.key) {
            openKey = null;
        }
    });

    const count = group.sales.length;
    const main = el("div", "row-main");

    main.append(
        el("strong", undefined, group.name),
        el(
            "span",
            undefined,
            `${count} vente${count > 1 ? "s" : ""} · la plus ancienne ${ageLabel(group.oldestDays)}`
        )
    );

    const side = el("div", "row-side");

    side.append(
        el("strong", undefined, money(group.amount)),
        group.overdue
            ? el("span", "badge is-overdue", "En retard")
            : el("span", "badge is-debt", "À encaisser")
    );

    summary.append(main, side);

    const details = el("div", "row-details");

    details.append(el("h3", "detail-title", "Ventes à encaisser"));

    for (const entry of group.sales) {
        details.append(
            detailRow(
                `${shortDateLabel(new Date(entry.sale.createdAt))} · total ${money(entry.sale.total)}`,
                `Reste ${money(entry.remaining)}`,
                "is-out"
            )
        );
    }

    // Encaissement : réparti sur les ventes, la plus ancienne d'abord.
    details.append(
        createPaymentForm({
            saleIds: group.sales.map((entry) => entry.sale.id),
            due: group.amount,
            onSaved: (message) => {
                toast(message);
                openKey = group.key;
                render();
            },
            onError: (message) => toast(message)
        })
    );

    if (group.clientId) {
        const link = el("a", "credit-link", "Voir la fiche client");

        link.href = "clients.html";
        details.append(link);
    }

    card.append(summary, details);

    return card;
}

function render(): void {
    const query = (searchInput?.value ?? "").trim().toLowerCase();
    const summary = getCreditsSummary();

    setText("#summaryTotal", format(summary.total));
    setText(
        "#summaryTotalNote",
        `FCFA · à encaisser`
    );
    setText("#summaryDebtors", String(summary.debtors));
    setText("#summaryOverdue", format(summary.overdueAmount));

    const groups = summary.groups.filter(
        (group) =>
            (activeFilter === "all" || group.overdue) &&
            (query === "" || group.name.toLowerCase().includes(query))
    );

    if (emptyElement) {
        emptyElement.hidden = groups.length > 0;
    }

    if (groups.length === 0) {
        const none = summary.groups.length === 0;

        if (emptyTitle) {
            emptyTitle.textContent = none ? "Aucun crédit en cours" : "Aucun résultat";
        }

        if (emptyText) {
            emptyText.textContent = none
                ? "Les ventes à crédit non soldées apparaîtront ici."
                : activeFilter === "overdue" && query === ""
                  ? `Aucun crédit de plus de ${CREDIT_OVERDUE_DAYS} jours.`
                  : "Aucun débiteur ne correspond à votre recherche.";
        }
    }

    list.replaceChildren(...groups.map(createGroupCard));
}

searchInput?.addEventListener("input", render);

function setFilter(value: string | undefined): void {
    if (value !== "all" && value !== "overdue") {
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

// Lien du dashboard ou du menu : credits.html?filter=overdue
setFilter(new URLSearchParams(window.location.search).get("filter") ?? undefined);

window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        render();
    }
});

render();
