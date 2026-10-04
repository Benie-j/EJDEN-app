import { getProducts, addProduct, resolveCategory } from "./storage.js";
import { setupCategoryField } from "./category-field.js";
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
   Photo : lecture + réduction de taille
   (le localStorage est limité à environ 5 Mo)
   ========================================================= */
function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") {
                resolve(reader.result);
            }
            else {
                reject(new Error("Impossible de lire la photo."));
            }
        };
        reader.onerror = () => {
            reject(new Error("Erreur lors de la lecture de la photo."));
        };
        reader.readAsDataURL(file);
    });
}
function loadImage(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Image invalide."));
        image.src = source;
    });
}
async function preparephoto(file, maxSize = 600, quality = 0.8) {
    const original = await readAsDataURL(file);
    const image = await loadImage(original);
    const ratio = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) {
        return original;
    }
    // Fond blanc pour les PNG transparents (le JPEG n'a pas de transparence).
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", quality);
}
let photoData = null;
productPhoto?.addEventListener("change", async () => {
    const file = productPhoto.files?.[0];
    if (!file) {
        photoData = null;
        return;
    }
    try {
        photoData = await preparephoto(file);
    }
    catch {
        photoData = null;
        showNotification("Impossible de lire cette photo.");
        return;
    }
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
        photoDescription.textContent = file.name;
    }
});
/* =========================================================
   Scanner
   ========================================================= */
scanBarcode?.addEventListener("click", () => {
    showNotification("Le scanner sera connecté à la caméra.");
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
        id: crypto.randomUUID(),
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
/*

import {
    type Product,
    addProduct
} from "./storage.js";


// =========================================================
// Conversion de la photo
// =========================================================
/*
function fileToDataURL(
    file: File
): Promise<string> {

    return new Promise(
        (resolve, reject) => {

            const reader =
                new FileReader();


            reader.onload = () => {

                if (
                    typeof reader.result ===
                    "string"
                ) {

                    resolve(
                        reader.result
                    );

                    return;
                }


                reject(
                    new Error(
                        "Impossible de lire la photo."
                    )
                );
            };


            reader.onerror = () => {

                reject(
                    new Error(
                        "Erreur lors de la lecture de la photo."
                    )
                );
            };


            reader.readAsDataURL(
                file
            );
        }
    );
}
*/
// =========================================================
// Éléments du formulaire
// =========================================================
/*
const form =
    document.querySelector<HTMLFormElement>(
        "#productForm"
    );


const productName =
    document.querySelector<HTMLInputElement>(
        "#productName"
    );


const productPhoto =
    document.querySelector<HTMLInputElement>(
        "#productPhoto"
    );


const photoPreview =
    document.querySelector<HTMLDivElement>(
        "#photoPreview"
    );


const photoTitle =
    document.querySelector<HTMLElement>(
        "#photoTitle"
    );


const photoDescription =
    document.querySelector<HTMLElement>(
        "#photoDescription"
    );


const purchasePrice =
    document.querySelector<HTMLInputElement>(
        "#purchasePrice"
    );


const salePrice =
    document.querySelector<HTMLInputElement>(
        "#salePrice"
    );


const stock =
    document.querySelector<HTMLInputElement>(
        "#stock"
    );


const barcode =
    document.querySelector<HTMLInputElement>(
        "#barcode"
    );


const stockThreshold =
    document.querySelector<HTMLInputElement>(
        "#stockThreshold"
    );


const notification =
    document.querySelector<HTMLDivElement>(
        "#notification"
    );

*/
// =========================================================
// Aperçu de la photo
// =========================================================
/*
productPhoto?.addEventListener(
    "change",
    () => {

        const file =
            productPhoto.files?.[0];


        if (!file) {
            return;
        }


        const reader =
            new FileReader();


        reader.onload = () => {

            if (
                typeof reader.result !==
                "string"
            ) {
                return;
            }


            if (photoPreview) {

                photoPreview.innerHTML = `
                    <img
                        src="${reader.result}"
                        alt="Aperçu du produit"
                    >
                `;
            }


            if (photoTitle) {

                photoTitle.textContent =
                    "Photo sélectionnée";
            }


            if (photoDescription) {

                photoDescription.textContent =
                    file.name;
            }
        };


        reader.readAsDataURL(
            file
        );
    }
);

*/
// =========================================================
// Notification
// =========================================================
/*
function showNotification(
    message: string
): void {

    if (!notification) {
        return;
    }


    notification.textContent =
        message;


    notification.classList.add(
        "show"
    );


    window.setTimeout(
        () => {

            notification.classList.remove(
                "show"
            );

        },
        2500
    );
}

*/
// =========================================================
// Enregistrement
// =========================================================
/*
form?.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        // -----------------------------------------------
        // Valeurs
        // -----------------------------------------------
/*
        const name =
            productName?.value.trim() ??
            "";


        const purchase =
            Number(
                purchasePrice?.value ??
                0
            );


        const sale =
            Number(
                salePrice?.value ??
                0
            );


        const initialStock =
            Number(
                stock?.value ??
                0
            );


        const threshold =
            Number(
                stockThreshold?.value ??
                0
            );


        const code =
            barcode?.value.trim() ??
            "";

*/
// -----------------------------------------------
// Validation
// -----------------------------------------------
/*
        if (!name) {

            showNotification(
                "Veuillez saisir le nom du produit."
            );

            productName?.focus();

            return;
        }


        if (
            !Number.isFinite(purchase) ||
            purchase < 0
        ) {

            showNotification(
                "Prix d'achat invalide."
            );

            purchasePrice?.focus();

            return;
        }


        if (
            !Number.isFinite(sale) ||
            sale < 0
        ) {

            showNotification(
                "Prix de vente invalide."
            );

            salePrice?.focus();

            return;
        }


        if (
            !Number.isFinite(initialStock) ||
            initialStock < 0
        ) {

            showNotification(
                "Stock initial invalide."
            );

            stock?.focus();

            return;
        }


        if (
            !Number.isFinite(threshold) ||
            threshold < 0
        ) {

            showNotification(
                "Seuil d'alerte invalide."
            );

            stockThreshold?.focus();

            return;
        }

*/
// -----------------------------------------------
// Photo
// -----------------------------------------------
/*
        let photo:
            string | null = null;


        const selectedFile =
            productPhoto?.files?.[0];


        if (selectedFile) {

            try {

                photo =
                    await fileToDataURL(
                        selectedFile
                    );

            } catch {

                showNotification(
                    "Impossible d'enregistrer la photo."
                );

                return;
            }
        }

*/
// -----------------------------------------------
// Nouveau produit
// -----------------------------------------------
/*
        const product: Product = {

            id:
                crypto.randomUUID(),

            name,

            purchasePrice:
                purchase,

            salePrice:
                sale,

            stock:
                initialStock,

            stockThreshold:
                threshold,

            barcode:
                code || null,

            photo
        };

*/
// -----------------------------------------------
// Sauvegarde centralisée
// -----------------------------------------------
/*
        const saved =
            addProduct(
                product
            );


        if (!saved) {

            showNotification(
                "Impossible d'enregistrer le produit. Vérifiez l'espace de stockage."
            );

            return;
        }

*/
// -----------------------------------------------
// Confirmation
// -----------------------------------------------
/*
        showNotification(
            "Produit enregistré avec succès."
        );


        window.setTimeout(
            () => {

                window.location.href =
                    "produits.html";

            },
            800
        );
    }
);
*/ 
//# sourceMappingURL=ajouter-produit.js.map