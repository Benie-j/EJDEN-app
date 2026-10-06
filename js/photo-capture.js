// src/photo-capture.ts
// Capture ou sélection d'une photo via Capacitor Camera.
// Le résultat est converti en File pour être traité par preparePhoto().
const CapacitorGlobal = window.Capacitor;
const Camera = (CapacitorGlobal?.Plugins?.["Camera"] ?? {});
async function photoToFile(photo) {
    const source = photo.webPath ?? photo.path;
    if (!source) {
        throw new Error("Impossible de récupérer la photo.");
    }
    const response = await fetch(source);
    if (!response.ok) {
        throw new Error("Impossible de lire la photo.");
    }
    const blob = await response.blob();
    return new File([blob], `ejden-photo-${Date.now()}.jpg`, {
        type: blob.type || "image/jpeg"
    });
}
export async function captureProductPhoto() {
    try {
        const photo = await Camera.getPhoto({
            quality: 90,
            resultType: "uri",
            source: "PROMPT",
            width: 1200,
            height: 1200,
            correctOrientation: true
        });
        return await photoToFile(photo);
    }
    catch (error) {
        if (error instanceof Error &&
            (error.message.toLowerCase().includes("cancel") ||
                error.message.toLowerCase().includes("cancelled") ||
                error.message.toLowerCase().includes("canceled"))) {
            return null;
        }
        throw error;
    }
}
//# sourceMappingURL=photo-capture.js.map