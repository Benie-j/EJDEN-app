// src/parametres.ts
// Paramètres : informations de l'entreprise (reçus + tableau de bord)
// et informations de l'utilisateur (salutation seulement, jamais les reçus).
import { DEFAULT_INVOICE_TERMS, DEFAULT_QUOTE_TERMS, SHOP_LIMITS, USER_LIMITS, getDocumentSettings, getShopSettings, getUserProfile, isValidEmail, isValidPhone, saveDocumentSettings, saveShopSettings, saveUserProfile } from "./storage.js";
import { greetingFor } from "./greeting.js";
import { getBackupMeta, resetAllData } from "./backup.js";
import { APP_VERSION, getAllowCredit, getDefaultThreshold, getLanguage, getReduceMotion, getTextSize, getThemeChoice, saveAllowCredit, saveDefaultThreshold, saveLanguage, saveReduceMotion, saveTextSize, saveThemeChoice } from "./preferences.js";
import { preparePhoto } from "./photo.js";
const form = document.querySelector("#shopForm");
const nameInput = document.querySelector("#shopName");
const phoneInput = document.querySelector("#shopPhone");
const firstNameInput = document.querySelector("#userFirstName");
const lastNameInput = document.querySelector("#userLastName");
const userPhoneInput = document.querySelector("#userPhone");
const preview = document.querySelector("#receiptPreview");
const greetingPreview = document.querySelector("#greetingPreview");
const toast = document.querySelector("#settingsToast");
let toastTimer;
function showToast(message) {
    if (!toast) {
        return;
    }
    toast.textContent = message;
    toast.classList.add("is-visible");
    if (toastTimer !== undefined) {
        window.clearTimeout(toastTimer);
    }
    toastTimer = window.setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2500);
}
// Aperçu du reçu : uniquement les informations de l'ENTREPRISE.
function renderReceiptPreview() {
    if (!preview) {
        return;
    }
    const name = nameInput?.value.trim() ?? "";
    const phone = phoneInput?.value.trim() ?? "";
    const lines = [];
    if (name)
        lines.push(name);
    if (phone)
        lines.push(`Tél : ${phone}`);
    if (name || phone)
        lines.push("");
    lines.push("REÇU DE VENTE", "N° A1B2C3", "2 × Riz 5 kg — 7 000 FCFA", "TOTAL : 7 000 FCFA", "", "Merci de votre confiance !");
    preview.textContent = lines.join("\n");
}
// Aperçu de la salutation du tableau de bord.
function renderGreetingPreview() {
    if (!greetingPreview) {
        return;
    }
    const first = firstNameInput?.value.trim() ?? "";
    greetingPreview.textContent = first
        ? `Sur le tableau de bord : « ${greetingFor(new Date())}, ${first} »`
        : "";
}
const shop = getShopSettings();
const user = getUserProfile();
const docs = getDocumentSettings();
/* ---------- Documents (devis, factures) ---------- */
const docField = (id) => document.querySelector(`#${id}`);
const docText = (id) => docField(id)?.value.trim() ?? "";
const setDoc = (id, value) => {
    const node = docField(id);
    if (node)
        node.value = value;
};
let docLogo = docs.logo;
const logoPreview = docField("docLogoPreview");
const logoRemove = docField("docLogoRemove");
function renderLogo() {
    if (logoPreview) {
        logoPreview.hidden = docLogo === null;
        if (docLogo)
            logoPreview.src = docLogo;
    }
    if (logoRemove)
        logoRemove.hidden = docLogo === null;
}
setDoc("docAddress", docs.address);
setDoc("docEmail", docs.email);
setDoc("docWebsite", docs.website);
setDoc("docTaxId", docs.taxId);
setDoc("docRegistry", docs.registry);
setDoc("docPayment", docs.paymentInfo);
setDoc("docTax", docs.defaultTaxRate > 0 ? String(docs.defaultTaxRate) : "");
setDoc("docValidity", String(docs.defaultValidityDays));
setDoc("docTerms", docs.quoteTerms);
setDoc("docDueDays", String(docs.defaultDueDays));
setDoc("docInvoiceTerms", docs.invoiceTerms);
setDoc("docFooter", docs.footer);
renderLogo();
docField("docLogoInput")?.addEventListener("change", async (event) => {
    const fileInput = event.target;
    const file = fileInput.files?.[0];
    if (!file)
        return;
    try {
        docLogo = await preparePhoto(file);
        renderLogo();
    }
    catch {
        showToast("Logo illisible ou trop lourd. Essayez une autre image.");
    }
    fileInput.value = "";
});
logoRemove?.addEventListener("click", () => {
    docLogo = null;
    renderLogo();
});
if (nameInput)
    nameInput.value = shop.name;
if (phoneInput)
    phoneInput.value = shop.phone;
if (firstNameInput)
    firstNameInput.value = user.firstName;
if (lastNameInput)
    lastNameInput.value = user.lastName;
if (userPhoneInput)
    userPhoneInput.value = user.phone;
renderReceiptPreview();
renderGreetingPreview();
nameInput?.addEventListener("input", renderReceiptPreview);
firstNameInput?.addEventListener("input", renderGreetingPreview);
for (const input of [phoneInput, userPhoneInput]) {
    input?.addEventListener("input", () => {
        input.classList.remove("is-invalid");
        renderReceiptPreview();
    });
}
form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const shopName = nameInput?.value.trim() ?? "";
    const shopPhone = phoneInput?.value.trim() ?? "";
    const firstName = firstNameInput?.value.trim() ?? "";
    const lastName = lastNameInput?.value.trim() ?? "";
    const userPhone = userPhoneInput?.value.trim() ?? "";
    if (shopName.length > SHOP_LIMITS.nameMax) {
        showToast(`Nom de l'entreprise trop long (${SHOP_LIMITS.nameMax} caractères max).`);
        nameInput?.focus();
        return;
    }
    if (!isValidPhone(shopPhone)) {
        phoneInput?.classList.add("is-invalid");
        showToast("Téléphone de l'entreprise invalide : chiffres, +, espaces et tirets seulement.");
        phoneInput?.focus();
        return;
    }
    if (firstName.length > USER_LIMITS.nameMax) {
        showToast(`Prénom trop long (${USER_LIMITS.nameMax} caractères max).`);
        firstNameInput?.focus();
        return;
    }
    if (lastName.length > USER_LIMITS.nameMax) {
        showToast(`Nom trop long (${USER_LIMITS.nameMax} caractères max).`);
        lastNameInput?.focus();
        return;
    }
    if (!isValidPhone(userPhone)) {
        userPhoneInput?.classList.add("is-invalid");
        showToast("Votre téléphone est invalide : chiffres, +, espaces et tirets seulement.");
        userPhoneInput?.focus();
        return;
    }
    const docEmail = docText("docEmail");
    const docTax = Number(docText("docTax").replace(",", ".") || "0");
    const docValidity = Number(docText("docValidity") || "30");
    if (!isValidEmail(docEmail)) {
        showToast("E-mail de l'entreprise invalide.");
        docField("docEmail")?.focus();
        return;
    }
    if (!Number.isFinite(docTax) || docTax < 0 || docTax > 100) {
        showToast("TVA par défaut invalide (0 à 100 %).");
        docField("docTax")?.focus();
        return;
    }
    if (!Number.isInteger(docValidity) || docValidity < 1 || docValidity > 365) {
        showToast("Validité d'un devis : entre 1 et 365 jours.");
        docField("docValidity")?.focus();
        return;
    }
    const docDue = Number(docText("docDueDays") || "30");
    if (!Number.isInteger(docDue) || docDue < 0 || docDue > 365) {
        showToast("Délai de paiement : entre 0 et 365 jours.");
        docField("docDueDays")?.focus();
        return;
    }
    // Les enregistrements sont indépendants : un échec est signalé précisément.
    if (!saveShopSettings({ name: shopName, phone: shopPhone })) {
        showToast("Impossible d'enregistrer les informations de l'entreprise.");
        return;
    }
    if (!saveDocumentSettings({
        address: docText("docAddress"),
        email: docEmail,
        website: docText("docWebsite"),
        taxId: docText("docTaxId"),
        registry: docText("docRegistry"),
        paymentInfo: docText("docPayment"),
        logo: docLogo,
        defaultTaxRate: docTax,
        defaultValidityDays: docValidity,
        quoteTerms: docText("docTerms") || DEFAULT_QUOTE_TERMS,
        defaultDueDays: docDue,
        invoiceTerms: docText("docInvoiceTerms") || DEFAULT_INVOICE_TERMS,
        footer: docText("docFooter")
    })) {
        showToast("Entreprise enregistrée, mais pas les réglages des documents.");
        return;
    }
    if (!saveUserProfile({ firstName, lastName, phone: userPhone })) {
        showToast("Entreprise enregistrée, mais pas vos informations personnelles.");
        return;
    }
    showToast("Informations enregistrées.");
});
/* ---------- Apparence, langue, données ---------- */
const themeButtons = document.querySelectorAll("[data-theme-choice]");
function renderTheme() {
    const current = getThemeChoice();
    for (const button of themeButtons) {
        button.setAttribute("aria-checked", String(button.dataset.themeChoice === current));
    }
}
for (const button of themeButtons) {
    button.addEventListener("click", () => {
        const choice = button.dataset.themeChoice;
        if (saveThemeChoice(choice)) {
            renderTheme();
            showToast("Thème enregistré.");
        }
        else {
            showToast("Impossible d'enregistrer le thème.");
        }
    });
}
renderTheme();
const languageSelect = document.querySelector("#languageSelect");
if (languageSelect) {
    languageSelect.value = getLanguage();
    languageSelect.addEventListener("change", () => {
        if (languageSelect.value === "fr") {
            saveLanguage("fr");
            showToast("Langue enregistrée.");
        }
    });
}
const versionNode = document.querySelector("#appVersion");
if (versionNode) {
    versionNode.textContent = `Version ${APP_VERSION}`;
}
const resetControl = document.querySelector("#resetControl");
if (resetControl) {
    const start = document.createElement("button");
    const box = document.createElement("div");
    const question = document.createElement("p");
    const yes = document.createElement("button");
    const no = document.createElement("button");
    start.type = yes.type = no.type = "button";
    start.className = "reset-button";
    yes.className = "reset-yes";
    no.className = "reset-no";
    question.className = "reset-question";
    box.hidden = true;
    start.textContent = "Effacer toutes les données";
    question.textContent =
        "Produits, ventes, clients, finances… tout sera supprimé de cet appareil. Continuer ?";
    yes.textContent = "Oui, tout effacer";
    no.textContent = "Non, garder";
    start.addEventListener("click", () => {
        start.hidden = true;
        box.hidden = false;
    });
    no.addEventListener("click", () => {
        box.hidden = true;
        start.hidden = false;
    });
    yes.addEventListener("click", () => {
        if (!resetAllData()) {
            showToast("Impossible d'effacer les données.");
            return;
        }
        yes.disabled = true;
        showToast("Données effacées.");
        window.setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 1000);
    });
    box.append(question, yes, no);
    resetControl.append(start, box);
}
/* ---------- Navigation par catégories ---------- */
const hubNav = document.querySelector("#hub");
const backLink = document.querySelector("#backLink");
const pageTitle = document.querySelector("#pageTitle");
const pageKicker = document.querySelector("#pageKicker");
const settingsPanels = document.querySelectorAll(".settings-panel");
function showPanelFromHash() {
    const id = window.location.hash.replace("#", "");
    const panel = id === "" ? null : document.getElementById(`panel-${id}`);
    if (hubNav) {
        hubNav.hidden = panel !== null;
    }
    for (const item of settingsPanels) {
        item.hidden = item !== panel;
    }
    if (pageTitle) {
        pageTitle.textContent = panel?.dataset.title ?? "Paramètres";
    }
    if (pageKicker) {
        pageKicker.textContent = panel ? "PARAMÈTRES" : "CONFIGURATION";
    }
    window.scrollTo(0, 0);
}
window.addEventListener("hashchange", showPanelFromHash);
showPanelFromHash();
// Dans une catégorie, la flèche retour ramène à la liste des catégories.
backLink?.addEventListener("click", (event) => {
    if (window.location.hash !== "") {
        event.preventDefault();
        window.history.replaceState(null, "", window.location.pathname);
        showPanelFromHash();
    }
});
/* ---------- Réglages réels : ventes, stock, apparence ---------- */
function bindSwitch(id, read, write, message) {
    const node = document.querySelector(`#${id}`);
    if (!node) {
        return;
    }
    node.setAttribute("aria-checked", String(read()));
    node.addEventListener("click", () => {
        const next = node.getAttribute("aria-checked") !== "true";
        if (write(next)) {
            node.setAttribute("aria-checked", String(next));
            showToast(message);
        }
        else {
            showToast("Impossible d'enregistrer ce réglage.");
        }
    });
}
bindSwitch("allowCreditSwitch", getAllowCredit, saveAllowCredit, "Réglage enregistré.");
bindSwitch("reduceMotionSwitch", getReduceMotion, saveReduceMotion, "Réglage enregistré.");
const sizeButtons = document.querySelectorAll("[data-size-choice]");
function renderTextSize() {
    const current = getTextSize();
    for (const button of sizeButtons) {
        button.setAttribute("aria-checked", String(button.dataset.sizeChoice === current));
    }
}
for (const button of sizeButtons) {
    button.addEventListener("click", () => {
        if (saveTextSize(button.dataset.sizeChoice)) {
            renderTextSize();
            showToast("Taille du texte enregistrée.");
        }
        else {
            showToast("Impossible d'enregistrer ce réglage.");
        }
    });
}
renderTextSize();
const thresholdInput = document.querySelector("#defaultThreshold");
if (thresholdInput) {
    thresholdInput.value = getDefaultThreshold() > 0 ? String(getDefaultThreshold()) : "";
    thresholdInput.addEventListener("change", () => {
        const raw = thresholdInput.value.trim();
        const value = raw === "" ? 0 : Number(raw);
        if (saveDefaultThreshold(value)) {
            showToast("Seuil enregistré.");
        }
        else {
            showToast("Seuil invalide : entrez un nombre entier.");
            thresholdInput.value = getDefaultThreshold() > 0 ? String(getDefaultThreshold()) : "";
        }
    });
}
/* ---------- Équipe et sauvegarde : informations réelles ---------- */
const teamSelf = document.querySelector("#teamSelf");
if (teamSelf) {
    const profile = getUserProfile();
    const name = `${profile.firstName} ${profile.lastName}`.trim();
    teamSelf.textContent = name === "" ? "Vous" : name;
}
function dateLabel(iso) {
    return iso === null
        ? "Jamais"
        : new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}
const lastFileNode = document.querySelector("#lastFileBackup");
const lastDriveNode = document.querySelector("#lastDriveBackup");
const backupMeta = getBackupMeta();
if (lastFileNode)
    lastFileNode.textContent = dateLabel(backupMeta.lastFile);
if (lastDriveNode)
    lastDriveNode.textContent = dateLabel(backupMeta.lastDrive);
//# sourceMappingURL=parametres.js.map