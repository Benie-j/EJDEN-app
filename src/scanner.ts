// src/scanner.ts
// Scanner EJDEN
//
// Android / iOS natif : @capacitor-mlkit/barcode-scanning
// Web : BarcodeDetector + getUserMedia
//
// L'interface publique reste volontairement simple :
// start() / stop() / isRunning / isTorchSupported() / setTorch()

import { Capacitor } from "@capacitor/core";
import {
    BarcodeScanner as NativeBarcodeScanner,
    BarcodeFormat,
    LensFacing,
    Resolution
} from "@capacitor-mlkit/barcode-scanning";

export type ScannerErrorCode =
    | "unsupported"
    | "permission-denied"
    | "no-camera"
    | "no-detector"
    | "camera-error";

export interface ScannerOptions {
    video: HTMLVideoElement;
    onDetect: (code: string) => void;
    onError: (code: ScannerErrorCode, message: string) => void;
}

interface DetectedBarcode {
    rawValue?: string;
}

interface BarcodeDetectorLike {
    detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
    new (options?: { formats?: string[] }): BarcodeDetectorLike;
    getSupportedFormats?: () => Promise<string[]>;
}

interface TorchCapabilities extends MediaTrackCapabilities {
    torch?: boolean;
}

const PREFERRED_FORMATS = [
    "ean_13",
    "ean_8",
    "upc_a",
    "upc_e",
    "code_128",
    "code_39",
    "itf",
    "qr_code"
];

const NATIVE_FORMATS = [
    BarcodeFormat.Ean13,
    BarcodeFormat.Ean8,
    BarcodeFormat.UpcA,
    BarcodeFormat.UpcE,
    BarcodeFormat.Code128,
    BarcodeFormat.Code39,
    BarcodeFormat.Itf,
    BarcodeFormat.QrCode
];

const DETECTION_INTERVAL = 150;
const SAME_CODE_COOLDOWN = 1800;

function isNativePlatform(): boolean {
    return Capacitor.isNativePlatform();
}

function getDetectorConstructor(): BarcodeDetectorConstructor | null {
    const ctor = (window as unknown as {
        BarcodeDetector?: BarcodeDetectorConstructor;
    }).BarcodeDetector;

    return ctor ?? null;
}

export function isCameraScanSupported(): boolean {
    if (isNativePlatform()) {
        return true;
    }

    return (
        typeof navigator.mediaDevices?.getUserMedia === "function" &&
        getDetectorConstructor() !== null
    );
}

export function normalizeBarcode(value: string): string {
    return value.replace(/\s+/g, "").trim();
}

export class BarcodeScanner {
    private readonly options: ScannerOptions;

    // Web scanner
    private stream: MediaStream | null = null;
    private detector: BarcodeDetectorLike | null = null;
    private frameId: number | null = null;
    private lastAnalysis = 0;
    private lastCode = "";
    private lastCodeTime = 0;
    private analysing = false;

    // Native scanner
    private nativeRunning = false;
    private nativeListener: {
        remove: () => Promise<void>;
    } | null = null;

    private session = 0;

    constructor(options: ScannerOptions) {
        this.options = options;
    }

    get isRunning(): boolean {
        return this.nativeRunning || this.stream !== null;
    }

    async start(): Promise<void> {
        await this.stopAsync();

        const session = ++this.session;

        if (isNativePlatform()) {
            await this.startNative(session);
            return;
        }

        await this.startWeb(session);
    }

    stop(): void {
        void this.stopAsync();
    }

    async stopAsync(): Promise<void> {
        this.session += 1;

        this.stopWeb();

        if (this.nativeListener) {
            try {
                await this.nativeListener.remove();
            } catch {
                // Listener déjà supprimé.
            }

            this.nativeListener = null;
        }

        if (this.nativeRunning) {
            try {
                await NativeBarcodeScanner.stopScan();
            } catch {
                // Le scanner était peut-être déjà arrêté.
            }

            this.nativeRunning = false;
        }

        this.restoreNativeWebView();
    }

    /* ========================================
       NATIVE
    ======================================== */

    private async startNative(session: number): Promise<void> {
        try {
            const supported = await NativeBarcodeScanner.isSupported();

            if (!supported.supported) {
                this.options.onError(
                    "no-camera",
                    "Aucune caméra compatible avec le scanner n'a été trouvée."
                );
                return;
            }

            const permission = await NativeBarcodeScanner.checkPermissions();

            if (permission.camera !== "granted") {
                const requested =
                    await NativeBarcodeScanner.requestPermissions();

                if (requested.camera !== "granted") {
                    this.options.onError(
                        "permission-denied",
                        "Accès à la caméra refusé. Autorisez-le dans les réglages."
                    );
                    return;
                }
            }

            if (session !== this.session) {
                return;
            }

            this.prepareNativeWebView();

            this.nativeListener =
                await NativeBarcodeScanner.addListener(
                    "barcodesScanned",
                    async (event) => {
                        if (session !== this.session || !this.nativeRunning) {
                            return;
                        }

                        const barcode = event.barcodes[0];

                        if (!barcode) {
                            return;
                        }

                        const code = normalizeBarcode(
                            barcode.rawValue ?? barcode.displayValue ?? ""
                        );

                        if (!code) {
                            return;
                        }

                        const now = Date.now();

                        if (
                            code === this.lastCode &&
                            now - this.lastCodeTime < SAME_CODE_COOLDOWN
                        ) {
                            return;
                        }

                        this.lastCode = code;
                        this.lastCodeTime = now;

                        this.options.onDetect(code);
                    }
                );

            this.nativeRunning = true;

            await NativeBarcodeScanner.startScan({
                formats: NATIVE_FORMATS,
                lensFacing: LensFacing.Back,
                resolution: Resolution["1280x720"]
            });
        } catch (error) {
            if (session !== this.session) {
                return;
            }

            this.nativeRunning = false;

            if (this.nativeListener) {
                try {
                    await this.nativeListener.remove();
                } catch {
                    // Rien à faire.
                }

                this.nativeListener = null;
            }

            this.restoreNativeWebView();

            const message =
                error instanceof Error && error.message
                    ? error.message
                    : "";

            if (
                message.toLowerCase().includes("permission") ||
                message.toLowerCase().includes("denied")
            ) {
                this.options.onError(
                    "permission-denied",
                    "Accès à la caméra refusé. Autorisez-le dans les réglages."
                );
                return;
            }

            this.options.onError(
                "camera-error",
                "Impossible de démarrer le scanner caméra."
            );
        }
    }

    private prepareNativeWebView(): void {
        document.documentElement.style.background = "transparent";
        document.body.style.background = "transparent";

        document.documentElement.classList.add(
            "ejden-native-scanner-active"
        );
        document.body.classList.add("ejden-native-scanner-active");
    }

    private restoreNativeWebView(): void {
        document.documentElement.style.background = "";
        document.body.style.background = "";

        document.documentElement.classList.remove(
            "ejden-native-scanner-active"
        );
        document.body.classList.remove(
            "ejden-native-scanner-active"
        );
    }

    /* ========================================
       WEB
    ======================================== */

    private async startWeb(session: number): Promise<void> {
        if (
            typeof navigator.mediaDevices?.getUserMedia !==
            "function"
        ) {
            this.options.onError(
                "unsupported",
                "La caméra n'est pas disponible sur cette page."
            );
            return;
        }

        const Detector = getDetectorConstructor();

        if (!Detector) {
            this.options.onError(
                "no-detector",
                "Le scan automatique n'est pas pris en charge ici."
            );
            return;
        }

        try {
            this.detector = await this.createDetector(Detector);
        } catch {
            this.options.onError(
                "no-detector",
                "Le scan automatique n'est pas pris en charge ici."
            );
            return;
        }

        let stream: MediaStream;

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: {
                        ideal: "environment"
                    }
                },
                audio: false
            });
        } catch (error) {
            if (session !== this.session) {
                return;
            }

            this.reportCameraError(error);
            return;
        }

        if (session !== this.session) {
            stream.getTracks().forEach((track) => track.stop());
            return;
        }

        this.stream = stream;

        const { video } = this.options;

        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;

        try {
            await video.play();
        } catch (error) {
            if (session !== this.session) {
                return;
            }

            this.stopWeb();
            this.reportCameraError(error);
            return;
        }

        if (session !== this.session) {
            return;
        }

        this.lastAnalysis = 0;
        this.frameId = requestAnimationFrame(this.loop);
    }

    private stopWeb(): void {
        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }

        if (this.stream) {
            this.stream
                .getTracks()
                .forEach((track) => track.stop());

            this.stream = null;
        }

        this.options.video.srcObject = null;
        this.detector = null;
        this.analysing = false;
        this.lastCode = "";
        this.lastCodeTime = 0;
    }

    /* ========================================
       TORCHE
    ======================================== */

    isTorchSupported(): boolean {
        if (isNativePlatform()) {
            return this.nativeRunning;
        }

        const track = this.stream?.getVideoTracks()[0];

        if (
            !track ||
            typeof track.getCapabilities !== "function"
        ) {
            return false;
        }

        const capabilities =
            track.getCapabilities() as TorchCapabilities;

        return capabilities.torch === true;
    }

    async setTorch(on: boolean): Promise<boolean> {
        if (isNativePlatform()) {
            if (!this.nativeRunning) {
                return false;
            }

            try {
                if (on) {
                    await NativeBarcodeScanner.enableTorch();
                } else {
                    await NativeBarcodeScanner.disableTorch();
                }

                return true;
            } catch {
                return false;
            }
        }

        const track = this.stream?.getVideoTracks()[0];

        if (!track || !this.isTorchSupported()) {
            return false;
        }

        try {
            await track.applyConstraints({
                advanced: [
                    {
                        torch: on
                    } as MediaTrackConstraintSet
                ]
            });

            return true;
        } catch {
            return false;
        }
    }

    /* ========================================
       WEB DETECTION
    ======================================== */

    private async createDetector(
        Detector: BarcodeDetectorConstructor
    ): Promise<BarcodeDetectorLike> {
        if (typeof Detector.getSupportedFormats === "function") {
            const supported =
                await Detector.getSupportedFormats();

            const formats = PREFERRED_FORMATS.filter(
                (format) => supported.includes(format)
            );

            if (formats.length > 0) {
                return new Detector({ formats });
            }
        }

        return new Detector();
    }

    private reportCameraError(error: unknown): void {
        const name =
            error instanceof DOMException
                ? error.name
                : "";

        if (
            name === "NotAllowedError" ||
            name === "SecurityError"
        ) {
            this.options.onError(
                "permission-denied",
                "Accès à la caméra refusé. Autorisez-le dans les réglages."
            );
            return;
        }

        if (
            name === "NotFoundError" ||
            name === "OverconstrainedError"
        ) {
            this.options.onError(
                "no-camera",
                "Aucune caméra n'a été trouvée sur cet appareil."
            );
            return;
        }

        this.options.onError(
            "camera-error",
            "Impossible de démarrer la caméra."
        );
    }

    private loop = (time: number): void => {
        if (!this.stream) {
            return;
        }

        this.frameId = requestAnimationFrame(this.loop);

        if (
            this.analysing ||
            time - this.lastAnalysis <
                DETECTION_INTERVAL ||
            this.options.video.readyState < 2
        ) {
            return;
        }

        this.lastAnalysis = time;
        void this.analyse();
    };

    private async analyse(): Promise<void> {
        const detector = this.detector;
        const session = this.session;

        if (!detector) {
            return;
        }

        this.analysing = true;

        try {
            const results =
                await detector.detect(
                    this.options.video
                );

            if (
                session !== this.session ||
                results.length === 0
            ) {
                return;
            }

            const rawValue =
                results[0].rawValue ?? "";

            const code = normalizeBarcode(rawValue);
            const now = Date.now();

            if (!code) {
                return;
            }

            if (
                code === this.lastCode &&
                now - this.lastCodeTime <
                    SAME_CODE_COOLDOWN
            ) {
                return;
            }

            this.lastCode = code;
            this.lastCodeTime = now;

            this.options.onDetect(code);
        } catch {
            // Image illisible : prochaine analyse.
        } finally {
            this.analysing = false;
        }
    }
}
