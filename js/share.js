// src/share.ts
// Partage de documents (devis, factures, reçus) sous forme de texte clair :
// menu de partage du téléphone, sinon WhatsApp, sinon copie dans le presse-papiers.
import { formatDay } from "./document-view.js";
function fcfa(value) {
    return `${Math.round(value).toLocaleString("fr-FR")} FCFA`;
}
/** Texte lisible dans WhatsApp / SMS / e-mail. */
export function documentToText(doc, shop) {
    const out = [];
    const t = doc.totals;
    if (shop.name)
        out.push(`*${shop.name}*`);
    if (shop.phone)
        out.push(`Tél : ${shop.phone}`);
    if (shop.name || shop.phone)
        out.push("");
    out.push(`*${doc.title} N° ${doc.number}*`, `Date : ${formatDay(doc.issueDate)}`);
    if (doc.dueLabel && doc.dueDate)
        out.push(`${doc.dueLabel} : ${formatDay(doc.dueDate)}`);
    out.push("", `${doc.party.label} : ${doc.party.name}`);
    if (doc.subject)
        out.push(`Objet : ${doc.subject}`);
    out.push("");
    doc.lines.forEach((line, index) => {
        const qty = line.unit ? `${line.quantity} ${line.unit}` : `${line.quantity}`;
        const total = Math.round(line.quantity * line.unitPrice * (1 - line.discountPct / 100));
        out.push(`${index + 1}. ${line.description}`, `    ${qty} × ${fcfa(line.unitPrice)} = ${fcfa(total)}`);
    });
    out.push("");
    if (t.discount > 0)
        out.push(`Remise : − ${fcfa(t.discount)}`);
    if (doc.taxRate > 0)
        out.push(`Total HT : ${fcfa(t.net)}`, `TVA (${doc.taxRate} %) : ${fcfa(t.tax)}`);
    out.push(`*TOTAL${doc.taxRate > 0 ? " TTC" : ""} : ${fcfa(t.total)}*`);
    if (doc.depositPct > 0) {
        out.push(`${doc.depositLabel} (${doc.depositPct} %) : ${fcfa(t.deposit)}`, `Reste à payer : ${fcfa(t.balance)}`);
    }
    for (const payment of doc.payments) {
        out.push(`Payé le ${formatDay(payment.date)} (${payment.label}) : ${fcfa(payment.amount)}`);
    }
    if (doc.balanceDue !== null) {
        out.push(doc.balanceDue === 0 ? "*Solde : 0 FCFA — réglée*" : `*Reste à payer : ${fcfa(doc.balanceDue)}*`);
    }
    for (const block of doc.blocks) {
        if (block.text.trim() !== "")
            out.push("", `_${block.title}_`, block.text.trim());
    }
    out.push("", "Merci de votre confiance.");
    return out.join("\n");
}
/** Retourne un message à afficher à l'utilisateur, ou null si rien à dire. */
export async function shareText(title, text) {
    if (typeof navigator.share === "function") {
        try {
            await navigator.share({ title, text });
            return null;
        }
        catch (error) {
            // Menu fermé par l'utilisateur : rien à faire.
            if (error instanceof DOMException && error.name === "AbortError")
                return null;
        }
    }
    try {
        await navigator.clipboard.writeText(text);
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
        return "Texte copié. WhatsApp s'ouvre pour l'envoi.";
    }
    catch {
        const opened = window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
        return opened ? null : "Impossible de partager sur cet appareil.";
    }
}
export async function shareDocument(doc, shop) {
    return shareText(`${doc.title} ${doc.number}`, documentToText(doc, shop));
}
//# sourceMappingURL=share.js.map