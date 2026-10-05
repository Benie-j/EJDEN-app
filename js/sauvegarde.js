// src/sauvegarde.ts
// Page Sauvegarde : Google Drive d'abord, puis fichier.
// Textes via textContent (jamais innerHTML).
import { CLIENT_ID_PATTERN, applyBackup, backupFileName, createBackup, getBackupMeta, parseBackup, saveBackupMeta } from "./backup.js";
import { DriveError, downloadBackup, forgetGoogleToken, loadGoogleScript, uploadBackup } from "./google-drive.js";
import { createToast } from "./ui.js";
function $(selector) {
    const node = document.querySelector(selector);
    if (!node) {
        throw new Error(`EJDEN : ${selector} est introuvable.`);
    }
    return node;
}
const toast = createToast();
const driveStatus = $("#driveStatus");
const driveUpload = $("#driveUpload");
const driveRestore = $("#driveRestore");
const driveConfig = $("#driveConfig");
const clientInput = $("#clientId");
const fileInput = $("#fileInput");
const restorePanel = $("#restorePanel");
// Sauvegarde en attente de confirmation.
let pending = null;
function formatDate(iso) {
    if (iso === null) {
        return "Jamais";
    }
    const date = new Date(iso);
    return `${date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })} à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}
function renderMeta() {
    const meta = getBackupMeta();
    $("#lastDrive").textContent = formatDate(meta.lastDrive);
    $("#lastFile").textContent = formatDate(meta.lastFile);
    clientInput.value = meta.clientId;
    const configured = meta.clientId !== "";
    driveUpload.disabled = !configured;
    driveRestore.disabled = !configured;
    if (!configured) {
        driveConfig.open = true;
        setStatus("Renseignez l'identifiant client Google pour activer Drive.");
    }
}
function setStatus(message) {
    driveStatus.textContent = message;
}
function setBusy(busy) {
    const configured = getBackupMeta().clientId !== "";
    driveUpload.disabled = busy || !configured;
    driveRestore.disabled = busy || !configured;
}
function errorMessage(error) {
    return error instanceof DriveError ? error.message : "Une erreur est survenue.";
}
function summaryText(summary, createdAt) {
    const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;
    return `Sauvegarde du ${formatDate(createdAt)} : ${plural(summary.products, "produit")}, ${plural(summary.sales, "vente")}, ${plural(summary.clients, "client")}.`;
}
function proposeRestore(text) {
    const result = parseBackup(text);
    if (!result.ok) {
        toast(result.error);
        return;
    }
    pending = result.backup;
    $("#restoreInfo").textContent = summaryText(result.summary, result.backup.createdAt);
    restorePanel.hidden = false;
    restorePanel.scrollIntoView({ behavior: "smooth", block: "center" });
}
function closeRestore() {
    pending = null;
    restorePanel.hidden = true;
}
/* ---------- Google Drive ---------- */
const initialClientId = getBackupMeta().clientId;
if (initialClientId !== "") {
    // Chargé tôt : la fenêtre de connexion doit s'ouvrir au clic sans délai.
    loadGoogleScript().catch(() => setStatus("Google est inaccessible pour le moment."));
}
$("#clientSave").addEventListener("click", () => {
    const value = clientInput.value.trim();
    if (!CLIENT_ID_PATTERN.test(value)) {
        toast("Identifiant invalide (il se termine par .apps.googleusercontent.com).");
        return;
    }
    forgetGoogleToken();
    if (!saveBackupMeta({ clientId: value })) {
        toast("Impossible d'enregistrer.");
        return;
    }
    loadGoogleScript().catch(() => setStatus("Google est inaccessible pour le moment."));
    driveConfig.open = false;
    setStatus("");
    renderMeta();
    toast("Configuration enregistrée.");
});
driveUpload.addEventListener("click", async () => {
    const { clientId } = getBackupMeta();
    setBusy(true);
    setStatus("Envoi vers Google Drive…");
    try {
        await loadGoogleScript();
        const backup = createBackup();
        await uploadBackup(clientId, JSON.stringify(backup));
        saveBackupMeta({ lastDrive: backup.createdAt });
        setStatus("Sauvegarde envoyée sur Google Drive.");
        toast("Sauvegarde Drive terminée.");
    }
    catch (error) {
        setStatus(errorMessage(error));
    }
    finally {
        setBusy(false);
        renderMeta();
    }
});
driveRestore.addEventListener("click", async () => {
    const { clientId } = getBackupMeta();
    setBusy(true);
    setStatus("Recherche de la sauvegarde…");
    try {
        await loadGoogleScript();
        const text = await downloadBackup(clientId);
        if (text === null) {
            setStatus("Aucune sauvegarde trouvée sur ce compte Google.");
        }
        else {
            setStatus("");
            proposeRestore(text);
        }
    }
    catch (error) {
        setStatus(errorMessage(error));
    }
    finally {
        setBusy(false);
    }
});
/* ---------- Fichier ---------- */
$("#fileExport").addEventListener("click", async () => {
    const backup = createBackup();
    const name = backupFileName();
    const file = new File([JSON.stringify(backup)], name, { type: "application/json" });
    try {
        if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: "Sauvegarde EJDEN" });
        }
        else {
            const url = URL.createObjectURL(file);
            const link = document.createElement("a");
            link.href = url;
            link.download = name;
            document.body.append(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
        }
        saveBackupMeta({ lastFile: backup.createdAt });
        renderMeta();
        toast("Sauvegarde prête.");
    }
    catch (error) {
        // Fermer le menu de partage n'est pas une erreur.
        if (!(error instanceof DOMException && error.name === "AbortError")) {
            toast("Impossible de créer le fichier.");
        }
    }
});
$("#fileImport").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) {
        return;
    }
    if (file.size > 25_000_000) {
        toast("Fichier trop volumineux.");
        return;
    }
    proposeRestore(await file.text());
});
/* ---------- Confirmation ---------- */
$("#restoreCancel").addEventListener("click", closeRestore);
$("#restoreConfirm").addEventListener("click", () => {
    if (pending === null) {
        return;
    }
    if (!applyBackup(pending)) {
        toast("Restauration impossible : l'état précédent a été conservé.");
        closeRestore();
        return;
    }
    closeRestore();
    toast("Données restaurées.");
    window.setTimeout(() => {
        window.location.href = "dashboard.html";
    }, 1200);
});
renderMeta();
//# sourceMappingURL=sauvegarde.js.map