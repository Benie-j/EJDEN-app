// src/scanner.ts
// Scanner de codes-barres pour EJDEN (prototype web).
// Caméra arrière + BarcodeDetector quand il est disponible.
// Plus tard : remplaçable par un scanner natif Capacitor
// en gardant la même interface (start / stop / torch).

/* ========================================
   TYPES
======================================== */

export type ScannerErrorCode =
    | "unsupported"        // pas de getUserMedia (ou page non sécurisée)
    | "permission-denied"  // caméra refusée par l'utilisateur
    | "no-camera"          // aucune caméra trouvée
    | "no-detector"        // BarcodeDetector indisponible
    | "camera-error";      // autre erreur caméra

export interface ScannerOptions {
    video: HTMLVideoElement;
    onDetect: (code: string) => void;
    onError: (code: ScannerErrorCode, message: string) => void;
}

// BarcodeDetector n'est pas encore dans lib.dom de TypeScript.
interface DetectedBarcode {
    rawValue: string;
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

// Délai minimal entre deux analyses d'image (ms).
const DETECTION_INTERVAL = 150;

// Un même code n'est pas renvoyé deux fois pendant ce délai (ms).
const SAME_CODE_COOLDOWN = 1800;


/* ========================================
   OUTILS
======================================== */

function getDetectorConstructor(): BarcodeDetectorConstructor | null {
    const ctor = (window as unknown as {
        BarcodeDetector?: BarcodeDetectorConstructor;
    }).BarcodeDetector;

    return ctor ?? null;
}

export function isCameraScanSupported(): boolean {
    return (
        typeof navigator.mediaDevices?.getUserMedia === "function" &&
        getDetectorConstructor() !== null
    );
}

/** Nettoie un code saisi ou scanné. */
export function normalizeBarcode(value: string): string {
    return value.replace(/\s+/g, "").trim();
}


/* ========================================
   SCANNER
======================================== */

export class BarcodeScanner {
    private readonly options: ScannerOptions;

    private stream: MediaStream | null = null;
    private detector: BarcodeDetectorLike | null = null;
    private frameId: number | null = null;
    private lastAnalysis = 0;
    private lastCode = "";
    private lastCodeTime = 0;
    private analysing = false;

    // Incrémenté à chaque start()/stop() pour ignorer
    // les démarrages devenus obsolètes.
    private session = 0;

    constructor(options: ScannerOptions) {
        this.options = options;
    }

    get isRunning(): boolean {
        return this.stream !== null;
    }

    async start(): Promise<void> {
        this.stop();

        const session = ++this.session;

        if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
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
                video: { facingMode: { ideal: "environment" } },
                audio: false
            });
        } catch (error) {
            if (session !== this.session) {
                return;
            }

            this.reportCameraError(error);
            return;
        }

        // Le scanner a été fermé pendant l'attente de la permission.
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

            this.stop();
            this.reportCameraError(error);
            return;
        }

        if (session !== this.session) {
            return;
        }

        this.lastAnalysis = 0;
        this.frameId = requestAnimationFrame(this.loop);
    }

    stop(): void {
        this.session += 1;

        if (this.frameId !== null) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = null;
        }

        this.options.video.srcObject = null;
        this.detector = null;
        this.analysing = false;
        this.lastCode = "";
        this.lastCodeTime = 0;
    }

    /* ----- Lampe ----- */

    isTorchSupported(): boolean {
        const track = this.stream?.getVideoTracks()[0];

        if (!track || typeof track.getCapabilities !== "function") {
            return false;
        }

        const capabilities = track.getCapabilities() as TorchCapabilities;

        return capabilities.torch === true;
    }

    async setTorch(on: boolean): Promise<boolean> {
        const track = this.stream?.getVideoTracks()[0];

        if (!track || !this.isTorchSupported()) {
            return false;
        }

        try {
            await track.applyConstraints({
                advanced: [{ torch: on } as MediaTrackConstraintSet]
            });
            return true;
        } catch {
            return false;
        }
    }

    /* ----- Interne ----- */

    private async createDetector(
        Detector: BarcodeDetectorConstructor
    ): Promise<BarcodeDetectorLike> {
        if (typeof Detector.getSupportedFormats === "function") {
            const supported = await Detector.getSupportedFormats();
            const formats = PREFERRED_FORMATS.filter((format) =>
                supported.includes(format)
            );

            if (formats.length > 0) {
                return new Detector({ formats });
            }
        }

        return new Detector();
    }

    private reportCameraError(error: unknown): void {
        const name = error instanceof DOMException ? error.name : "";

        if (name === "NotAllowedError" || name === "SecurityError") {
            this.options.onError(
                "permission-denied",
                "Accès à la caméra refusé. Autorisez-le dans les réglages."
            );
            return;
        }

        if (name === "NotFoundError" || name === "OverconstrainedError") {
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
            time - this.lastAnalysis < DETECTION_INTERVAL ||
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
            const results = await detector.detect(this.options.video);

            if (session !== this.session || results.length === 0) {
                return;
            }

            const code = normalizeBarcode(results[0].rawValue);
            const now = Date.now();

            if (!code) {
                return;
            }

            if (
                code === this.lastCode &&
                now - this.lastCodeTime < SAME_CODE_COOLDOWN
            ) {
                return;
            }

            this.lastCode = code;
            this.lastCodeTime = now;

            this.options.onDetect(code);
        } catch {
            // Image illisible : on réessaiera à la prochaine analyse.
        } finally {
            this.analysing = false;
        }
    }
}
