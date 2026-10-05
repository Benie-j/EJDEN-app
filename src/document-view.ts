// src/document-view.ts
// Rendu d'un document commercial (devis, plus tard factures et reçus)
// sous forme de feuille A4 imprimable. Tout texte venant des données
// passe par textContent (jamais innerHTML).

import {
    type DocumentLine,
    type DocumentTotals,
    type DocumentSettings,
    type ShopSettings,
    documentLineTotal
} from "./storage.js";
import { el } from "./ui.js";

export interface DocumentParty {
    // Ex. « Destinataire », « Client ».
    label: string;
    name: string;
    phone: string;
    email: string;
    address: string;
}

export interface DocumentPayment {
    date: string;
    label: string;
    amount: number;
}

export interface DocumentBlock {
    title: string;
    text: string;
}

/** Tout ce qu'il faut pour dessiner un document. Factures et reçus fourniront le même objet. */
export interface PrintableDocument {
    // Titre en capitales : « DEVIS », « FACTURE », « REÇU ».
    title: string;
    number: string;
    issueDate: string;
    // Ex. « Valable jusqu'au » ou « Échéance ».
    dueLabel: string | null;
    dueDate: string | null;
    // Tampon facultatif (ex. « ACCEPTÉ »).
    stamp: string | null;
    party: DocumentParty;
    subject: string;
    lines: readonly DocumentLine[];
    taxRate: number;
    depositPct: number;
    depositLabel: string;
    totals: DocumentTotals;
    blocks: readonly DocumentBlock[];
    // Paiements déjà reçus (factures). Vide pour un devis.
    payments: readonly DocumentPayment[];
    // Solde restant dû après paiements (factures) ; null = non affiché.
    balanceDue: number | null;
    // Mention « Arrêté … à la somme de » placée sous les totaux.
    amountInWordsLead: string;
    // Cadres de signature : [client, entreprise]. null = aucun.
    signatures: readonly [string, string] | null;
}

/* ---------- Montant en lettres ---------- */

const UNITS = [
    "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
    "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"
];
const TENS = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];

function belowHundred(n: number, final: boolean): string {
    if (n < 17) return UNITS[n];
    if (n < 20) return `dix-${UNITS[n - 10]}`;

    if (n < 70) {
        const tens = Math.floor(n / 10);
        const unit = n % 10;

        if (unit === 0) return TENS[tens];
        if (unit === 1) return `${TENS[tens]} et un`;

        return `${TENS[tens]}-${UNITS[unit]}`;
    }

    if (n < 80) {
        return n === 71 ? "soixante et onze" : `soixante-${belowHundred(n - 60, false)}`;
    }

    if (n === 80) return final ? "quatre-vingts" : "quatre-vingt";

    return `quatre-vingt-${belowHundred(n - 80, false)}`;
}

function belowThousand(n: number, final: boolean): string {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    let text = "";

    if (hundreds > 0) {
        text = hundreds === 1 ? "cent" : `${UNITS[hundreds]} cent`;

        if (rest === 0 && final && hundreds > 1) text += "s";
    }

    if (rest > 0) text += (text ? " " : "") + belowHundred(rest, final);

    return text;
}

/** 1 250 000 → « un million deux cent cinquante mille » */
export function numberToFrench(value: number): string {
    const n = Math.round(value);

    if (!Number.isFinite(n) || n < 0 || n > 999_999_999_999) return "";
    if (n === 0) return "zéro";

    const billions = Math.floor(n / 1e9);
    const millions = Math.floor(n / 1e6) % 1000;
    const thousands = Math.floor(n / 1e3) % 1000;
    const rest = n % 1000;
    const parts: string[] = [];

    if (billions) parts.push(`${belowThousand(billions, true)} milliard${billions > 1 ? "s" : ""}`);
    if (millions) parts.push(`${belowThousand(millions, true)} million${millions > 1 ? "s" : ""}`);
    if (thousands) parts.push(thousands === 1 ? "mille" : `${belowThousand(thousands, false)} mille`);
    if (rest) parts.push(belowThousand(rest, true));

    return parts.join(" ");
}

export function amountInWords(amount: number): string {
    const words = numberToFrench(amount);

    if (words === "") return "";

    const plural = Math.round(amount) > 1 ? "francs CFA" : "franc CFA";

    return `${words.charAt(0).toUpperCase()}${words.slice(1)} ${plural}`;
}

/* ---------- Formats ---------- */

function plainMoney(value: number): string {
    return Math.round(value).toLocaleString("fr-FR");
}

function formatQuantity(value: number): string {
    return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

export function formatDay(day: string): string {
    const [year, month, date] = day.split("-").map(Number);

    return new Date(year, month - 1, date).toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });
}

function percent(value: number): string {
    return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
}

/* ---------- Rendu ---------- */

function textLines(parent: HTMLElement, className: string, text: string): void {
    for (const line of text.split("\n")) {
        if (line.trim() !== "") parent.append(el("p", className, line));
    }
}

function totalRow(label: string, value: string, className = ""): HTMLElement {
    const row = el("div", `doc-total-row ${className}`.trim());

    row.append(el("span", undefined, label), el("strong", undefined, value));

    return row;
}

export function renderDocument(
    doc: PrintableDocument,
    shop: ShopSettings,
    settings: DocumentSettings
): HTMLElement {
    const sheet = el("article", "doc-sheet");

    /* En-tête : entreprise à gauche, titre à droite */
    const head = el("header", "doc-head");
    const company = el("div", "doc-company");

    if (settings.logo) {
        const logo = el("img", "doc-logo");

        logo.src = settings.logo;
        logo.alt = "";
        company.append(logo);
    }

    company.append(el("h2", "doc-company-name", shop.name || "Nom de l'entreprise"));

    if (settings.address) textLines(company, "doc-line", settings.address);
    if (shop.phone) company.append(el("p", "doc-line", `Tél : ${shop.phone}`));
    if (settings.email) company.append(el("p", "doc-line", settings.email));
    if (settings.website) company.append(el("p", "doc-line", settings.website));
    if (settings.taxId) company.append(el("p", "doc-line", `NIF / IFU : ${settings.taxId}`));
    if (settings.registry) company.append(el("p", "doc-line", `RCCM : ${settings.registry}`));

    const meta = el("div", "doc-meta");

    meta.append(el("h1", "doc-title", doc.title));
    meta.append(el("p", "doc-number", `N° ${doc.number}`));
    meta.append(el("p", "doc-line", `Date : ${formatDay(doc.issueDate)}`));

    if (doc.dueLabel && doc.dueDate) {
        meta.append(el("p", "doc-line", `${doc.dueLabel} : ${formatDay(doc.dueDate)}`));
    }

    if (doc.stamp) meta.append(el("p", "doc-stamp", doc.stamp));

    head.append(company, meta);

    /* Destinataire */
    const party = el("section", "doc-party");

    party.append(el("span", "doc-party-label", doc.party.label));
    party.append(el("strong", "doc-party-name", doc.party.name));

    if (doc.party.address) textLines(party, "doc-line", doc.party.address);
    if (doc.party.phone) party.append(el("p", "doc-line", `Tél : ${doc.party.phone}`));
    if (doc.party.email) party.append(el("p", "doc-line", doc.party.email));

    sheet.append(head, party);

    if (doc.subject) {
        const subject = el("p", "doc-subject");

        subject.append(el("strong", undefined, "Objet : "), document.createTextNode(doc.subject));
        sheet.append(subject);
    }

    /* Tableau des lignes */
    const showDiscount = doc.lines.some((line) => line.discountPct > 0);
    const table = el("table", "doc-table");
    const headRow = el("tr");
    const headings = ["N°", "Désignation", "Qté", "Prix unitaire"];

    if (showDiscount) headings.push("Remise");

    headings.push("Montant");

    headings.forEach((label, index) => {
        const cell = el("th", index >= 2 ? "is-num" : undefined, label);

        headRow.append(cell);
    });

    const thead = el("thead");

    thead.append(headRow);
    table.append(thead);

    const body = el("tbody");

    doc.lines.forEach((line, index) => {
        const row = el("tr");
        const quantity = line.unit
            ? `${formatQuantity(line.quantity)} ${line.unit}`
            : formatQuantity(line.quantity);

        const cell = (label: string, text: string, className = "is-num"): HTMLElement => {
            const td = el("td", className, text);

            // Étiquette affichée seulement sur petit écran (voir document.css).
            td.dataset.label = label;

            return td;
        };

        row.append(
            cell("N°", String(index + 1), "doc-index"),
            el("td", "doc-desc", line.description),
            cell("Qté", quantity),
            cell("Prix unitaire", plainMoney(line.unitPrice))
        );

        if (showDiscount) {
            row.append(cell("Remise", line.discountPct > 0 ? percent(line.discountPct) : "—"));
        }

        row.append(cell("Montant", plainMoney(documentLineTotal(line)), "is-num is-amount"));
        body.append(row);
    });

    table.append(body);
    sheet.append(table);

    /* Totaux */
    const totals = el("section", "doc-totals");
    const t = doc.totals;
    const hasTax = doc.taxRate > 0;

    totals.append(totalRow(hasTax || t.discount > 0 ? "Sous-total" : "Total", `${plainMoney(t.subtotal)} FCFA`, hasTax || t.discount > 0 ? "" : "is-grand"));

    if (t.discount > 0) totals.append(totalRow("Remise", `− ${plainMoney(t.discount)} FCFA`));

    if (hasTax) {
        totals.append(totalRow("Total HT", `${plainMoney(t.net)} FCFA`));
        totals.append(totalRow(`TVA (${percent(doc.taxRate)})`, `${plainMoney(t.tax)} FCFA`));
        totals.append(totalRow("Total TTC", `${plainMoney(t.total)} FCFA`, "is-grand"));
    } else if (t.discount > 0) {
        totals.append(totalRow("Total net à payer", `${plainMoney(t.total)} FCFA`, "is-grand"));
    }

    if (doc.depositPct > 0) {
        totals.append(totalRow(`${doc.depositLabel} (${percent(doc.depositPct)})`, `${plainMoney(t.deposit)} FCFA`));
        totals.append(totalRow("Reste à payer", `${plainMoney(t.balance)} FCFA`));
    }

    for (const payment of doc.payments) {
        totals.append(totalRow(`Payé le ${formatDay(payment.date)} (${payment.label})`, `− ${plainMoney(payment.amount)} FCFA`));
    }

    if (doc.balanceDue !== null) {
        totals.append(totalRow(doc.balanceDue === 0 ? "Solde" : "Reste à payer", `${plainMoney(doc.balanceDue)} FCFA`, "is-balance"));
    }

    sheet.append(totals);

    if (!hasTax) {
        sheet.append(el("p", "doc-small", "TVA non applicable."));
    }

    const words = amountInWords(t.total);

    if (words) {
        const line = el("p", "doc-words");

        line.append(document.createTextNode(`${doc.amountInWordsLead} `), el("strong", undefined, words), document.createTextNode("."));
        sheet.append(line);
    }

    /* Conditions, modalités, notes : une grille de blocs titrés */
    const blocks = el("div", "doc-blocks");

    for (const block of doc.blocks) {
        if (block.text.trim() === "") continue;

        const section = el("section", "doc-block");

        section.append(el("h3", undefined, block.title));
        textLines(section, "doc-line", block.text);
        blocks.append(section);
    }

    if (blocks.childElementCount > 0) sheet.append(blocks);

    /* Signatures */
    if (doc.signatures) {
        const signatures = el("section", "doc-signatures");

        for (const label of doc.signatures) {
            const box = el("div", "doc-signature");

            box.append(el("span", undefined, label), el("div", "doc-signature-space"));
            signatures.append(box);
        }

        sheet.append(signatures);
    }

    if (settings.footer.trim() !== "") {
        const footer = el("footer", "doc-footer");

        textLines(footer, "doc-footer-line", settings.footer);
        sheet.append(footer);
    }

    return sheet;
}

/** Ouvre la fenêtre d'impression (ou « Enregistrer en PDF »). */
export function printPage(): void {
    window.print();
}
