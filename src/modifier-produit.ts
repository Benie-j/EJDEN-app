// src/modifier-produit.ts
// Page « Modifier un produit » : remplit le formulaire avec les
// informations ACTUELLES du produit, puis enregistre les changements.

import {
    type Product,
    LIMITS,
    getProductById,
    findProductByBarcode,
    updateProduct,
    deleteProduct,
    getRememberedEditingProduct,
    forgetEditingProduct,
    resolveCategory
} from "./storage.js";
import { setupCategoryField } from "./category-field.js";
import { setupBarcodeScanner } from "./barcode-field.js";
import { preparePhoto } from "./photo.js";


/* =========================================================
   Éléments du formulaire
   ========================================================= */

const form = document.querySelector<HTMLFormElement>("#productForm");
const productName = document.querySelector<HTMLInputElement>("#productName");
const productCategory =
    document.querySelector<HTMLInputElement>("#productCategory");
const purchasePrice =
    document.querySelector<HTMLInputElement>("#purchasePrice");
const salePrice = document.querySelector<HTMLInputElement>("#salePrice");
const stock = document.querySelector<HTMLInputElement>("#stock");
const stockThreshold =
    document.querySelector<HTMLInputElement>("#stockThreshold");
const barcode = document.querySelector<HTMLInputElement>("#barcode");
const scanBarcode = document.querySelector<HTMLButtonElement>("#scanBarcode");
const notification = document.querySelector<HTMLDivElement>("#notification");

const productPhoto = document.querySelector<HTMLInputElement>("#productPhoto");
const photoPreview = document.querySelector<HTMLDivElement>("#photoPreview");
const removePhotoButton =
    document.querySelector<HTMLButtonElement>("#removePhotoButton");
const saveButton =
    document.querySelector<HTMLButtonElement>(".save-button");
const dangerZone = document.querySelector<HTMLElement>("#dangerZone");
const deleteProductButton =
    document.querySelector<HTMLButtonElement>("#deleteProductButton");

// Le formulaire ne doit jamais être « restauré » par le navigateur
// avec d'anciennes valeurs : c'est notre code qui le remplit.
form?.setAttribute("autocomplete", "off");

// Contenu « Aucune photo » d'origine, pour pouvoir le remettre.
const emptyPhotoNodes = photoPreview
    ? Array.from(photoPreview.childNodes).map((node) => node.cloneNode(true))
    : [];


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

function isValidNumber(value: number, max: number): boolean {
    return Number.isFinite(value) && value >= 0 && value <= max;
}


/* =========================================================
   Photo
   ========================================================= */

// Photo qui sera enregistrée (null = aucune).
let currentPhoto: string | null = null;

function renderPhoto(photo: string | null): void {
    currentPhoto = photo;

    if (photoPreview) {
        if (photo) {
            const image = document.createElement("img");

            image.src = photo;
            image.alt = "Photo du produit";

            photoPreview.replaceChildren(image);
        } else {
            photoPreview.replaceChildren(
                ...emptyPhotoNodes.map((node) => node.cloneNode(true))
            );
        }
    }

    if (removePhotoButton) {
        removePhotoButton.hidden = photo === null;
    }
}

productPhoto?.addEventListener("change", async () => {
    const file = productPhoto.files?.[0];

    if (!file) {
        return;
    }

    try {
        renderPhoto(await preparePhoto(file));
    } catch (error) {
        showNotification(
            error instanceof Error
                ? error.message
                : "Impossible de lire cette photo."
        );
    }

    // Permet de rechoisir le même fichier plus tard.
    productPhoto.value = "";
});

removePhotoButton?.addEventListener("click", () => {
    renderPhoto(null);
});


/* =========================================================
   Récupération du produit à modifier
   ========================================================= */

// Identifiant : dans l'adresse (?id=…), sinon celui mémorisé au clic sur
// « Modifier » (utile si le serveur supprime la partie « ?id=… »).
const productId =
    new URLSearchParams(window.location.search).get("id") ??
    getRememberedEditingProduct();

const currentProduct: Product | null = productId
    ? getProductById(productId)
    : null;

setupBarcodeScanner({
    trigger: scanBarcode,
    input: barcode,
    currentProductId: currentProduct?.id,
    notify: showNotification
});

function fillForm(product: Product): void {
    if (productName) productName.value = product.name;
    if (productCategory) productCategory.value = product.category ?? "";
    if (purchasePrice) purchasePrice.value = String(product.purchasePrice);
    if (salePrice) salePrice.value = String(product.salePrice);
    if (stock) stock.value = String(product.stock);
    if (stockThreshold) {
        stockThreshold.value = String(product.stockThreshold);
    }
    if (barcode) barcode.value = product.barcode ?? "";

    renderPhoto(product.photo);
}

/** Remplace le formulaire vide par un message qui reste affiché. */
function showNotFound(): void {
    if (saveButton) {
        saveButton.disabled = true;
    }

    if (form) {
        form.hidden = true;
    }

    if (dangerZone) {
        dangerZone.hidden = true;
    }

    const notice = document.createElement("section");
    const title = document.createElement("strong");
    const text = document.createElement("p");
    const back = document.createElement("a");

    notice.className = "not-found";
    notice.setAttribute("role", "alert");

    title.textContent = "Produit introuvable";
    text.textContent = productId
        ? "Ce produit n'existe plus ou a été supprimé."
        : "Aucun produit n'a été sélectionné. Ouvrez-le depuis la liste.";

    back.href = "produits.html";
    back.textContent = "Retour aux produits";

    notice.append(title, text, back);

    (form ?? document.querySelector("main"))?.before(notice);
}

if (!currentProduct) {

    showNotFound();

} else {

    const product: Product = currentProduct;

    fillForm(product);

    setupCategoryField(
        productCategory,
        document.querySelector<HTMLElement>("#categoryChips")
    );

    // Retour sur la page depuis le cache du navigateur :
    // on remet les informations enregistrées.
    window.addEventListener("pageshow", (event) => {
        if (!event.persisted) {
            return;
        }

        const latest = getProductById(product.id);

        if (latest) {
            fillForm(latest);
        }
    });


    /* =====================================================
       Suppression du produit
       ===================================================== */

    deleteProductButton?.addEventListener("click", () => {
        const confirmed = window.confirm(
            `Supprimer « ${product.name} » ?\n\n` +
            "Cette action est définitive. Les ventes déjà " +
            "enregistrées restent dans l'historique."
        );

        if (!confirmed) {
            return;
        }

        if (!deleteProduct(product.id)) {
            showNotification("Impossible de supprimer ce produit.");
            return;
        }

        forgetEditingProduct();

        if (deleteProductButton) {
            deleteProductButton.disabled = true;
        }

        if (saveButton) {
            saveButton.disabled = true;
        }

        showNotification("Produit supprimé.");

        window.setTimeout(() => {
            window.location.href = "produits.html";
        }, 700);
    });


    /* =====================================================
       Enregistrement des modifications
       ===================================================== */

    let saving = false;

    form?.addEventListener("submit", (event) => {
        event.preventDefault();

        if (saving) {
            return;
        }

        const name = productName?.value.trim() ?? "";
        const purchase = Number(purchasePrice?.value || 0);
        const sale = Number(salePrice?.value || 0);
        const currentStock = Number(stock?.value || 0);
        const threshold = Number(stockThreshold?.value || 0);
        const code = barcode?.value.replace(/\s+/g, "") ?? "";

        // --- Validation ---------------------------------------------

        if (!name) {
            showNotification("Veuillez saisir le nom du produit.");
            productName?.focus();
            return;
        }

        if (name.length > LIMITS.nameMax) {
            showNotification(
                `Le nom est trop long (${LIMITS.nameMax} caractères max).`
            );
            productName?.focus();
            return;
        }

        if (!isValidNumber(purchase, LIMITS.moneyMax)) {
            showNotification("Prix d'achat invalide.");
            purchasePrice?.focus();
            return;
        }

        if (!isValidNumber(sale, LIMITS.moneyMax) || sale <= 0) {
            showNotification("Prix de vente invalide.");
            salePrice?.focus();
            return;
        }

        if (
            !isValidNumber(currentStock, LIMITS.stockMax) ||
            !Number.isInteger(currentStock)
        ) {
            showNotification("Stock invalide.");
            stock?.focus();
            return;
        }

        if (
            !isValidNumber(threshold, LIMITS.stockMax) ||
            !Number.isInteger(threshold)
        ) {
            showNotification("Seuil d'alerte invalide.");
            stockThreshold?.focus();
            return;
        }

        if (code.length > LIMITS.barcodeMax) {
            showNotification("Code-barres trop long.");
            barcode?.focus();
            return;
        }

        // Le code-barres ne doit pas appartenir à un AUTRE produit.
        const owner = code ? findProductByBarcode(code) : null;

        if (owner !== null && owner.id !== product.id) {
            showNotification("Ce code-barres existe déjà.");
            barcode?.focus();
            return;
        }

        // --- Mise à jour --------------------------------------------

        const updatedProduct: Product = {
            ...product,
            name,
            purchasePrice: purchase,
            salePrice: sale,
            stock: currentStock,
            stockThreshold: threshold,
            barcode: code || null,
            photo: currentPhoto,
            category: resolveCategory(productCategory?.value ?? "")
        };

        saving = true;

        if (!updateProduct(updatedProduct)) {
            saving = false;
            showNotification("Impossible d'enregistrer les modifications.");
            return;
        }

        forgetEditingProduct();

        showNotification("Produit modifié avec succès.");

        window.setTimeout(() => {
            window.location.href = "produits.html";
        }, 800);
    });
}
