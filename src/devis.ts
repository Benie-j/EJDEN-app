// src/devis.ts
// Page Devis : liste, éditeur et aperçu imprimable.
// Tout texte venant des données passe par textContent (jamais innerHTML).

import {
    type Quote,
    type QuoteDisplayStatus,
    type QuoteStatus,
    type DocumentLine,
    DOC_LIMITS,
    MODULE_LIMITS,
    QUOTE_STATUS_LABELS,
    addDaysToDay,
    computeDocumentTotals,
    createInvoiceFromQuote,
    deleteQuote,
    documentLineTotal,
    duplicateQuote,
    getClients,
    getDocumentSettings,
    getProducts,
    getQuoteById,
    getQuoteDisplayStatus,
    getQuoteTotals,
    getQuotes,
    getShopSettings,
    isValidDay,
    isValidEmail,
    isValidPhone,
    newId,
    reserveDocumentNumber,
    saveQuote,
    setQuoteStatus
} from "./storage.js";
import { shareDocument } from "./share.js";
import { type PrintableDocument, formatDay, printPage, renderDocument } from "./document-view.js";
import { createDeleteControl, createToast, el, money, shortDateLabel, todayInputValue } from "./ui.js";

function byId<T extends HTMLElement>(id: string): T {
    const node = document.getElementById(id);

    if (!node) {
        throw new Error(`EJDEN : élément #${id} introuvable.`);
    }

    return node as T;
}

const toast = createToast();
const screens = {
    list: byId("listScreen"),
    editor: byId("editorScreen"),
    preview: byId("previewScreen")
};
const pageTitle = byId("pageTitle");
const listElement = byId("quotesList");

type ScreenName = keyof typeof screens;
type Filter = "all" | "draft" | "sent" | "accepted" | "closed";

let currentScreen: ScreenName = "list";
let activeFilter: Filter = "all";
let searchQuery = "";
let editingId: string | null = null;
let previewId: string | null = null;

let currentDoc: PrintableDocument | null = null;

byId("shareQuoteButton").addEventListener("click", () => {
    if (!currentDoc) return;

    void shareDocument(currentDoc, getShopSettings()).then((message) => {
        if (message) toast(message);
    });
});

function showScreen(name: ScreenName): void {
    currentScreen = name;

    for (const [key, node] of Object.entries(screens)) {
        node.hidden = key !== name;
    }

    pageTitle.textContent =
        name === "editor" ? (editingId ? "Modifier le devis" : "Nouveau devis")
        : name === "preview" ? "Devis"
        : "Devis";

    window.scrollTo(0, 0);
}

byId("backButton").addEventListener("click", (event) => {
    if (currentScreen !== "list") {
        event.preventDefault();
        showList();
    }
});

/* =========================================================
   Nombres saisis (virgule ou point acceptés)
   ========================================================= */

function parseNumber(text: string): number {
    const clean = text.replace(/\s/g, "").replace(",", ".");

    return clean === "" ? 0 : Number(clean);
}

/* =========================================================
   LISTE
   ========================================================= */

function statusBadge(status: QuoteDisplayStatus): HTMLElement {
    return el("span", `status-badge is-${status}`, QUOTE_STATUS_LABELS[status]);
}

function matchesFilter(status: QuoteDisplayStatus): boolean {
    switch (activeFilter) {
        case "all": return true;
        case "closed": return status === "refused" || status === "expired";
        default: return status === activeFilter;
    }
}

function renderSummary(quotes: Quote[]): void {
    let pending = 0;
    let pendingCount = 0;
    let accepted = 0;
    let acceptedCount = 0;

    for (const quote of quotes) {
        const status = getQuoteDisplayStatus(quote);
        const total = getQuoteTotals(quote).total;

        if (status === "sent") {
            pending += total;
            pendingCount += 1;
        } else if (status === "accepted") {
            accepted += total;
            acceptedCount += 1;
        }
    }

    const count = (n: number): string => `${n} devis`;

    byId("summaryPending").textContent = money(pending);
    byId("summaryPendingCount").textContent = count(pendingCount);
    byId("summaryAccepted").textContent = money(accepted);
    byId("summaryAcceptedCount").textContent = count(acceptedCount);
}

function renderList(): void {
    const quotes = getQuotes();
    const query = searchQuery.trim().toLowerCase();
    const visible = quotes.filter((quote) => {
        if (!matchesFilter(getQuoteDisplayStatus(quote))) return false;

        return (
            query === "" ||
            quote.number.toLowerCase().includes(query) ||
            quote.clientName.toLowerCase().includes(query) ||
            quote.subject.toLowerCase().includes(query)
        );
    });

    renderSummary(quotes);
    listElement.replaceChildren();

    const empty = byId("quotesEmpty");

    empty.hidden = visible.length > 0;

    if (visible.length === 0) {
        byId("quotesEmptyTitle").textContent = quotes.length === 0 ? "Aucun devis" : "Aucun résultat";
        byId("quotesEmptyText").textContent =
            quotes.length === 0
                ? "Créez votre premier devis professionnel."
                : "Aucun devis ne correspond à cette recherche.";
        return;
    }

    for (const quote of visible) {
        const status = getQuoteDisplayStatus(quote);
        const row = el("button", "quote-row");
        const main = el("div", "quote-row-main");
        const side = el("div", "quote-row-side");

        row.type = "button";
        main.append(
            el("strong", undefined, quote.clientName),
            el("span", undefined, `${quote.number} · ${shortDateLabel(new Date(`${quote.issueDate}T12:00:00`))}`)
        );
        side.append(el("strong", undefined, money(getQuoteTotals(quote).total)), statusBadge(status));
        row.append(main, side);
        row.addEventListener("click", () => openPreview(quote.id));
        listElement.append(row);
    }
}

function showList(): void {
    editingId = null;
    previewId = null;
    renderList();
    showScreen("list");
}

for (const button of document.querySelectorAll<HTMLButtonElement>(".devis-filter")) {
    button.addEventListener("click", () => {
        activeFilter = (button.dataset.filter ?? "all") as Filter;

        for (const other of document.querySelectorAll(".devis-filter")) {
            other.classList.toggle("is-active", other === button);
        }

        renderList();
    });
}

byId<HTMLInputElement>("searchInput").addEventListener("input", (event) => {
    searchQuery = (event.target as HTMLInputElement).value;
    renderList();
});

byId("newQuoteButton").addEventListener("click", () => openEditor(null));

byId("printListButton").addEventListener("click", () => {
    const shop = getShopSettings();
    const header = byId("printListHeader");

    header.replaceChildren(
        el("strong", undefined, `Liste des devis${shop.name ? ` — ${shop.name}` : ""}`),
        el("span", undefined, `Édité le ${formatDay(todayInputValue())}`)
    );
    printPage();
});

/* =========================================================
   APERÇU
   ========================================================= */

function quoteToDocument(quote: Quote): PrintableDocument {
    const shop = getShopSettings();
    const settings = getDocumentSettings();
    const status = getQuoteDisplayStatus(quote);
    const stamp =
        status === "accepted" ? "ACCEPTÉ"
        : status === "refused" ? "REFUSÉ"
        : status === "expired" ? "EXPIRÉ"
        : null;

    return {
        title: "DEVIS",
        number: quote.number,
        issueDate: quote.issueDate,
        dueLabel: "Valable jusqu'au",
        dueDate: quote.validUntil,
        stamp,
        party: {
            label: "Destinataire",
            name: quote.clientName,
            phone: quote.clientPhone,
            email: quote.clientEmail,
            address: quote.clientAddress
        },
        subject: quote.subject,
        lines: quote.lines,
        taxRate: quote.taxRate,
        depositPct: quote.depositPct,
        depositLabel: "Acompte à la commande",
        totals: getQuoteTotals(quote),
        payments: [],
        balanceDue: null,
        blocks: [
            { title: "Délai de livraison", text: quote.deliveryTerms },
            { title: "Conditions de paiement", text: quote.paymentTerms },
            { title: "Moyens de paiement", text: settings.paymentInfo },
            { title: "Notes", text: quote.notes },
            { title: "Conditions générales", text: quote.terms }
        ],
        amountInWordsLead: "Arrêté le présent devis à la somme de",
        signatures: ["Le client — « Bon pour accord », date et signature", shop.name ? `Pour ${shop.name}` : "Pour l'entreprise"]
    };
}

function openPreview(quoteId: string): void {
    const quote = getQuoteById(quoteId);

    if (!quote) {
        toast("Devis introuvable.");
        showList();
        return;
    }

    previewId = quote.id;

    const status = getQuoteDisplayStatus(quote);
    const editable = quote.status === "draft" || quote.status === "sent";

    currentDoc = quoteToDocument(quote);
    byId("docWrap").replaceChildren(renderDocument(currentDoc, getShopSettings(), getDocumentSettings()));
    byId("editQuoteButton").hidden = !editable;

    const invoiceButton = byId("invoiceQuoteButton");
    const invoiceLink = byId("invoiceLink");

    invoiceButton.hidden = quote.status !== "accepted" || quote.invoiceId !== null;
    invoiceLink.hidden = quote.invoiceId === null;
    invoiceLink.setAttribute("href", `factures.html?open=${encodeURIComponent(quote.invoiceId ?? "")}`);

    const switcher = byId("statusSwitch");

    switcher.replaceChildren();

    const choices: QuoteStatus[] = ["draft", "sent", "accepted", "refused"];

    for (const choice of choices) {
        const button = el("button", choice === quote.status ? "is-active" : undefined, QUOTE_STATUS_LABELS[choice]);

        button.type = "button";
        button.addEventListener("click", () => {
            if (choice === quote.status) return;

            if (setQuoteStatus(quote.id, choice)) {
                toast(`Devis marqué « ${QUOTE_STATUS_LABELS[choice]} ».`);
                openPreview(quote.id);
            } else {
                toast("Impossible de changer le statut.");
            }
        });
        switcher.append(button);
    }

    if (status === "expired") {
        switcher.append(el("span", "form-note", "Ce devis a dépassé sa date de validité."));
    }

    byId("deleteHost").replaceChildren(
        createDeleteControl({
            label: "Supprimer ce devis",
            question: `Supprimer définitivement le devis ${quote.number} ?`,
            onConfirm: () => {
                if (deleteQuote(quote.id)) {
                    toast("Devis supprimé.");
                    showList();
                } else {
                    toast("Impossible de supprimer le devis.");
                }
            }
        })
    );

    showScreen("preview");
}

byId("printQuoteButton").addEventListener("click", printPage);

byId("invoiceQuoteButton").addEventListener("click", () => {
    const invoice = previewId ? createInvoiceFromQuote(previewId) : null;

    if (invoice) {
        window.location.href = `factures.html?open=${encodeURIComponent(invoice.id)}`;
    } else {
        toast("Impossible de créer la facture.");
    }
});

byId("editQuoteButton").addEventListener("click", () => {
    const quote = previewId ? getQuoteById(previewId) : null;

    if (quote) openEditor(quote);
});

byId("duplicateQuoteButton").addEventListener("click", () => {
    if (!previewId) return;

    const copy = duplicateQuote(previewId);

    if (copy) {
        toast(`Copie créée : ${copy.number}`);
        openPreview(copy.id);
    } else {
        toast("Impossible de dupliquer le devis.");
    }
});

/* =========================================================
   ÉDITEUR
   ========================================================= */

const form = byId<HTMLFormElement>("quoteForm");
const linesContainer = byId("linesContainer");
const input = (id: string): HTMLInputElement => byId<HTMLInputElement>(id);
const area = (id: string): HTMLTextAreaElement => byId<HTMLTextAreaElement>(id);

interface LineFields {
    card: HTMLElement;
    productId: () => string | null;
    description: HTMLInputElement;
    unit: HTMLInputElement;
    quantity: HTMLInputElement;
    price: HTMLInputElement;
    discount: HTMLInputElement;
    total: HTMLElement;
}

let lineFields: LineFields[] = [];

function readLine(fields: LineFields): DocumentLine {
    return {
        productId: fields.productId(),
        description: fields.description.value.trim(),
        unit: fields.unit.value.trim(),
        quantity: parseNumber(fields.quantity.value),
        unitPrice: parseNumber(fields.price.value),
        discountPct: parseNumber(fields.discount.value)
    };
}

function lineIsValid(line: DocumentLine): boolean {
    return (
        line.description !== "" &&
        Number.isFinite(line.quantity) && line.quantity > 0 && line.quantity <= 1_000_000 &&
        Number.isFinite(line.unitPrice) && line.unitPrice >= 0 && line.unitPrice <= MODULE_LIMITS.amountMax &&
        Number.isFinite(line.discountPct) && line.discountPct >= 0 && line.discountPct <= 100
    );
}

function labeledField(label: string, control: HTMLElement): HTMLElement {
    const field = el("div", "field");

    field.append(el("label", undefined, label), control);

    return field;
}

function addLine(initial?: DocumentLine): void {
    if (lineFields.length >= DOC_LIMITS.linesMax) {
        toast(`${DOC_LIMITS.linesMax} lignes maximum.`);
        return;
    }

    const card = el("div", "line-card");
    const products = getProducts();
    let productId: string | null = initial?.productId ?? null;

    const picker = el("select");

    picker.append(new Option("Saisie libre ou choisir un produit…", ""));

    for (const product of products) {
        picker.append(new Option(product.name, product.id));
    }

    const description = el("input");
    const unit = el("input");
    const quantity = el("input");
    const price = el("input");
    const discount = el("input");

    description.type = "text";
    description.maxLength = DOC_LIMITS.descriptionMax;
    description.placeholder = "Désignation (ex. : Ramette papier A4)";
    unit.type = "text";
    unit.maxLength = DOC_LIMITS.unitMax;
    unit.placeholder = "pièce, kg, h…";
    for (const field of [quantity, price, discount]) field.inputMode = "decimal";
    quantity.placeholder = "1";
    price.placeholder = "0";
    discount.placeholder = "0";

    if (initial) {
        description.value = initial.description;
        unit.value = initial.unit;
        quantity.value = String(initial.quantity);
        price.value = String(initial.unitPrice);
        discount.value = initial.discountPct > 0 ? String(initial.discountPct) : "";

        if (productId && products.some((p) => p.id === productId)) picker.value = productId;
    } else {
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

    remove.type = "button";
    remove.addEventListener("click", () => {
        lineFields = lineFields.filter((item) => item.card !== card);
        card.remove();
        recompute();
    });

    const foot = el("div", "line-card-foot");

    foot.append(remove, total);

    const rowA = el("div", "field-row");
    const rowB = el("div", "field-row");

    rowA.append(labeledField("Quantité", quantity), labeledField("Unité", unit));
    rowB.append(labeledField("Prix unitaire (FCFA)", price), labeledField("Remise (%)", discount));

    card.append(labeledField("Produit (facultatif)", picker), labeledField("Désignation", description), rowA, rowB, foot);

    const fields: LineFields = { card, productId: () => productId, description, unit, quantity, price, discount, total };

    for (const control of [description, unit, quantity, price, discount]) {
        control.addEventListener("input", () => {
            control.classList.remove("is-invalid");
            recompute();
        });
    }

    lineFields.push(fields);
    linesContainer.append(card);
    recompute();
}

function recompute(): void {
    const lines: DocumentLine[] = [];

    for (const fields of lineFields) {
        const line = readLine(fields);
        const valid = lineIsValid(line);

        fields.total.textContent = money(valid ? documentLineTotal(line) : 0);
        if (valid) lines.push(line);
    }

    const taxRate = Math.min(100, Math.max(0, parseNumber(input("quoteTax").value) || 0));
    const depositPct = Math.min(100, Math.max(0, parseNumber(input("quoteDeposit").value) || 0));
    const discount = Math.max(0, parseNumber(input("quoteDiscount").value) || 0);
    const totals = computeDocumentTotals(lines, discount, taxRate, depositPct);

    byId("tSubtotal").textContent = money(totals.subtotal);
    byId("tDiscountRow").hidden = totals.discount === 0;
    byId("tDiscount").textContent = `− ${money(totals.discount)}`;
    byId("tTaxRow").hidden = taxRate === 0;
    byId("tTaxLabel").textContent = `TVA (${taxRate} %)`;
    byId("tTax").textContent = money(totals.tax);
    byId("tTotal").textContent = money(totals.total);
    byId("tDepositRow").hidden = depositPct === 0;
    byId("tDeposit").textContent = `${money(totals.deposit)} (reste ${money(totals.balance)})`;
}

for (const id of ["quoteDiscount", "quoteTax", "quoteDeposit"]) {
    input(id).addEventListener("input", recompute);
}

byId("addLineButton").addEventListener("click", () => addLine());

const clientSelect = byId<HTMLSelectElement>("clientSelect");

clientSelect.addEventListener("change", () => {
    const client = getClients().find((c) => c.id === clientSelect.value);

    if (client) {
        input("clientName").value = client.name;
        input("clientPhone").value = client.phone;
    }
});

function openEditor(quote: Quote | null): void {
    const settings = getDocumentSettings();
    const today = todayInputValue();

    editingId = quote ? quote.id : null;
    form.reset();
    lineFields = [];
    linesContainer.replaceChildren();

    clientSelect.replaceChildren(new Option("Nouveau client (saisie libre)", ""));

    for (const client of getClients()) {
        clientSelect.append(new Option(client.name, client.id));
    }

    clientSelect.value = quote?.clientId && getClients().some((c) => c.id === quote.clientId) ? quote.clientId : "";

    input("clientName").value = quote?.clientName ?? "";
    input("clientPhone").value = quote?.clientPhone ?? "";
    input("clientEmail").value = quote?.clientEmail ?? "";
    area("clientAddress").value = quote?.clientAddress ?? "";
    input("quoteSubject").value = quote?.subject ?? "";
    input("issueDate").value = quote?.issueDate ?? today;
    input("validUntil").value = quote?.validUntil ?? addDaysToDay(today, settings.defaultValidityDays);
    input("quoteDiscount").value = quote && quote.discount > 0 ? String(quote.discount) : "";
    input("quoteTax").value = String(quote ? quote.taxRate : settings.defaultTaxRate);
    input("quoteDeposit").value = quote && quote.depositPct > 0 ? String(quote.depositPct) : "";
    input("deliveryTerms").value = quote?.deliveryTerms ?? "";
    input("paymentTerms").value = quote?.paymentTerms ?? "";
    area("quoteNotes").value = quote?.notes ?? "";
    area("quoteTerms").value = quote ? quote.terms : settings.quoteTerms;

    if (quote) {
        for (const line of quote.lines) addLine(line);
    } else {
        addLine();
    }

    recompute();
    showScreen("editor");
}

byId("cancelEditButton").addEventListener("click", () => {
    if (editingId) openPreview(editingId);
    else showList();
});

function fail(message: string, field?: HTMLElement): void {
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
    const validUntil = input("validUntil").value;

    if (clientName === "") return fail("Indiquez le nom du client.", input("clientName"));
    if (!isValidPhone(clientPhone)) return fail("Téléphone du client invalide.", input("clientPhone"));
    if (!isValidEmail(clientEmail)) return fail("E-mail du client invalide.", input("clientEmail"));
    if (!isValidDay(issueDate)) return fail("Date du devis invalide.", input("issueDate"));
    if (!isValidDay(validUntil) || validUntil < issueDate) {
        return fail("La validité doit être postérieure à la date du devis.", input("validUntil"));
    }

    if (lineFields.length === 0) return fail("Ajoutez au moins une ligne.");

    const lines: DocumentLine[] = [];

    for (const fields of lineFields) {
        const line = readLine(fields);

        if (!lineIsValid(line)) {
            const target = line.description === "" ? fields.description
                : !(line.quantity > 0) ? fields.quantity
                : fields.price;

            return fail("Ligne incomplète : désignation, quantité > 0 et prix valides.", target);
        }

        lines.push(line);
    }

    const discount = parseNumber(input("quoteDiscount").value);
    const taxRate = parseNumber(input("quoteTax").value);
    const depositPct = parseNumber(input("quoteDeposit").value);
    const subtotal = computeDocumentTotals(lines, 0, 0, 0).subtotal;

    if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) {
        return fail("Remise invalide (entre 0 et le sous-total).", input("quoteDiscount"));
    }

    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
        return fail("TVA invalide (0 à 100 %).", input("quoteTax"));
    }

    if (!Number.isFinite(depositPct) || depositPct < 0 || depositPct > 100) {
        return fail("Acompte invalide (0 à 100 %).", input("quoteDeposit"));
    }

    if (computeDocumentTotals(lines, discount, taxRate, depositPct).total > DOC_LIMITS.totalMax) {
        return fail("Montant total trop élevé.");
    }

    const existing = editingId ? getQuoteById(editingId) : null;
    const now = new Date().toISOString();
    const quote: Quote = {
        id: existing?.id ?? newId(),
        number: existing?.number ?? reserveDocumentNumber("quote", issueDate),
        status: existing?.status ?? "draft",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        issueDate,
        validUntil,
        clientId: clientSelect.value || null,
        clientName,
        clientPhone,
        clientEmail,
        clientAddress: area("clientAddress").value.trim(),
        subject: input("quoteSubject").value.trim(),
        lines,
        discount: Math.round(discount),
        taxRate,
        depositPct,
        deliveryTerms: input("deliveryTerms").value.trim(),
        paymentTerms: input("paymentTerms").value.trim(),
        notes: area("quoteNotes").value.trim(),
        terms: area("quoteTerms").value.trim(),
        invoiceId: existing?.invoiceId ?? null
    };

    if (!saveQuote(quote)) {
        toast("Impossible d'enregistrer le devis.");
        return;
    }

    toast(existing ? "Devis modifié." : `Devis ${quote.number} créé.`);
    openPreview(quote.id);
});

/* =========================================================
   Démarrage
   ========================================================= */

const shop = getShopSettings();
const docSettings = getDocumentSettings();

byId("settingsNotice").hidden = shop.name !== "" && docSettings.address !== "";

renderList();
