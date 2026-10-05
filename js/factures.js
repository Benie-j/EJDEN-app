// src/factures.ts
// Page Factures : liste, éditeur, aperçu imprimable et paiements.
// Tout texte venant des données passe par textContent (jamais innerHTML).
import { CREDIT_PAYMENT_METHODS, DOC_LIMITS, INVOICE_STATUS_LABELS, MODULE_LIMITS, addDaysToDay, addInvoicePayment, cancelInvoice, computeDocumentTotals, deleteInvoice, documentLineTotal, getClients, getDocumentSettings, getInvoiceById, getInvoiceDisplayStatus, getInvoiceRemaining, getInvoiceTotals, getInvoices, getProducts, getQuoteById, getShopSettings, isValidDay, isValidEmail, isValidPhone, issueInvoice, newId, removeInvoicePayment, saveInvoice } from "./storage.js";
import { shareDocument } from "./share.js";
import { formatDay, printPage, renderDocument } from "./document-view.js";
import { CREDIT_METHOD_LABELS } from "./credit-ui.js";
import { createDeleteControl, createToast, el, money, shortDateLabel, todayInputValue } from "./ui.js";
function byId(id) {
    const node = document.getElementById(id);
    if (!node) {
        throw new Error(`EJDEN : élément #${id} introuvable.`);
    }
    return node;
}
const input = (id) => byId(id);
const area = (id) => byId(id);
const toast = createToast();
const screens = { list: byId("listScreen"), editor: byId("editorScreen"), preview: byId("previewScreen") };
const listElement = byId("invoicesList");
let currentScreen = "list";
let activeFilter = "all";
let searchQuery = "";
let editingId = null;
let previewId = null;
let currentDoc = null;
byId("shareInvoiceButton").addEventListener("click", () => {
    if (!currentDoc)
        return;
    void shareDocument(currentDoc, getShopSettings()).then((message) => {
        if (message)
            toast(message);
    });
});
function showScreen(name) {
    currentScreen = name;
    for (const [key, node] of Object.entries(screens)) {
        node.hidden = key !== name;
    }
    byId("pageTitle").textContent = name === "editor" ? (editingId ? "Modifier la facture" : "Nouvelle facture") : "Factures";
    window.scrollTo(0, 0);
}
byId("backButton").addEventListener("click", (event) => {
    if (currentScreen !== "list") {
        event.preventDefault();
        showList();
    }
});
function parseNumber(text) {
    const clean = text.replace(/\s/g, "").replace(",", ".");
    return clean === "" ? 0 : Number(clean);
}
/* =========================================================
   LISTE
   ========================================================= */
function matchesFilter(status) {
    switch (activeFilter) {
        case "all": return true;
        case "open": return status === "unpaid" || status === "partial";
        default: return status === activeFilter;
    }
}
function renderSummary(invoices) {
    let pending = 0;
    let pendingCount = 0;
    let late = 0;
    let lateCount = 0;
    for (const invoice of invoices) {
        const status = getInvoiceDisplayStatus(invoice);
        const remaining = getInvoiceRemaining(invoice);
        if (status === "unpaid" || status === "partial" || status === "overdue") {
            pending += remaining;
            pendingCount += 1;
        }
        if (status === "overdue") {
            late += remaining;
            lateCount += 1;
        }
    }
    const count = (n) => `${n} facture${n > 1 ? "s" : ""}`;
    byId("summaryPending").textContent = money(pending);
    byId("summaryPendingCount").textContent = count(pendingCount);
    byId("overdueCard").hidden = lateCount === 0;
    byId("summaryOverdue").textContent = money(late);
    byId("summaryOverdueCount").textContent = count(lateCount);
}
function renderList() {
    const invoices = getInvoices();
    const query = searchQuery.trim().toLowerCase();
    const visible = invoices.filter((invoice) => {
        if (!matchesFilter(getInvoiceDisplayStatus(invoice)))
            return false;
        return (query === "" ||
            invoice.number.toLowerCase().includes(query) ||
            invoice.clientName.toLowerCase().includes(query) ||
            invoice.subject.toLowerCase().includes(query));
    });
    renderSummary(invoices);
    listElement.replaceChildren();
    byId("invoicesEmpty").hidden = visible.length > 0;
    if (visible.length === 0) {
        byId("invoicesEmptyTitle").textContent = invoices.length === 0 ? "Aucune facture" : "Aucun résultat";
        byId("invoicesEmptyText").textContent =
            invoices.length === 0
                ? "Créez votre première facture professionnelle."
                : "Aucune facture ne correspond à cette recherche.";
        return;
    }
    for (const invoice of visible) {
        const status = getInvoiceDisplayStatus(invoice);
        const row = el("button", "quote-row");
        const main = el("div", "quote-row-main");
        const side = el("div", "quote-row-side");
        row.type = "button";
        main.append(el("strong", undefined, invoice.clientName), el("span", undefined, `${invoice.number || "Brouillon"} · ${shortDateLabel(new Date(`${invoice.issueDate}T12:00:00`))}`));
        side.append(el("strong", undefined, money(getInvoiceTotals(invoice).total)), el("span", `status-badge is-${status}`, INVOICE_STATUS_LABELS[status]));
        row.append(main, side);
        row.addEventListener("click", () => openPreview(invoice.id));
        listElement.append(row);
    }
}
function showList() {
    editingId = null;
    previewId = null;
    renderList();
    showScreen("list");
}
for (const button of document.querySelectorAll(".devis-filter")) {
    button.addEventListener("click", () => {
        activeFilter = (button.dataset.filter ?? "all");
        for (const other of document.querySelectorAll(".devis-filter")) {
            other.classList.toggle("is-active", other === button);
        }
        renderList();
    });
}
input("searchInput").addEventListener("input", (event) => {
    searchQuery = event.target.value;
    renderList();
});
byId("newInvoiceButton").addEventListener("click", () => openEditor(null));
byId("printListButton").addEventListener("click", () => {
    const shop = getShopSettings();
    byId("printListHeader").replaceChildren(el("strong", undefined, `Liste des factures${shop.name ? ` — ${shop.name}` : ""}`), el("span", undefined, `Édité le ${formatDay(todayInputValue())}`));
    printPage();
});
/* =========================================================
   APERÇU + PAIEMENTS
   ========================================================= */
function invoiceToDocument(invoice) {
    const settings = getDocumentSettings();
    const status = getInvoiceDisplayStatus(invoice);
    const stamp = status === "paid" ? "PAYÉE"
        : status === "cancelled" ? "ANNULÉE"
            : status === "draft" ? "BROUILLON"
                : status === "overdue" ? "EN RETARD"
                    : null;
    return {
        title: "FACTURE",
        number: invoice.number || "(brouillon)",
        issueDate: invoice.issueDate,
        dueLabel: "Échéance",
        dueDate: invoice.dueDate,
        stamp,
        party: {
            label: "Facturé à",
            name: invoice.clientName,
            phone: invoice.clientPhone,
            email: invoice.clientEmail,
            address: invoice.clientAddress
        },
        subject: invoice.subject,
        lines: invoice.lines,
        taxRate: invoice.taxRate,
        depositPct: 0,
        depositLabel: "",
        totals: getInvoiceTotals(invoice),
        payments: invoice.payments.map((payment) => ({
            date: payment.date,
            label: CREDIT_METHOD_LABELS[payment.method],
            amount: payment.amount
        })),
        balanceDue: invoice.status === "issued" || invoice.payments.length > 0 ? getInvoiceRemaining(invoice) : null,
        blocks: [
            ...(invoice.quoteNumber ? [{ title: "Référence", text: `Devis n° ${invoice.quoteNumber}` }] : []),
            { title: "Modalités de paiement", text: invoice.paymentTerms },
            { title: "Moyens de paiement", text: settings.paymentInfo },
            { title: "Notes", text: invoice.notes },
            { title: "Mentions légales", text: invoice.terms }
        ],
        amountInWordsLead: "Arrêtée la présente facture à la somme de",
        signatures: null
    };
}
function openPreview(invoiceId) {
    const invoice = getInvoiceById(invoiceId);
    if (!invoice) {
        toast("Facture introuvable.");
        showList();
        return;
    }
    previewId = invoice.id;
    const isDraft = invoice.status === "draft";
    const issued = invoice.status === "issued";
    currentDoc = invoiceToDocument(invoice);
    byId("docWrap").replaceChildren(renderDocument(currentDoc, getShopSettings(), getDocumentSettings()));
    byId("editInvoiceButton").hidden = !isDraft;
    byId("issueInvoiceButton").hidden = !isDraft;
    const quoteLink = byId("quoteLink");
    quoteLink.hidden = invoice.quoteId === null || getQuoteById(invoice.quoteId) === null;
    renderPayments(invoice);
    byId("deleteHost").replaceChildren(isDraft
        ? createDeleteControl({
            label: "Supprimer ce brouillon",
            question: "Supprimer définitivement ce brouillon ?",
            onConfirm: () => {
                if (deleteInvoice(invoice.id)) {
                    toast("Brouillon supprimé.");
                    showList();
                }
                else {
                    toast("Impossible de supprimer le brouillon.");
                }
            }
        })
        : el("span"));
    byId("paymentSection").hidden = !issued && invoice.payments.length === 0;
    showScreen("preview");
}
function renderPayments(invoice) {
    const issued = invoice.status === "issued";
    const remaining = getInvoiceRemaining(invoice);
    const listNode = byId("paymentList");
    listNode.replaceChildren();
    if (invoice.payments.length === 0) {
        listNode.append(el("p", "form-note", "Aucun paiement enregistré."));
    }
    for (const payment of invoice.payments) {
        const row = el("div", "payment-row");
        const text = el("div");
        text.append(el("strong", undefined, money(payment.amount)), el("span", undefined, ` · ${CREDIT_METHOD_LABELS[payment.method]} · ${formatDay(payment.date)}${payment.note ? ` · ${payment.note}` : ""}`));
        row.append(text);
        if (issued) {
            const remove = el("button", "link-danger", "Retirer");
            remove.type = "button";
            remove.addEventListener("click", () => {
                if (removeInvoicePayment(invoice.id, payment.id)) {
                    toast("Paiement retiré.");
                    openPreview(invoice.id);
                }
            });
            row.append(remove);
        }
        if (issued || invoice.status === "cancelled") {
            const receipt = el("a", "link-receipt", "Reçu");
            receipt.href = `recus.html?open=${encodeURIComponent(`${invoice.id}:${payment.id}`)}`;
            row.append(receipt);
        }
        listNode.append(row);
    }
    byId("paymentForm").hidden = !issued || remaining === 0;
    input("payAmount").value = remaining > 0 ? String(remaining) : "";
    input("payDate").value = todayInputValue();
    input("payNote").value = "";
    byId("cancelHost").replaceChildren(issued
        ? createDeleteControl({
            label: "Annuler la facture",
            question: "Annuler cette facture ? Elle restera dans la liste, marquée « Annulée ».",
            onConfirm: () => {
                if (cancelInvoice(invoice.id)) {
                    toast("Facture annulée.");
                    openPreview(invoice.id);
                }
                else {
                    toast("Retirez d'abord les paiements pour annuler la facture.");
                }
            }
        })
        : el("span"));
}
const payMethod = byId("payMethod");
for (const method of CREDIT_PAYMENT_METHODS) {
    payMethod.append(new Option(CREDIT_METHOD_LABELS[method], method));
}
byId("paymentForm").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!previewId)
        return;
    const amount = Math.round(parseNumber(input("payAmount").value));
    const result = addInvoicePayment(previewId, amount, payMethod.value, input("payDate").value, input("payNote").value.trim());
    const messages = {
        ok: "Paiement enregistré.",
        invalid: "Montant ou date invalide.",
        "too-much": "Le montant dépasse le reste à payer.",
        "not-issued": "La facture doit d'abord être émise.",
        "not-found": "Facture introuvable.",
        error: "Impossible d'enregistrer le paiement."
    };
    toast(messages[result] ?? "Erreur.");
    if (result === "ok")
        openPreview(previewId);
});
byId("printInvoiceButton").addEventListener("click", printPage);
byId("issueInvoiceButton").addEventListener("click", () => {
    const invoice = previewId ? issueInvoice(previewId) : null;
    if (invoice) {
        toast(`Facture ${invoice.number} émise.`);
        openPreview(invoice.id);
    }
    else {
        toast("Impossible d'émettre la facture.");
    }
});
byId("editInvoiceButton").addEventListener("click", () => {
    const invoice = previewId ? getInvoiceById(previewId) : null;
    if (invoice)
        openEditor(invoice);
});
byId("duplicateInvoiceButton").addEventListener("click", () => {
    const source = previewId ? getInvoiceById(previewId) : null;
    if (!source)
        return;
    const today = todayInputValue();
    const now = new Date().toISOString();
    const copy = {
        ...source,
        id: newId(),
        number: "",
        status: "draft",
        createdAt: now,
        updatedAt: now,
        issueDate: today,
        dueDate: addDaysToDay(today, getDocumentSettings().defaultDueDays),
        quoteId: null,
        quoteNumber: "",
        payments: []
    };
    if (saveInvoice(copy)) {
        toast("Copie créée en brouillon.");
        openPreview(copy.id);
    }
    else {
        toast("Impossible de dupliquer la facture.");
    }
});
/* =========================================================
   ÉDITEUR
   ========================================================= */
const form = byId("invoiceForm");
const linesContainer = byId("linesContainer");
const clientSelect = byId("clientSelect");
let lineFields = [];
function readLine(f) {
    return {
        productId: f.productId(),
        description: f.description.value.trim(),
        unit: f.unit.value.trim(),
        quantity: parseNumber(f.quantity.value),
        unitPrice: parseNumber(f.price.value),
        discountPct: parseNumber(f.discount.value)
    };
}
function lineIsValid(line) {
    return (line.description !== "" &&
        Number.isFinite(line.quantity) && line.quantity > 0 && line.quantity <= 1_000_000 &&
        Number.isFinite(line.unitPrice) && line.unitPrice >= 0 && line.unitPrice <= MODULE_LIMITS.amountMax &&
        Number.isFinite(line.discountPct) && line.discountPct >= 0 && line.discountPct <= 100);
}
function labeled(label, control) {
    const field = el("div", "field");
    field.append(el("label", undefined, label), control);
    return field;
}
function addLine(initial) {
    if (lineFields.length >= DOC_LIMITS.linesMax) {
        toast(`${DOC_LIMITS.linesMax} lignes maximum.`);
        return;
    }
    const card = el("div", "line-card");
    const products = getProducts();
    let productId = initial?.productId ?? null;
    const picker = el("select");
    picker.append(new Option("Saisie libre ou choisir un produit…", ""));
    for (const product of products)
        picker.append(new Option(product.name, product.id));
    const description = el("input");
    const unit = el("input");
    const quantity = el("input");
    const price = el("input");
    const discount = el("input");
    description.maxLength = DOC_LIMITS.descriptionMax;
    description.placeholder = "Désignation";
    unit.maxLength = DOC_LIMITS.unitMax;
    unit.placeholder = "pièce, kg, h…";
    for (const f of [quantity, price, discount])
        f.inputMode = "decimal";
    quantity.placeholder = "1";
    price.placeholder = "0";
    discount.placeholder = "0";
    if (initial) {
        description.value = initial.description;
        unit.value = initial.unit;
        quantity.value = String(initial.quantity);
        price.value = String(initial.unitPrice);
        discount.value = initial.discountPct > 0 ? String(initial.discountPct) : "";
        if (productId && products.some((p) => p.id === productId))
            picker.value = productId;
    }
    else {
        quantity.value = "1";
    }
    picker.addEventListener("change", () => {
        const product = products.find((p) => p.id === picker.value);
        productId = product ? product.id : null;
        if (product) {
            description.value = product.name;
            price.value = String(product.salePrice);
            recompute();
        }
    });
    const total = el("strong", undefined, money(0));
    const remove = el("button", "link-danger", "Supprimer la ligne");
    const foot = el("div", "line-card-foot");
    const rowA = el("div", "field-row");
    const rowB = el("div", "field-row");
    remove.type = "button";
    remove.addEventListener("click", () => {
        lineFields = lineFields.filter((item) => item.card !== card);
        card.remove();
        recompute();
    });
    foot.append(remove, total);
    rowA.append(labeled("Quantité", quantity), labeled("Unité", unit));
    rowB.append(labeled("Prix unitaire (FCFA)", price), labeled("Remise (%)", discount));
    card.append(labeled("Produit (facultatif)", picker), labeled("Désignation", description), rowA, rowB, foot);
    for (const control of [description, unit, quantity, price, discount]) {
        control.addEventListener("input", () => {
            control.classList.remove("is-invalid");
            recompute();
        });
    }
    lineFields.push({ card, productId: () => productId, description, unit, quantity, price, discount, total });
    linesContainer.append(card);
    recompute();
}
function recompute() {
    const lines = [];
    for (const f of lineFields) {
        const line = readLine(f);
        const valid = lineIsValid(line);
        f.total.textContent = money(valid ? documentLineTotal(line) : 0);
        if (valid)
            lines.push(line);
    }
    const taxRate = Math.min(100, Math.max(0, parseNumber(input("invoiceTax").value) || 0));
    const discount = Math.max(0, parseNumber(input("invoiceDiscount").value) || 0);
    const totals = computeDocumentTotals(lines, discount, taxRate, 0);
    byId("tSubtotal").textContent = money(totals.subtotal);
    byId("tDiscountRow").hidden = totals.discount === 0;
    byId("tDiscount").textContent = `− ${money(totals.discount)}`;
    byId("tTaxRow").hidden = taxRate === 0;
    byId("tTaxLabel").textContent = `TVA (${taxRate} %)`;
    byId("tTax").textContent = money(totals.tax);
    byId("tTotal").textContent = money(totals.total);
}
for (const id of ["invoiceDiscount", "invoiceTax"])
    input(id).addEventListener("input", recompute);
byId("addLineButton").addEventListener("click", () => addLine());
clientSelect.addEventListener("change", () => {
    const client = getClients().find((c) => c.id === clientSelect.value);
    if (client) {
        input("clientName").value = client.name;
        input("clientPhone").value = client.phone;
    }
});
function openEditor(invoice) {
    const settings = getDocumentSettings();
    const today = todayInputValue();
    const clients = getClients();
    editingId = invoice ? invoice.id : null;
    form.reset();
    lineFields = [];
    linesContainer.replaceChildren();
    clientSelect.replaceChildren(new Option("Nouveau client (saisie libre)", ""));
    for (const client of clients)
        clientSelect.append(new Option(client.name, client.id));
    clientSelect.value = invoice?.clientId && clients.some((c) => c.id === invoice.clientId) ? invoice.clientId : "";
    input("clientName").value = invoice?.clientName ?? "";
    input("clientPhone").value = invoice?.clientPhone ?? "";
    input("clientEmail").value = invoice?.clientEmail ?? "";
    area("clientAddress").value = invoice?.clientAddress ?? "";
    input("invoiceSubject").value = invoice?.subject ?? "";
    input("issueDate").value = invoice?.issueDate ?? today;
    input("dueDate").value = invoice?.dueDate ?? addDaysToDay(today, settings.defaultDueDays);
    input("invoiceDiscount").value = invoice && invoice.discount > 0 ? String(invoice.discount) : "";
    input("invoiceTax").value = String(invoice ? invoice.taxRate : settings.defaultTaxRate);
    input("paymentTerms").value = invoice?.paymentTerms ?? "";
    area("invoiceNotes").value = invoice?.notes ?? "";
    area("invoiceTerms").value = invoice ? invoice.terms : settings.invoiceTerms;
    if (invoice)
        for (const line of invoice.lines)
            addLine(line);
    else
        addLine();
    recompute();
    showScreen("editor");
}
byId("cancelEditButton").addEventListener("click", () => (editingId ? openPreview(editingId) : showList()));
function fail(message, field) {
    toast(message);
    if (field) {
        field.classList.add("is-invalid");
        field.focus();
    }
}
form.addEventListener("submit", (event) => {
    event.preventDefault();
    const clientName = input("clientName").value.trim();
    const clientPhone = input("clientPhone").value.trim();
    const clientEmail = input("clientEmail").value.trim();
    const issueDate = input("issueDate").value;
    const dueDate = input("dueDate").value;
    if (clientName === "")
        return fail("Indiquez le nom du client.", input("clientName"));
    if (!isValidPhone(clientPhone))
        return fail("Téléphone du client invalide.", input("clientPhone"));
    if (!isValidEmail(clientEmail))
        return fail("E-mail du client invalide.", input("clientEmail"));
    if (!isValidDay(issueDate))
        return fail("Date de la facture invalide.", input("issueDate"));
    if (!isValidDay(dueDate) || dueDate < issueDate)
        return fail("L'échéance doit suivre la date de la facture.", input("dueDate"));
    if (lineFields.length === 0)
        return fail("Ajoutez au moins une ligne.");
    const lines = [];
    for (const f of lineFields) {
        const line = readLine(f);
        if (!lineIsValid(line)) {
            return fail("Ligne incomplète : désignation, quantité > 0 et prix valides.", line.description === "" ? f.description : f.price);
        }
        lines.push(line);
    }
    const discount = parseNumber(input("invoiceDiscount").value);
    const taxRate = parseNumber(input("invoiceTax").value);
    const subtotal = computeDocumentTotals(lines, 0, 0, 0).subtotal;
    if (!Number.isFinite(discount) || discount < 0 || discount > subtotal)
        return fail("Remise invalide (entre 0 et le sous-total).", input("invoiceDiscount"));
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100)
        return fail("TVA invalide (0 à 100 %).", input("invoiceTax"));
    if (computeDocumentTotals(lines, discount, taxRate, 0).total > DOC_LIMITS.totalMax)
        return fail("Montant total trop élevé.");
    const existing = editingId ? getInvoiceById(editingId) : null;
    const now = new Date().toISOString();
    const invoice = {
        id: existing?.id ?? newId(),
        number: existing?.number ?? "",
        status: existing?.status ?? "draft",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        issueDate,
        dueDate,
        quoteId: existing?.quoteId ?? null,
        quoteNumber: existing?.quoteNumber ?? "",
        clientId: clientSelect.value || null,
        clientName,
        clientPhone,
        clientEmail,
        clientAddress: area("clientAddress").value.trim(),
        subject: input("invoiceSubject").value.trim(),
        lines,
        discount: Math.round(discount),
        taxRate,
        paymentTerms: input("paymentTerms").value.trim(),
        notes: area("invoiceNotes").value.trim(),
        terms: area("invoiceTerms").value.trim(),
        payments: existing?.payments ?? []
    };
    if (!saveInvoice(invoice)) {
        toast("Impossible d'enregistrer la facture.");
        return;
    }
    toast("Brouillon enregistré. Vérifiez puis émettez la facture.");
    openPreview(invoice.id);
});
/* =========================================================
   Démarrage
   ========================================================= */
const shop = getShopSettings();
const docSettings = getDocumentSettings();
byId("settingsNotice").hidden = shop.name !== "" && docSettings.address !== "";
const openParam = new URLSearchParams(window.location.search).get("open");
if (openParam && getInvoiceById(openParam)) {
    openPreview(openParam);
}
else {
    renderList();
}
//# sourceMappingURL=factures.js.map