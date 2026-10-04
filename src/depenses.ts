// src/depenses.ts
// Page Dépenses : enregistrer, consulter et supprimer les dépenses.

import {
    EXPENSE_CATEGORIES,
    type Expense,
    MODULE_LIMITS,
    addExpense,
    cleanAmount,
    deleteExpense,
    getExpenses,
    getExpensesTotals,
    newId
} from "./storage.js";
import {
    createDeleteControl,
    createToast,
    dayLabel,
    el,
    money,
    timeLabel
} from "./ui.js";

const form = document.querySelector<HTMLFormElement>("#expenseForm");
const labelInput = document.querySelector<HTMLInputElement>("#expenseLabel");
const amountInput = document.querySelector<HTMLInputElement>("#expenseAmount");
const categorySelect =
    document.querySelector<HTMLSelectElement>("#expenseCategory");
const listElement = document.querySelector<HTMLElement>("#expensesList");
const emptyElement = document.querySelector<HTMLElement>("#expensesEmpty");

if (!listElement) {
    throw new Error("EJDEN : #expensesList est introuvable.");
}

const list: HTMLElement = listElement;
const toast = createToast();

const CATEGORY_LABELS = new Map<string, string>(
    EXPENSE_CATEGORIES.map((category) => [category.id, category.label])
);

if (categorySelect) {
    categorySelect.replaceChildren(
        ...EXPENSE_CATEGORIES.map((category) => {
            const option = el("option", undefined, category.label);

            option.value = category.id;

            return option;
        })
    );
}

labelInput?.addEventListener("input", () => {
    labelInput.classList.remove("is-invalid");
});

amountInput?.addEventListener("input", () => {
    amountInput.classList.remove("is-invalid");
});

form?.addEventListener("submit", (event) => {
    event.preventDefault();

    const label = (labelInput?.value ?? "").replace(/\s+/g, " ").trim();
    const amount = cleanAmount(Number(amountInput?.value ?? ""));
    const category = categorySelect?.value ?? "autre";

    if (label === "") {
        labelInput?.classList.add("is-invalid");
        toast("Veuillez décrire la dépense.");
        labelInput?.focus();
        return;
    }

    if (label.length > MODULE_LIMITS.textMax) {
        labelInput?.classList.add("is-invalid");
        toast(`Description trop longue (${MODULE_LIMITS.textMax} caractères max).`);
        labelInput?.focus();
        return;
    }

    if (amount === null) {
        amountInput?.classList.add("is-invalid");
        toast("Montant invalide.");
        amountInput?.focus();
        return;
    }

    const expense = {
        id: newId(),
        label,
        amount,
        category,
        createdAt: new Date().toISOString()
    } as Expense;

    if (!addExpense(expense)) {
        toast("Impossible d'enregistrer la dépense.");
        return;
    }

    form?.reset();
    toast("Dépense enregistrée.");
    render();
});

function setText(selector: string, text: string): void {
    const node = document.querySelector<HTMLElement>(selector);

    if (node) {
        node.textContent = text;
    }
}

function createExpenseCard(expense: Expense): HTMLElement {
    const date = new Date(expense.createdAt);
    const card = el("details", "row-card");
    const summary = el("summary");

    const main = el("div", "row-main");

    main.append(
        el("strong", undefined, expense.label),
        el(
            "span",
            undefined,
            `${CATEGORY_LABELS.get(expense.category) ?? "Autre"} · ${timeLabel(date)}`
        )
    );

    const side = el("div", "row-side");

    side.append(el("strong", "is-out", `− ${money(expense.amount)}`));
    summary.append(main, side);

    const details = el("div", "row-details");
    const actions = el("div", "row-actions");

    actions.append(
        createDeleteControl({
            label: "Supprimer cette dépense",
            question:
                "Supprimer cette dépense ? Le solde de la caisse sera mis à jour.",
            onConfirm: () => {
                toast(
                    deleteExpense(expense.id)
                        ? "Dépense supprimée."
                        : "Impossible de supprimer cette dépense."
                );
                render();
            }
        })
    );

    details.append(actions);
    card.append(summary, details);

    return card;
}

function render(): void {
    const expenses = getExpenses().sort(
        (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const totals = getExpensesTotals();

    setText("#summaryToday", Math.round(totals.today).toLocaleString("fr-FR"));
    setText("#summaryMonth", Math.round(totals.month).toLocaleString("fr-FR"));

    if (emptyElement) {
        emptyElement.hidden = expenses.length > 0;
    }

    const nodes: HTMLElement[] = [];
    let currentDay = "";

    for (const expense of expenses) {
        const date = new Date(expense.createdAt);
        const key = date.toDateString();

        if (key !== currentDay) {
            currentDay = key;
            nodes.push(el("h2", "day-heading", dayLabel(date)));
        }

        nodes.push(createExpenseCard(expense));
    }

    list.replaceChildren(...nodes);
}

window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        render();
    }
});

render();

// Venu de « Nouvelle dépense » : le champ description est prêt.
if (new URLSearchParams(window.location.search).has("new")) {
    labelInput?.focus();
}
