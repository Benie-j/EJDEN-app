// src/ticket.ts
// Ticket de caisse pour imprimante thermique (80 mm ou 58 mm).
// Le ticket est construit hors écran puis imprimé seul (voir css/ticket.css).
// Tout texte venant des données passe par textContent.

import {
    type PaymentMethod,
    type Sale,
    getDocumentSettings,
    getRemainingMap,
    getShopSettings
} from "./storage.js";
import { el } from "./ui.js";

export type TicketWidth = 80 | 58;

const METHOD_LABELS: Record<PaymentMethod, string> = {
    cash: "Espèces",
    mobile_money: "Mobile Money",
    card: "Carte",
    other: "Autre",
    credit: "Crédit"
};

function plain(value: number): string {
    return Math.round(value).toLocaleString("fr-FR");
}

function row(label: string, value: string, className = ""): HTMLElement {
    const node = el("div", `tk-row ${className}`.trim());

    node.append(el("span", undefined, label), el("span", "tk-val", value));

    return node;
}

function center(text: string, className = ""): HTMLElement {
    return el("p", `tk-center ${className}`.trim(), text);
}

export function buildTicket(sale: Sale, width: TicketWidth): HTMLElement {
    const shop = getShopSettings();
    const settings = getDocumentSettings();
    const date = new Date(sale.createdAt);
    const sheet = el("section", `tk-sheet is-${width}`);

    /* En-tête boutique */
    sheet.append(center(shop.name || "Boutique", "tk-shop"));

    if (settings.address) {
        for (const line of settings.address.split("\n")) {
            if (line.trim() !== "") sheet.append(center(line.trim()));
        }
    }

    if (shop.phone) sheet.append(center(`Tél : ${shop.phone}`));
    if (settings.taxId) sheet.append(center(`NIF / IFU : ${settings.taxId}`));

    sheet.append(el("hr", "tk-rule"));

    /* Référence */
    sheet.append(center("TICKET DE VENTE", "tk-title"));
    sheet.append(row("N°", sale.id.slice(-6).toUpperCase()));
    sheet.append(
        row(
            "Date",
            `${date.toLocaleDateString("fr-FR")} ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
        )
    );

    if (sale.borrowerName) sheet.append(row("Client", sale.borrowerName));

    if (sale.cancelledAt) sheet.append(center("*** VENTE ANNULÉE ***", "tk-title"));

    sheet.append(el("hr", "tk-rule"));

    /* Articles : désignation puis « qté × prix  total » */
    for (const item of sale.items) {
        sheet.append(el("p", "tk-item", item.productName));
        sheet.append(row(`${item.quantity} × ${plain(item.unitPrice)}`, plain(item.total)));
    }

    sheet.append(el("hr", "tk-rule"));

    /* Totaux */
    if (sale.discount > 0) {
        sheet.append(row("Sous-total", plain(sale.subtotal)));
        sheet.append(row("Remise", `− ${plain(sale.discount)}`));
    }

    sheet.append(row("TOTAL FCFA", plain(sale.total), "tk-total"));
    sheet.append(el("hr", "tk-rule is-dashed"));
    sheet.append(row("Paiement", METHOD_LABELS[sale.paymentMethod]));
    sheet.append(row("Payé", plain(sale.amountPaid)));

    if (sale.change > 0) sheet.append(row("Monnaie rendue", plain(sale.change)));

    const remainingNow = getRemainingMap([sale]).get(sale.id) ?? 0;

    if (remainingNow > 0) {
        sheet.append(row("RESTE À PAYER", plain(remainingNow), "tk-total"));
    } else if (sale.remaining > 0) {
        sheet.append(center("Crédit soldé"));
    }

    sheet.append(el("hr", "tk-rule"));

    /* Pied */
    const count = sale.items.reduce((sum, item) => sum + item.quantity, 0);

    sheet.append(center(`${count} article${count > 1 ? "s" : ""}`));

    const footer = settings.footer.trim() !== "" ? settings.footer : "Merci de votre visite !";

    for (const line of footer.split("\n")) {
        if (line.trim() !== "") sheet.append(center(line.trim(), "tk-thanks"));
    }

    // Marge de coupe pour l'imprimante.
    sheet.append(el("div", "tk-cut"));

    return sheet;
}

/** Imprime le ticket seul (le reste de la page est masqué à l'impression). */
export function printTicket(sale: Sale, width: TicketWidth): void {
    document.querySelector(".tk-host")?.remove();

    const host = el("div", `tk-host is-${width}`);
    const cleanup = (): void => {
        host.remove();
        document.body.classList.remove("printing-ticket");
        window.removeEventListener("afterprint", cleanup);
    };

    host.append(buildTicket(sale, width));
    document.body.append(host);
    document.body.classList.add("printing-ticket");
    window.addEventListener("afterprint", cleanup);

    // Laisse le navigateur appliquer la mise en page avant d'ouvrir l'impression.
    window.setTimeout(() => window.print(), 50);
}
