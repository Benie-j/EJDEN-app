
import {
    type Product,
    getProducts,
    addProduct,
    resolveCategory,
    newId
} from "./storage.js";
import { setupCategoryField } from "./category-field.js";
import { setupBarcodeScanner } from "./barcode-field.js";
import { preparePhoto } from "./photo.js";
import { captureProductPhoto } from "./photo-capture.js";

/* =========================================================
   Éléments du formulaire
   ========================================================= */

const form = document.querySelector<HTMLFormElement>("#productForm");
const productName = document.querySelector<HTMLInputElement>("#productName");
const productCategory =
    document.querySelector<HTMLInputElement>("#productCategory");
const productPhoto = document.querySelector<HTMLInputElement>("#productPhoto");
const photoPreview = document.querySelector<HTMLDivElement>("#photoPreview");
const photoTitle = document.querySelector<HTMLElement>("#photoTitle");
const photoDescription =
    document.querySelector<HTMLElement>("#photoDescription");
const purchasePrice =
    document.querySelector<HTMLInputElement>("#purchasePrice");
const salePrice = document.querySelector<HTMLInputElement>("#salePrice");
// L'identifiant dans le HTML est "initialStock" (et non "stock").
const initialStock =
    document.querySelector<HTMLInputElement>("#initialStock");
const stockThreshold =
    document.querySelector<HTMLInputElement>("#stockThreshold");
const barcode = document.querySelector<HTMLInputElement>("#barcode");
const scanBarcode = document.querySelector<HTMLButtonElement>("#scanBarcode");
const notification = document.querySelector<HTMLDivElement>("#notification");


/* =========================================================
   Notification
   ========================================================= */

let notificationTimer: number | undefined;

function showNotification(message: string): void {
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

let photoData: string | null = null;

async function selectProductPhoto(): Promise<void> {
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
    } catch (error) {
        showNotification(
            error instanceof Error
                ? error.message
                : "Impossible de prendre la photo."
        );
    }
}

document
    .querySelector<HTMLElement>("#photoUpload")
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

function isValidNumber(value: number, min = 0): boolean {
    return Number.isFinite(value) && value >= min;
}

setupCategoryField(
    productCategory,
    document.querySelector<HTMLElement>("#categoryChips")
);

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

    const product: Product = {
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
        showNotification(
            "Enregistrement impossible : la mémoire est pleine."
        );
        return;
    }

    showNotification("Produit enregistré avec succès.");

    window.setTimeout(() => {
        window.location.href = "produits.html";
    }, 800);
});
