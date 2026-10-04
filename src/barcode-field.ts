// src/barcode-field.ts
// Branche le scanner caméra sur un champ « code-barres » de formulaire
// (pages Ajouter un produit et Modifier un produit).
//
// Le HTML de la page doit contenir l'écran scanner :
//   #barcodeScanner, #barcodeVideo, #scannerStatus, #closeScanner

import { findProductByBarcode } from "./storage.js";
import { BarcodeScanner, type ScannerErrorCode } from "./scanner.js";

export interface BarcodeFieldOptions {
    /** Bouton « Scanner » du formulaire. */
    trigger: HTMLButtonElement | null;

    /** Champ qui reçoit le code scanné. */
    input: HTMLInputElement | null;

    /** Produit en cours de modification : son propre code reste accepté. */
    currentProductId?: string;

    /**
     * true = recherche : un code déjà connu est le but (page Produits).
     * false (défaut) = formulaire : un code déjà utilisé est refusé.
     */
    allowExisting?: boolean;

    /** Message court affiché sur la page (notification). */
    notify: (message: string) => void;
}

const DEFAULT_STATUS = "Placez le code-barres dans le cadre.";

export function setupBarcodeScanner(options: BarcodeFieldOptions): void {
    const { trigger, input, currentProductId, notify, allowExisting } =
        options;

    const overlay = document.querySelector<HTMLElement>("#barcodeScanner");
    const video = document.querySelector<HTMLVideoElement>("#barcodeVideo");
    const status = document.querySelector<HTMLElement>("#scannerStatus");
    const closeButton =
        document.querySelector<HTMLButtonElement>("#closeScanner");
    const header = overlay?.querySelector<HTMLElement>(".scanner-header");

    if (!trigger || !input || !overlay || !video) {
        return;
    }

    let torchButton: HTMLButtonElement | null = null;
    let torchOn = false;
    let statusTimer: number | undefined;

    /* ----- Messages ----- */

    function setStatus(message: string, isError = false): void {
        if (!status) {
            return;
        }

        status.textContent = message;
        status.classList.toggle("is-error", isError);
    }

    function flashError(message: string): void {
        setStatus(message, true);

        if (statusTimer !== undefined) {
            window.clearTimeout(statusTimer);
        }

        statusTimer = window.setTimeout(() => {
            setStatus(DEFAULT_STATUS);
        }, 2500);
    }

    /* ----- Lampe ----- */

    function setTorchState(on: boolean): void {
        torchOn = on;

        torchButton?.classList.toggle("is-on", on);
        torchButton?.setAttribute("aria-pressed", String(on));
        torchButton?.setAttribute(
            "aria-label",
            on ? "Éteindre la lampe" : "Allumer la lampe"
        );
    }

    function ensureTorchButton(): HTMLButtonElement | null {
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
            } else {
                flashError("Lampe indisponible.");
            }
        });

        header.append(button);
        torchButton = button;

        return button;
    }

    /* ----- Scanner ----- */

    function handleDetect(code: string): void {
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

    function handleError(code: ScannerErrorCode, message: string): void {
        close();

        notify(
            code === "permission-denied" || code === "no-camera"
                ? message
                : `${message} Saisissez le code à la main.`
        );

        input?.focus();
    }

    const scanner = new BarcodeScanner({
        video,
        onDetect: handleDetect,
        onError: handleError
    });

    async function open(): Promise<void> {
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

    function close(): void {
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