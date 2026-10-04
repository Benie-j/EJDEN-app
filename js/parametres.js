// src/parametres.ts
// Paramètres : informations de l'entreprise (reçus + tableau de bord)
// et informations de l'utilisateur (salutation seulement, jamais les reçus).
import { SHOP_LIMITS, USER_LIMITS, getShopSettings, getUserProfile, isValidPhone, saveShopSettings, saveUserProfile } from "./storage.js";
import { greetingFor } from "./greeting.js";
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
    // Les deux enregistrements sont indépendants : un échec est signalé précisément.
    if (!saveShopSettings({ name: shopName, phone: shopPhone })) {
        showToast("Impossible d'enregistrer les informations de l'entreprise.");
        return;
    }
    if (!saveUserProfile({ firstName, lastName, phone: userPhone })) {
        showToast("Entreprise enregistrée, mais pas vos informations personnelles.");
        return;
    }
    showToast("Informations enregistrées.");
});
//# sourceMappingURL=parametres.js.map