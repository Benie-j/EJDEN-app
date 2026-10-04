// src/credit-ui.ts
// Éléments d'écran partagés pour régulariser un crédit :
// formulaire « Encaisser un paiement » et liste des paiements reçus.
// Tous les textes passent par textContent (jamais innerHTML).
import { CREDIT_PAYMENT_METHODS, cancelCreditPayment, recordCreditPayment } from "./storage.js";
import { el, money, shortDateLabel, timeLabel } from "./ui.js";
export const CREDIT_METHOD_LABELS = {
    cash: "Espèces",
    mobile_money: "Mobile Money",
    card: "Carte",
    other: "Autre"
};
function isMethod(value) {
    return CREDIT_PAYMENT_METHODS.includes(value);
}
function formatNumber(value) {
    return Math.round(value).toLocaleString("fr-FR");
}
export function createPaymentForm(options) {
    const wrapper = el("div", "pay-block");
    const openButton = el("button", "action-button is-primary", "Encaisser un paiement");
    openButton.type = "button";
    const form = el("form", "pay-form");
    form.hidden = true;
    form.noValidate = true;
    form.autocomplete = "off";
    // --- Montant ---
    const amountLabel = el("label", undefined, "Montant reçu (FCFA)");
    const amountInput = el("input");
    amountInput.type = "number";
    amountInput.inputMode = "numeric";
    amountInput.min = "1";
    amountInput.max = String(options.due);
    amountInput.step = "1";
    amountInput.placeholder = "0";
    amountInput.id = `pay-amount-${options.saleIds[0] ?? "x"}`;
    amountLabel.htmlFor = amountInput.id;
    const payAll = el("button", "pay-all", `Tout solder (${formatNumber(options.due)})`);
    payAll.type = "button";
    const amountRow = el("div", "pay-amount-row");
    amountRow.append(amountInput, payAll);
    // --- Mode de paiement ---
    const methodLabel = el("label", undefined, "Mode de paiement");
    const methodSelect = el("select");
    methodSelect.id = `pay-method-${options.saleIds[0] ?? "x"}`;
    methodLabel.htmlFor = methodSelect.id;
    for (const method of CREDIT_PAYMENT_METHODS) {
        const option = el("option", undefined, CREDIT_METHOD_LABELS[method]);
        option.value = method;
        methodSelect.append(option);
    }
    // --- Reste après paiement ---
    const preview = el("p", "pay-preview");
    function updatePreview() {
        const amount = Number(amountInput.value);
        if (amountInput.value.trim() === "" || !Number.isFinite(amount) || amount <= 0) {
            preview.textContent = `Reste dû : ${money(options.due)}`;
            preview.classList.remove("is-over");
            return;
        }
        if (amount > options.due) {
            preview.textContent = `Ce montant dépasse ce qui est dû (${money(options.due)}).`;
            preview.classList.add("is-over");
            return;
        }
        preview.classList.remove("is-over");
        preview.textContent =
            amount === options.due
                ? "Le crédit sera entièrement soldé."
                : `Reste après paiement : ${money(options.due - amount)}`;
    }
    amountInput.addEventListener("input", updatePreview);
    payAll.addEventListener("click", () => {
        amountInput.value = String(options.due);
        updatePreview();
        amountInput.focus();
    });
    // --- Boutons ---
    const buttons = el("div", "pay-buttons");
    const submit = el("button", "action-button is-primary", "Enregistrer le paiement");
    const cancel = el("button", "action-button", "Annuler");
    submit.type = "submit";
    cancel.type = "button";
    buttons.append(submit, cancel);
    form.append(amountLabel, amountRow, methodLabel, methodSelect, preview, buttons);
    wrapper.append(openButton, form);
    updatePreview();
    openButton.addEventListener("click", () => {
        openButton.hidden = true;
        form.hidden = false;
        amountInput.focus();
    });
    cancel.addEventListener("click", () => {
        form.hidden = true;
        openButton.hidden = false;
        form.reset();
        updatePreview();
    });
    let saving = false;
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (saving) {
            return;
        }
        const amount = Number(amountInput.value);
        if (amountInput.value.trim() === "" ||
            !Number.isInteger(amount) ||
            amount <= 0) {
            options.onError("Saisissez un montant entier, en FCFA.");
            amountInput.focus();
            return;
        }
        if (!isMethod(methodSelect.value)) {
            options.onError("Choisissez un mode de paiement.");
            return;
        }
        saving = true;
        submit.disabled = true;
        const result = recordCreditPayment(options.saleIds, amount, methodSelect.value);
        if (!result.ok) {
            saving = false;
            submit.disabled = false;
            switch (result.reason) {
                case "too_much":
                    options.onError(`Ce montant dépasse ce qui est dû (${money(result.due ?? options.due)}).`);
                    break;
                case "no_debt":
                    options.onError("Ce crédit est déjà soldé.");
                    break;
                case "storage":
                    options.onError("Enregistrement impossible : la mémoire est pleine.");
                    break;
                default:
                    options.onError("Paiement invalide.");
            }
            return;
        }
        options.onSaved(amount === options.due
            ? `Crédit soldé : ${money(amount)} reçus.`
            : `Paiement de ${money(amount)} enregistré. Reste ${money(options.due - amount)}.`);
    });
    return wrapper;
}
export function createPaymentsList(payments, options = {}) {
    const list = el("div", "pay-list");
    for (const payment of payments) {
        const date = new Date(payment.createdAt);
        const cancelled = payment.cancelledAt !== undefined;
        const row = el("div", cancelled ? "pay-row is-cancelled" : "pay-row");
        const info = el("div", "pay-info");
        info.append(el("strong", undefined, money(payment.amount)), el("small", undefined, `${shortDateLabel(date)} · ${timeLabel(date)} · ${CREDIT_METHOD_LABELS[payment.method]}${cancelled ? " · annulé" : ""}`));
        row.append(info);
        if (!cancelled && options.onChanged) {
            row.append(createCancelControl(payment, options));
        }
        list.append(row);
    }
    return list;
}
function createCancelControl(payment, options) {
    const control = el("div", "pay-cancel");
    const start = el("button", "pay-cancel-button", "Annuler");
    const box = el("div", "pay-confirm");
    const question = el("p", undefined, `Annuler ce paiement de ${money(payment.amount)} ? Le reste à payer augmentera.`);
    const yes = el("button", "action-button is-danger is-solid", "Oui, annuler");
    const no = el("button", "action-button", "Non");
    start.type = "button";
    yes.type = "button";
    no.type = "button";
    box.hidden = true;
    start.addEventListener("click", () => {
        start.hidden = true;
        box.hidden = false;
    });
    no.addEventListener("click", () => {
        box.hidden = true;
        start.hidden = false;
    });
    yes.addEventListener("click", () => {
        yes.disabled = true;
        const result = cancelCreditPayment(payment.id);
        if (!result.ok) {
            options.onError?.("Impossible d'annuler ce paiement.");
            options.onChanged?.("");
            return;
        }
        options.onChanged?.("Paiement annulé.");
    });
    box.append(question, yes, no);
    control.append(start, box);
    return control;
}
//# sourceMappingURL=credit-ui.js.map