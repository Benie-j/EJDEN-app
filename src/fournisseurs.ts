// src/fournisseurs.ts
// Page Fournisseurs : fiches, dettes, paiements au fournisseur.
// Les textes venant des données passent par textContent (jamais innerHTML).

import {
    type CreditPaymentMethod,
    type Supplier,
    CREDIT_PAYMENT_METHODS,
    MODULE_LIMITS,
    addSupplier,
    cancelSupplierPayment,
    deleteSupplier,
    getCashSummary,
    getPurchases,
    getSupplierDebt,
    getSupplierPaymentBatches,
    getSuppliers,
    getSuppliersDebtTotal,
    isValidPhone,
    newId,
    recordSupplierPayment,
    supplierNameExists,
    updateSupplier
} from "./storage.js";
import { CREDIT_METHOD_LABELS } from "./credit-ui.js";
import {
    createDeleteControl,
    createToast,
    el,
    money,
    shortDateLabel,
    timeLabel
} from "./ui.js";

const form = document.querySelector<HTMLFormElement>("#supplierForm");
const nameInput = document.querySelector<HTMLInputElement>("#supplierName");
const phoneInput = document.querySelector<HTMLInputElement>("#supplierPhone");
const submitButton = document.querySelector<HTMLButtonElement>("#supplierSubmit");
const cancelEditButton =
    document.querySelector<HTMLButtonElement>("#supplierCancelEdit");
const formTitle = document.querySelector<HTMLElement>("#supplierFormTitle");
const formSection = document.querySelector<HTMLElement>("#supplierFormSection");
const searchInput = document.querySelector<HTMLInputElement>("#supplierSearch");
const listElement = document.querySelector<HTMLElement>("#suppliersList");
const emptyElement = document.querySelector<HTMLElement>("#suppliersEmpty");
const emptyTitle = document.querySelector<HTMLElement>("#suppliersEmptyTitle");
const emptyText = document.querySelector<HTMLElement>("#suppliersEmptyText");

if (!listElement) {
    throw new Error("EJDEN : #suppliersList est introuvable.");
}

const list: HTMLElement = listElement;
const toast = createToast();

let editingId: string | null = null;
let openId: string | null = null;


/* =========================================================
   Formulaire (ajout et modification)
   ========================================================= */

function resetForm(): void {
    editingId = null;
    form?.reset();
    nameInput?.classList.remove("is-invalid");
    phoneInput?.classList.remove("is-invalid");

    if (formTitle) formTitle.textContent = "Nouveau fournisseur";
    if (submitButton) submitButton.textContent = "Ajouter le fournisseur";
    if (cancelEditButton) cancelEditButton.hidden = true;
}

function startEdit(supplier: Supplier): void {
    editingId = supplier.id;

    if (nameInput) nameInput.value = supplier.name;
    if (phoneInput) phoneInput.value = supplier.phone;
    if (formTitle) formTitle.textContent = "Modifier le fournisseur";
    if (submitButton) submitButton.textContent = "Enregistrer";
    if (cancelEditButton) cancelEditButton.hidden = false;

    formSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    nameInput?.focus();
}

cancelEditButton?.addEventListener("click", resetForm);

nameInput?.addEventListener("input", () => nameInput.classList.remove("is-invalid"));
phoneInput?.addEventListener("input", () => phoneInput.classList.remove("is-invalid"));

form?.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = (nameInput?.value ?? "").replace(/\s+/g, " ").trim();
    const phone = (phoneInput?.value ?? "").trim();

    if (name === "") {
        nameInput?.classList.add("is-invalid");
        toast("Veuillez saisir le nom du fournisseur.");
        nameInput?.focus();
        return;
    }

    if (name.length > MODULE_LIMITS.textMax) {
        nameInput?.classList.add("is-invalid");
        toast(`Nom trop long (${MODULE_LIMITS.textMax} caractères max).`);
        nameInput?.focus();
        return;
    }

    if (!isValidPhone(phone)) {
        phoneInput?.classList.add("is-invalid");
        toast("Téléphone invalide : chiffres, +, espaces et tirets seulement.");
        phoneInput?.focus();
        return;
    }

    if (supplierNameExists(name, editingId ?? undefined)) {
        nameInput?.classList.add("is-invalid");
        toast("Un fournisseur porte déjà ce nom.");
        nameInput?.focus();
        return;
    }

    if (editingId === null) {
        const ok = addSupplier({
            id: newId(),
            name,
            phone,
            createdAt: new Date().toISOString()
        });

        if (!ok) {
            toast("Impossible d'enregistrer le fournisseur.");
            return;
        }

        toast("Fournisseur ajouté.");
    } else {
        const existing = getSuppliers().find((item) => item.id === editingId);

        if (!existing) {
            toast("Fournisseur introuvable.");
            resetForm();
            render();
            return;
        }

        if (!updateSupplier({ ...existing, name, phone })) {
            toast("Impossible d'enregistrer les modifications.");
            return;
        }

        toast("Fournisseur modifié. Les anciens achats gardent l'ancien nom.");
    }

    resetForm();
    render();
});


/* =========================================================
   Paiement au fournisseur
   ========================================================= */

function isMethod(value: string): value is CreditPaymentMethod {
    return (CREDIT_PAYMENT_METHODS as string[]).includes(value);
}

function createPayBox(supplier: Supplier, due: number): HTMLElement {
    const box = el("div", "pay-box");
    const amountField = el("div", "field");
    const methodField = el("div", "field");

    const amountId = `pay-amount-${supplier.id}`;
    const methodId = `pay-method-${supplier.id}`;

    const amountLabel = el("label", undefined, "Montant versé (FCFA)");
    const amountInput = el("input");
    const methodLabel = el("label", undefined, "Mode de paiement");
    const methodSelect = el("select");

    amountLabel.htmlFor = amountId;
    amountInput.id = amountId;
    amountInput.type = "number";
    amountInput.inputMode = "numeric";
    amountInput.min = "1";
    amountInput.step = "1";
    amountInput.placeholder = `Max ${Math.round(due).toLocaleString("fr-FR")}`;

    methodLabel.htmlFor = methodId;
    methodSelect.id = methodId;

    for (const method of CREDIT_PAYMENT_METHODS) {
        const option = el("option", undefined, CREDIT_METHOD_LABELS[method]);

        option.value = method;
        methodSelect.append(option);
    }

    amountField.append(amountLabel, amountInput);
    methodField.append(methodLabel, methodSelect);

    const payAll = el("button", "pay-all", `Tout payer (${money(due)})`);

    payAll.type = "button";
    payAll.addEventListener("click", () => {
        amountInput.value = String(due);
        amountInput.classList.remove("is-invalid");
    });

    const submit = el("button", "primary-button", "Payer le fournisseur");

    submit.type = "button";

    amountInput.addEventListener("input", () => amountInput.classList.remove("is-invalid"));

    submit.addEventListener("click", () => {
        const amount = amountInput.value.trim() === "" ? Number.NaN : Number(amountInput.value);
        const method = methodSelect.value;

        if (!isMethod(method)) {
            toast("Mode de paiement invalide.");
            return;
        }

        // Avertit si la caisse devient négative (le paiement reste possible).
        const goesNegative = getCashSummary().balance - amount < 0;

        submit.disabled = true;

        const result = recordSupplierPayment(supplier.id, amount, method);

        if (!result.ok) {
            submit.disabled = false;
            amountInput.classList.add("is-invalid");
            amountInput.focus();

            toast(
                result.reason === "too_much"
                    ? `Montant supérieur à la dette (${money(result.debt ?? due)}).`
                    : result.reason === "no_debt"
                      ? "Aucune dette envers ce fournisseur."
                      : result.reason === "invalid_amount"
                        ? "Montant invalide."
                        : "Impossible d'enregistrer le paiement."
            );
            return;
        }

        toast(
            goesNegative
                ? "Paiement enregistré. Attention : le solde de la caisse est négatif."
                : `Paiement de ${money(amount)} enregistré.`
        );

        openId = supplier.id;
        render();
    });

    box.append(amountField, payAll, methodField, submit);

    return box;
}


/* =========================================================
   Liste
   ========================================================= */

function detailRow(label: string, value: Node | string): HTMLElement {
    const row = el("div", "detail-row");
    const right = el("span");

    right.append(value);
    row.append(el("span", undefined, label), right);

    return row;
}

function telHref(phone: string): string {
    return `tel:${phone.replace(/[^0-9+]/g, "")}`;
}

function createSupplierCard(supplier: Supplier): HTMLElement {
    const debt = getSupplierDebt(supplier.id);
    const card = el("details", "row-card");
    const summary = el("summary");

    card.open = supplier.id === openId;

    card.addEventListener("toggle", () => {
        if (card.open) {
            openId = supplier.id;
        } else if (openId === supplier.id) {
            openId = null;
        }
    });

    const main = el("div", "row-main");

    main.append(
        el("strong", undefined, supplier.name),
        el("span", undefined, supplier.phone || "Pas de téléphone")
    );

    const side = el("div", "row-side");

    side.append(
        debt.amount > 0
            ? el("span", "badge is-debt", `À payer ${money(debt.amount)}`)
            : el("span", "badge", "À jour")
    );

    summary.append(main, side);

    const details = el("div", "row-details");

    if (supplier.phone) {
        const link = el("a", undefined, supplier.phone);

        link.href = telHref(supplier.phone);
        details.append(detailRow("Téléphone", link));
    }

    const purchaseCount = getPurchases().filter(
        (purchase) => purchase.supplierId === supplier.id && !purchase.cancelledAt
    ).length;

    details.append(
        detailRow("Fournisseur depuis", shortDateLabel(new Date(supplier.createdAt))),
        detailRow("Achats", String(purchaseCount))
    );

    // --- Achats à payer + paiement ---
    if (debt.purchases.length > 0) {
        details.append(el("h3", "detail-title", "Achats à payer"));

        for (const entry of debt.purchases) {
            details.append(
                detailRow(
                    `${shortDateLabel(new Date(entry.purchase.createdAt))} · total ${money(entry.purchase.total)}`,
                    `Reste ${money(entry.remaining)}`
                )
            );
        }

        details.append(createPayBox(supplier, debt.amount));
    }

    // --- Versements ---
    const batches = getSupplierPaymentBatches(supplier.id).slice(0, 6);

    if (batches.length > 0) {
        details.append(el("h3", "detail-title", "Paiements faits"));

        for (const batch of batches) {
            const line = el("div", batch.cancelledAt ? "payment-line is-cancelled" : "payment-line");
            const text = el("div");
            const date = new Date(batch.createdAt);

            text.append(
                el("span", undefined, money(batch.amount)),
                el(
                    "small",
                    undefined,
                    `${CREDIT_METHOD_LABELS[batch.method]} · ${shortDateLabel(date)} ${timeLabel(date)}${batch.cancelledAt ? " · annulé" : ""}`
                )
            );

            line.append(text);

            if (!batch.cancelledAt) {
                const cancel = el("button", "payment-cancel", "Annuler");

                cancel.type = "button";
                cancel.addEventListener("click", () => {
                    // Confirmation en deux temps, sur le bouton lui-même.
                    if (cancel.dataset.confirm !== "1") {
                        cancel.dataset.confirm = "1";
                        cancel.textContent = "Confirmer ?";
                        return;
                    }

                    const result = cancelSupplierPayment(batch.batchId);

                    toast(
                        result.ok
                            ? "Paiement annulé : la dette est remise."
                            : "Impossible d'annuler ce paiement."
                    );

                    openId = supplier.id;
                    render();
                });

                line.append(cancel);
            }

            details.append(line);
        }
    }

    // --- Actions ---
    const actions = el("div", "row-actions");
    const buy = el("a", "action-button link-button", "Nouvel achat");
    const edit = el("button", "action-button", "Modifier");

    buy.href = `achats.html?supplier=${encodeURIComponent(supplier.id)}`;

    edit.type = "button";
    edit.addEventListener("click", () => startEdit(supplier));

    actions.append(
        buy,
        edit,
        createDeleteControl({
            label: "Supprimer ce fournisseur",
            question:
                "Supprimer cette fiche ? Les achats déjà faits restent dans l'historique.",
            onConfirm: () => {
                const result = deleteSupplier(supplier.id);

                if (!result.ok) {
                    toast(
                        result.reason === "has_debt"
                            ? "Impossible : vous devez encore de l'argent à ce fournisseur."
                            : "Impossible de supprimer ce fournisseur."
                    );
                    openId = supplier.id;
                    render();
                    return;
                }

                if (editingId === supplier.id) {
                    resetForm();
                }

                toast("Fournisseur supprimé.");
                render();
            }
        })
    );

    details.append(actions);
    card.append(summary, details);

    return card;
}

function setText(selector: string, text: string): void {
    const node = document.querySelector<HTMLElement>(selector);

    if (node) {
        node.textContent = text;
    }
}

function render(): void {
    const query = (searchInput?.value ?? "").trim().toLowerCase();
    const all = getSuppliers();

    const suppliers = all
        .filter(
            (supplier) =>
                query === "" ||
                supplier.name.toLowerCase().includes(query) ||
                supplier.phone.replace(/\s+/g, "").includes(query.replace(/\s+/g, ""))
        )
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));

    setText("#summarySuppliers", String(all.length));
    setText("#summaryDebt", Math.round(getSuppliersDebtTotal()).toLocaleString("fr-FR"));

    if (emptyElement) {
        emptyElement.hidden = suppliers.length > 0;
    }

    if (suppliers.length === 0) {
        if (emptyTitle) {
            emptyTitle.textContent = all.length === 0 ? "Aucun fournisseur" : "Aucun résultat";
        }

        if (emptyText) {
            emptyText.textContent =
                all.length === 0
                    ? "Les fournisseurs que vous ajoutez apparaîtront ici."
                    : "Aucun fournisseur ne correspond à votre recherche.";
        }
    }

    list.replaceChildren(...suppliers.map(createSupplierCard));
}

searchInput?.addEventListener("input", render);

window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        render();
    }
});

render();
