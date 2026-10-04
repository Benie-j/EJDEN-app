// src/photo.ts
// Prépare une photo de produit : lecture, réduction, JPEG.
// Le résultat est toujours une image data:image/jpeg sûre (voir storage.ts).

import { LIMITS, isSafePhoto } from "./storage.js";

// Fichier d'origine accepté (avant réduction).
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

function readAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            if (typeof reader.result === "string") {
                resolve(reader.result);
            } else {
                reject(new Error("Impossible de lire la photo."));
            }
        };

        reader.onerror = () => {
            reject(new Error("Erreur lors de la lecture de la photo."));
        };

        reader.readAsDataURL(file);
    });
}

function loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Image invalide."));

        image.src = source;
    });
}

export async function preparePhoto(file: File): Promise<string> {
    if (!file.type.startsWith("image/")) {
        throw new Error("Ce fichier n'est pas une image.");
    }

    if (file.size > MAX_SOURCE_BYTES) {
        throw new Error("Cette photo est trop lourde.");
    }

    const image = await loadImage(await readAsDataURL(file));

    // On réduit jusqu'à ce que la photo tienne dans la limite de stockage.
    for (const [maxSize, quality] of [
        [600, 0.8],
        [480, 0.7],
        [360, 0.6]
    ] as const) {
        const ratio = Math.min(
            1,
            maxSize / Math.max(image.width, image.height)
        );

        const canvas = document.createElement("canvas");

        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));

        const context = canvas.getContext("2d");

        if (!context) {
            throw new Error("Impossible de traiter la photo.");
        }

        // Fond blanc : le JPEG n'a pas de transparence.
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const result = canvas.toDataURL("image/jpeg", quality);

        if (isSafePhoto(result)) {
            return result;
        }
    }

    throw new Error(
        `Photo trop grande (limite ${Math.round(LIMITS.photoMax / 1000)} Ko).`
    );
}
