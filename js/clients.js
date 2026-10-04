// src/clients.ts
// Page Clients : ajouter, modifier, supprimer, voir ce que doit chaque client.
import { MODULE_LIMITS, addClient, clientNameExists, deleteClient, getClientDebt, getClientPayments, getRemainingMap, getClients, isValidPhone, newId, updateClient } from "./storage.js";
import { createPaymentForm, createPaymentsList } from "./credit-ui.js";
import { createDeleteControl, createToast, el, money, shortDateLabel } from "./ui.js";
const form = document.querySelector("#clientForm");
const nameInput = document.querySelector("#clientName");
const phoneInput = document.querySelector("#clientPhone");
const submitButton = document.querySelector("#clientSubmit");
const cancelEditButton = document.querySelector("#clientCancelEdit");
const formTitle = document.querySelector("#clientFormTitle");
const formSection = document.querySelector("#clientFormSection");
const searchInput = document.querySelector("#clientSearch");
const listElement = document.querySelector("#clientsList");
const emptyElement = document.querySelector("#clientsEmpty");
const emptyTitle = document.querySelector("#clientsEmptyTitle");
const emptyText = document.querySelector("#clientsEmptyText");
if (!listElement) {
    throw new Error("EJDEN : #clientsList est introuvable.");
}
const list = listElement;
const toast = createToast();
let editingId = null;
/* =========================================================
   Formulaire (ajout et modification)
   ========================================================= */
function resetForm() {
    editingId = null;
    form?.reset();
    nameInput?.classList.remove("is-invalid");
    phoneInput?.classList.remove("is-invalid");
    if (formTitle)
        formTitle.textContent = "Nouveau client";
    if (submitButton)
        submitButton.textContent = "Ajouter le client";
    if (cancelEditButton)
        cancelEditButton.hidden = true;
}
function startEdit(client) {
    editingId = client.id;
    if (nameInput)
        nameInput.value = client.name;
    if (phoneInput)
        phoneInput.value = client.phone;
    if (formTitle)
        formTitle.textContent = "Modifier le client";
    if (submitButton)
        submitButton.textContent = "Enregistrer";
    if (cancelEditButton)
        cancelEditButton.hidden = false;
    formSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    nameInput?.focus();
}
cancelEditButton?.addEventListener("click", resetForm);
phoneInput?.addEventListener("input", () => {
    phoneInput.classList.remove("is-invalid");
});
nameInput?.addEventListener("input", () => {
    nameInput.classList.remove("is-invalid");
});
form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = (nameInput?.value ?? "").replace(/\s+/g, " ").trim();
    const phone = (phoneInput?.value ?? "").trim();
    if (name === "") {
        nameInput?.classList.add("is-invalid");
        toast("Veuillez saisir le nom du client.");
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
    if (clientNameExists(name, editingId ?? undefined)) {
        nameInput?.classList.add("is-invalid");
        toast("Un client porte déjà ce nom.");
        nameInput?.focus();
        return;
    }
    if (editingId === null) {
        const ok = addClient({
            id: newId(),
            name,
            phone,
            createdAt: new Date().toISOString()
        });
        if (!ok) {
            toast("Impossible d'enregistrer le client.");
            return;
        }
        toast("Client ajouté.");
    }
    else {
        const existing = getClients().find((item) => item.id === editingId);
        if (!existing) {
            toast("Client introuvable.");
            resetForm();
            render();
            return;
        }
        const renamed = existing.name.toLowerCase() !== name.toLowerCase();
        const hadDebt = getClientDebt(existing).amount > 0;
        if (!updateClient({ ...existing, name, phone })) {
            toast("Impossible d'enregistrer les modifications.");
            return;
        }
        toast(renamed && hadDebt
            ? "Modifié. Les anciens crédits restent liés à l'ancien nom."
            : "Client modifié.");
    }
    resetForm();
    render();
});
/* =========================================================
   Liste
   ========================================================= */
function detailRow(label, value) {
    const row = el("div", "detail-row");
    const right = el("span");
    right.append(value);
    row.append(el("span", undefined, label), right);
    return row;
}
/** Numéro utilisable dans un lien tel: (chiffres et + seulement). */
function telHref(phone) {
    return `tel:${phone.replace(/[^0-9+]/g, "")}`;
}
function createClientCard(client) {
    const debt = getClientDebt(client);
    const card = el("details", "row-card");
    const summary = el("summary");
    const main = el("div", "row-main");
    main.append(el("strong", undefined, client.name), el("span", undefined, client.phone || "Pas de téléphone"));
    const side = el("div", "row-side");
    side.append(debt.amount > 0
        ? el("span", "badge is-debt", `Doit ${money(debt.amount)}`)
        : el("span", "badge", "À jour"));
    summary.append(main, side);
    const details = el("div", "row-details");
    if (client.phone) {
        const link = el("a", undefined, client.phone);
        link.href = telHref(client.phone);
        details.append(detailRow("Téléphone", link));
    }
    details.append(detailRow("Client depuis", shortDateLabel(new Date(client.createdAt))));
    if (debt.sales.length > 0) {
        details.append(el("h3", "detail-title", "Crédits en cours"));
        const remaining = getRemainingMap(debt.sales);
        for (const sale of debt.sales) {
            details.append(detailRow(`${shortDateLabel(new Date(sale.createdAt))} · total ${money(sale.total)}`, `Reste ${money(remaining.get(sale.id) ?? 0)}`));
        }
        // Régularisation : le paiement est réparti sur les crédits,
        // du plus ancien au plus récent.
        details.append(createPaymentForm({
            saleIds: [...debt.sales].reverse().map((sale) => sale.id),
            due: debt.amount,
            onSaved: (message) => {
                toast(message);
                render();
            },
            onError: toast
        }));
    }
    const payments = getClientPayments(client, 5);
    if (payments.length > 0) {
        details.append(el("h3", "detail-title", "Derniers paiements reçus"));
        details.append(createPaymentsList(payments));
    }
    const actions = el("div", "row-actions");
    const editButton = el("button", "action-button", "Modifier");
    editButton.type = "button";
    editButton.addEventListener("click", () => startEdit(client));
    actions.append(editButton, createDeleteControl({
        label: "Supprimer ce client",
        question: debt.amount > 0
            ? `${client.name} doit encore ${money(debt.amount)}. Supprimer sa fiche ? Les ventes restent dans l'historique.`
            : "Supprimer cette fiche client ? Les ventes restent dans l'historique.",
        onConfirm: () => {
            if (!deleteClient(client.id)) {
                toast("Impossible de supprimer ce client.");
                render();
                return;
            }
            if (editingId === client.id) {
                resetForm();
            }
            toast("Client supprimé.");
            render();
        }
    }));
    details.append(actions);
    card.append(summary, details);
    return card;
}
function setText(selector, text) {
    const node = document.querySelector(selector);
    if (node) {
        node.textContent = text;
    }
}
function render() {
    const query = (searchInput?.value ?? "").trim().toLowerCase();
    const all = getClients();
    const clients = all
        .filter((client) => query === "" ||
        client.name.toLowerCase().includes(query) ||
        client.phone.replace(/\s+/g, "").includes(query.replace(/\s+/g, "")))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    const totalDebt = all.reduce((sum, client) => sum + getClientDebt(client).amount, 0);
    setText("#summaryClients", String(all.length));
    setText("#summaryDebt", Math.round(totalDebt).toLocaleString("fr-FR"));
    if (emptyElement) {
        emptyElement.hidden = clients.length > 0;
    }
    if (clients.length === 0) {
        if (emptyTitle) {
            emptyTitle.textContent =
                all.length === 0 ? "Aucun client" : "Aucun résultat";
        }
        if (emptyText) {
            emptyText.textContent =
                all.length === 0
                    ? "Les clients que vous ajoutez apparaîtront ici."
                    : "Aucun client ne correspond à votre recherche.";
        }
    }
    list.replaceChildren(...clients.map(createClientCard));
}
searchInput?.addEventListener("input", render);
window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
        render();
    }
});
render();
// Venu de « Ajouter un client » : le champ nom est prêt à être rempli.
if (new URLSearchParams(window.location.search).has("new")) {
    nameInput?.focus();
}
//# sourceMappingURL=clients.js.map