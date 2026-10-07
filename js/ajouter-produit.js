import { getProducts, addProduct, resolveCategory, newId } from "./storage.js";
import { setupCategoryField } from "./category-field.js";
import { setupBarcodeScanner } from "./barcode-field.js";
import { preparePhoto } from "./photo.js";
import { captureProductPhoto } from "./photo-capture.js";
import { getDefaultThreshold } from "./preferences.js";
/* =========================================================
   Éléments du formulaire
   ========================================================= */
const form = document.querySelector("#productForm");
const productName = document.querySelector("#productName");
const productCategory = document.querySelector("#productCategory");
const productPhoto = document.querySelector("#productPhoto");
const photoPreview = document.querySelector("#photoPreview");
const photoTitle = document.querySelector("#photoTitle");
const photoDescription = document.querySelector("#photoDescription");
const purchasePrice = document.querySelector("#purchasePrice");
const salePrice = document.querySelector("#salePrice");
// L'identifiant dans le HTML est "initialStock" (et non "stock").
const initialStock = document.querySelector("#initialStock");
const stockThreshold = document.querySelector("#stockThreshold");
// Seuil d'alerte proposé par défaut (Paramètres > Produits & stock).
if (stockThreshold && stockThreshold.value === "" && getDefaultThreshold() > 0) {
    stockThreshold.value = String(getDefaultThreshold());
}
const barcode = document.querySelector("#barcode");
const scanBarcode = document.querySelector("#scanBarcode");
const notification = document.querySelector("#notification");
/* =========================================================
   Notification
   ========================================================= */
let notificationTimer;
function showNotification(message) {
    if (!notification) {
        return;
    }
    notification.textContent = message;
    notification.classList.add("show");
    if (notificationTimer !== undefined) {
        window.clearTimeout(notificationTimer);
    }
    notificationTimer = window.setTimeout(() => {
        notification.classList.remove("show");
    }, 2500);
}
/* =========================================================
   Photo (réduction de taille : voir photo.ts)
   ========================================================= */
let photoData = null;
async function selectProductPhoto() {
    try {
        const file = await captureProductPhoto();
        if (!file) {
            return;
        }
        photoData = await preparePhoto(file);
        if (photoPreview) {
            const image = document.createElement("img");
            image.src = photoData;
            image.alt = "Aperçu du produit";
            photoPreview.replaceChildren(image);
        }
        if (photoTitle) {
            photoTitle.textContent = "Photo sélectionnée";
        }
        if (photoDescription) {
            photoDescription.textContent = "Photo prête à être enregistrée";
        }
    }
    catch (error) {
        showNotification(error instanceof Error
            ? error.message
            : "Impossible de prendre la photo.");
    }
}
document
    .querySelector("#photoUpload")
    ?.addEventListener("click", () => {
    void selectProductPhoto();
});
/* =========================================================
   Scanner
   ========================================================= */
setupBarcodeScanner({
    trigger: scanBarcode,
    input: barcode,
    notify: showNotification
});
/* =========================================================
   Enregistrement
   ========================================================= */
function isValidNumber(value, min = 0) {
    return Number.isFinite(value) && value >= min;
}
setupCategoryField(productCategory, document.querySelector("#categoryChips"));
form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = productName?.value.trim() ?? "";
    const purchase = Number(purchasePrice?.value || 0);
    const sale = Number(salePrice?.value || 0);
    const stock = Number(initialStock?.value || 0);
    const threshold = Number(stockThreshold?.value || 0);
    const code = barcode?.value.trim() ?? "";
    // --- Validation ---------------------------------------------------
    if (!name) {
        showNotification("Veuillez saisir le nom du produit.");
        productName?.focus();
        return;
    }
    if (!isValidNumber(purchase)) {
        showNotification("Prix d'achat invalide.");
        purchasePrice?.focus();
        return;
    }
    // Un prix de vente à 0 rendrait la vente impossible à encaisser.
    if (!isValidNumber(sale) || sale <= 0) {
        showNotification("Prix de vente invalide.");
        salePrice?.focus();
        return;
    }
    if (!isValidNumber(stock) || !Number.isInteger(stock)) {
        showNotification("Stock initial invalide.");
        initialStock?.focus();
        return;
    }
    if (!isValidNumber(threshold) || !Number.isInteger(threshold)) {
        showNotification("Seuil d'alerte invalide.");
        stockThreshold?.focus();
        return;
    }
    if (code && getProducts().some((item) => item.barcode === code)) {
        showNotification("Ce code-barres existe déjà.");
        barcode?.focus();
        return;
    }
    // --- Sauvegarde ---------------------------------------------------
    const product = {
        id: newId(),
        name,
        purchasePrice: purchase,
        salePrice: sale,
        stock,
        stockThreshold: threshold,
        barcode: code || null,
        photo: photoData,
        category: resolveCategory(productCategory?.value ?? "")
    };
    if (!addProduct(product)) {
        showNotification("Enregistrement impossible : la mémoire est pleine.");
        return;
    }
    showNotification("Produit enregistré avec succès.");
    window.setTimeout(() => {
        window.location.href = "produits.html";
    }, 800);
});
//# sourceMappingURL=ajouter-produit.js.map