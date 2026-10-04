// src/barcode-field.ts
// Branche le scanner caméra sur un champ « code-barres » de formulaire
// (pages Ajouter un produit et Modifier un produit).
//
// Le HTML de la page doit contenir l'écran scanner :
//   #barcodeScanner, #barcodeVideo, #scannerStatus, #closeScanner
import { findProductByBarcode } from "./storage.js";
import { BarcodeScanner } from "./scanner.js";
const DEFAULT_STATUS = "Placez le code-barres dans le cadre.";
export function setupBarcodeScanner(options) {
    const { trigger, input, currentProductId, notify, allowExisting } = options;
    const overlay = document.querySelector("#barcodeScanner");
    const video = document.querySelector("#barcodeVideo");
    const status = document.querySelector("#scannerStatus");
    const closeButton = document.querySelector("#closeScanner");
    const header = overlay?.querySelector(".scanner-header");
    if (!trigger || !input || !overlay || !video) {
        return;
    }
    let torchButton = null;
    let torchOn = false;
    let statusTimer;
    /* ----- Messages ----- */
    function setStatus(message, isError = false) {
        if (!status) {
            return;
        }
        status.textContent = message;
        status.classList.toggle("is-error", isError);
    }
    function flashError(message) {
        setStatus(message, true);
        if (statusTimer !== undefined) {
            window.clearTimeout(statusTimer);
        }
        statusTimer = window.setTimeout(() => {
            setStatus(DEFAULT_STATUS);
        }, 2500);
    }
    /* ----- Lampe ----- */
    function setTorchState(on) {
        torchOn = on;
        torchButton?.classList.toggle("is-on", on);
        torchButton?.setAttribute("aria-pressed", String(on));
        torchButton?.setAttribute("aria-label", on ? "Éteindre la lampe" : "Allumer la lampe");
    }
    function ensureTorchButton() {
        if (torchButton || !header) {
            return torchButton;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "scanner-torch";
        button.textContent = "Lampe";
        button.hidden = true;
        button.setAttribute("aria-pressed", "false");
        button.setAttribute("aria-label", "Allumer la lampe");
        button.addEventListener("click", async () => {
            const next = !torchOn;
            if (await scanner.setTorch(next)) {
                setTorchState(next);
            }
            else {
                flashError("Lampe indisponible.");
            }
        });
        header.append(button);
        torchButton = button;
        return button;
    }
    /* ----- Scanner ----- */
    function handleDetect(code) {
        const existing = allowExisting ? null : findProductByBarcode(code);
        if (existing && existing.id !== currentProductId) {
            flashError(`Ce code est déjà utilisé par « ${existing.name} ».`);
            return;
        }
        if (!input) {
            return;
        }
        input.value = code;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        close();
        notify(`Code scanné : ${code}`);
    }
    function handleError(code, message) {
        close();
        notify(code === "permission-denied" || code === "no-camera"
            ? message
            : `${message} Saisissez le code à la main.`);
        input?.focus();
    }
    const scanner = new BarcodeScanner({
        video,
        onDetect: handleDetect,
        onError: handleError
    });
    async function open() {
        if (!overlay) {
            return;
        }
        overlay.hidden = false;
        overlay.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        setStatus(DEFAULT_STATUS);
        setTorchState(false);
        if (torchButton) {
            torchButton.hidden = true;
        }
        await scanner.start();
        // La lampe n'est proposée que si le téléphone la gère.
        if (scanner.isRunning && scanner.isTorchSupported()) {
            const button = ensureTorchButton();
            if (button) {
                button.hidden = false;
            }
        }
    }
    function close() {
        scanner.stop();
        setTorchState(false);
        if (overlay) {
            overlay.hidden = true;
            overlay.setAttribute("aria-hidden", "true");
        }
        document.body.style.overflow = "";
    }
    /* ----- Événements ----- */
    trigger.addEventListener("click", () => {
        void open();
    });
    closeButton?.addEventListener("click", close);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !overlay.hidden) {
            close();
        }
    });
    // La caméra doit s'arrêter si l'application passe en arrière-plan.
    document.addEventListener("visibilitychange", () => {
        if (document.hidden && scanner.isRunning) {
            close();
        }
    });
    window.addEventListener("pagehide", () => scanner.stop());
}
//# sourceMappingURL=barcode-field.js.map