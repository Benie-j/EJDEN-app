// src/recus.ts
// Page Reçus : un reçu par paiement de facture, aperçu imprimable.
// Tout texte venant des données passe par textContent (jamais innerHTML).

import {
    type Receipt,
    getDocumentSettings,
    getReceiptByKey,
    getReceipts,
    getShopSettings
} from "./storage.js";
import { shareDocument } from "./share.js";
import { type PrintableDocument, printPage, renderDocument } from "./document-view.js";
import { CREDIT_METHOD_LABELS } from "./credit-ui.js";
import { createToast, el, money, shortDateLabel } from "./ui.js";

function byId<T extends HTMLElement>(id: string): T {
    const node = document.getElementById(id);

    if (!node) {
        throw new Error(`EJDEN : élément #${id} introuvable.`);
    }

    return node as T;
}

const toast = createToast();
const screens = { list: byId("listScreen"), preview: byId("previewScreen") };

type ScreenName = keyof typeof screens;

let currentScreen: ScreenName = "list";
let searchQuery = "";

let currentDoc: PrintableDocument | null = null;

byId("shareReceiptButton").addEventListener("click", () => {
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

    byId("pageTitle").textContent = name === "preview" ? "Reçu" : "Reçus";
    window.scrollTo(0, 0);
}

byId("backButton").addEventListener("click", (event) => {
    if (currentScreen !== "list") {
        event.preventDefault();
        showList();
    }
});

function renderList(): void {
    const all = getReceipts();
    const query = searchQuery.trim().toLowerCase();
    const visible = all.filter(
        (receipt) =>
            query === "" ||
            receipt.number.toLowerCase().includes(query) ||
            receipt.invoice.number.toLowerCase().includes(query) ||
            receipt.invoice.clientName.toLowerCase().includes(query)
    );
    const listNode = byId("receiptsList");
    const total = all.reduce((sum, receipt) => sum + receipt.payment.amount, 0);

    byId("summaryTotal").textContent = money(total);
    byId("summaryCount").textContent = `${all.length} reçu${all.length > 1 ? "s" : ""}`;
    listNode.replaceChildren();
    byId("receiptsEmpty").hidden = visible.length > 0;

    if (visible.length === 0) {
        byId("receiptsEmptyTitle").textContent = all.length === 0 ? "Aucun reçu" : "Aucun résultat";
        byId("receiptsEmptyText").textContent =
            all.length === 0
                ? "Enregistrez un paiement sur une facture émise pour créer un reçu."
                : "Aucun reçu ne correspond à cette recherche.";
        return;
    }

    for (const receipt of visible) {
        const row = el("button", "quote-row");
        const main = el("div", "quote-row-main");
        const side = el("div", "quote-row-side");

        row.type = "button";
        main.append(
            el("strong", undefined, receipt.invoice.clientName),
            el(
                "span",
                undefined,
                `${receipt.number} · ${shortDateLabel(new Date(`${receipt.payment.date}T12:00:00`))}`
            )
        );
        side.append(
            el("strong", undefined, money(receipt.payment.amount)),
            el("span", undefined, CREDIT_METHOD_LABELS[receipt.payment.method])
        );
        row.append(main, side);
        row.addEventListener("click", () => openPreview(receipt.key));
        listNode.append(row);
    }
}

function showList(): void {
    renderList();
    showScreen("list");
}

byId<HTMLInputElement>("searchInput").addEventListener("input", (event) => {
    searchQuery = (event.target as HTMLInputElement).value;
    renderList();
});

function receiptToDocument(receipt: Receipt): PrintableDocument {
    const { invoice, payment } = receipt;
    const amount = payment.amount;

    return {
        title: "REÇU",
        number: receipt.number,
        issueDate: payment.date,
        dueLabel: null,
        dueDate: null,
        stamp: receipt.remainingAfter === 0 ? "SOLDÉ" : "ACOMPTE",
        party: {
            label: "Reçu de",
            name: invoice.clientName,
            phone: invoice.clientPhone,
            email: invoice.clientEmail,
            address: invoice.clientAddress
        },
        subject: `Paiement de la facture n° ${invoice.number}`,
        lines: [
            {
                productId: null,
                description: invoice.subject
                    ? `Paiement facture ${invoice.number} — ${invoice.subject}`
                    : `Paiement facture ${invoice.number}`,
                unit: "",
                quantity: 1,
                unitPrice: amount,
                discountPct: 0
            }
        ],
        taxRate: 0,
        depositPct: 0,
        depositLabel: "",
        totals: { subtotal: amount, discount: 0, net: amount, tax: 0, total: amount, deposit: 0, balance: amount },
        blocks: [
            { title: "Mode de paiement", text: CREDIT_METHOD_LABELS[payment.method] },
            { title: "Référence", text: payment.note },
            {
                title: "Situation de la facture",
                text:
                    receipt.remainingAfter === 0
                        ? `Facture n° ${invoice.number} entièrement réglée.`
                        : `Reste à payer sur la facture n° ${invoice.number} : ${money(receipt.remainingAfter)}.`
            }
        ],
        payments: [],
        balanceDue: null,
        amountInWordsLead: "Reçu la somme de",
        signatures: ["Signature du client", "Cachet et signature"]
    };
}

function openPreview(key: string): void {
    const receipt = getReceiptByKey(key);

    if (!receipt) {
        toast("Reçu introuvable.");
        showList();
        return;
    }

    currentDoc = receiptToDocument(receipt);
    byId("docWrap").replaceChildren(renderDocument(currentDoc, getShopSettings(), getDocumentSettings()));
    byId<HTMLAnchorElement>("invoiceLink").href = `factures.html?open=${encodeURIComponent(receipt.invoice.id)}`;
    showScreen("preview");
}

byId("printReceiptButton").addEventListener("click", printPage);

const shop = getShopSettings();

byId("settingsNotice").hidden = shop.name !== "" && getDocumentSettings().address !== "";

const openParam = new URLSearchParams(window.location.search).get("open");

if (openParam && getReceiptByKey(openParam)) {
    openPreview(openParam);
} else {
    renderList();
}

