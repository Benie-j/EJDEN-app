// src/scanner.ts
// Scanner de codes-barres pour EJDEN (prototype web).
// Caméra arrière + BarcodeDetector quand il est disponible.
// Plus tard : remplaçable par un scanner natif Capacitor
// en gardant la même interface (start / stop / torch).
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
function getDetectorConstructor() {
    const ctor = window.BarcodeDetector;
    return ctor ?? null;
}
export function isCameraScanSupported() {
    return (typeof navigator.mediaDevices?.getUserMedia === "function" &&
        getDetectorConstructor() !== null);
}
/** Nettoie un code saisi ou scanné. */
export function normalizeBarcode(value) {
    return value.replace(/\s+/g, "").trim();
}
/* ========================================
   SCANNER
======================================== */
export class BarcodeScanner {
    options;
    stream = null;
    detector = null;
    frameId = null;
    lastAnalysis = 0;
    lastCode = "";
    lastCodeTime = 0;
    analysing = false;
    // Incrémenté à chaque start()/stop() pour ignorer
    // les démarrages devenus obsolètes.
    session = 0;
    constructor(options) {
        this.options = options;
    }
    get isRunning() {
        return this.stream !== null;
    }
    async start() {
        this.stop();
        const session = ++this.session;
        if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
            this.options.onError("unsupported", "La caméra n'est pas disponible sur cette page.");
            return;
        }
        const Detector = getDetectorConstructor();
        if (!Detector) {
            this.options.onError("no-detector", "Le scan automatique n'est pas pris en charge ici.");
            return;
        }
        try {
            this.detector = await this.createDetector(Detector);
        }
        catch {
            this.options.onError("no-detector", "Le scan automatique n'est pas pris en charge ici.");
            return;
        }
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" } },
                audio: false
            });
        }
        catch (error) {
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
        }
        catch (error) {
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
    stop() {
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
    isTorchSupported() {
        const track = this.stream?.getVideoTracks()[0];
        if (!track || typeof track.getCapabilities !== "function") {
            return false;
        }
        const capabilities = track.getCapabilities();
        return capabilities.torch === true;
    }
    async setTorch(on) {
        const track = this.stream?.getVideoTracks()[0];
        if (!track || !this.isTorchSupported()) {
            return false;
        }
        try {
            await track.applyConstraints({
                advanced: [{ torch: on }]
            });
            return true;
        }
        catch {
            return false;
        }
    }
    /* ----- Interne ----- */
    async createDetector(Detector) {
        if (typeof Detector.getSupportedFormats === "function") {
            const supported = await Detector.getSupportedFormats();
            const formats = PREFERRED_FORMATS.filter((format) => supported.includes(format));
            if (formats.length > 0) {
                return new Detector({ formats });
            }
        }
        return new Detector();
    }
    reportCameraError(error) {
        const name = error instanceof DOMException ? error.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
            this.options.onError("permission-denied", "Accès à la caméra refusé. Autorisez-le dans les réglages.");
            return;
        }
        if (name === "NotFoundError" || name === "OverconstrainedError") {
            this.options.onError("no-camera", "Aucune caméra n'a été trouvée sur cet appareil.");
            return;
        }
        this.options.onError("camera-error", "Impossible de démarrer la caméra.");
    }
    loop = (time) => {
        if (!this.stream) {
            return;
        }
        this.frameId = requestAnimationFrame(this.loop);
        if (this.analysing ||
            time - this.lastAnalysis < DETECTION_INTERVAL ||
            this.options.video.readyState < 2) {
            return;
        }
        this.lastAnalysis = time;
        void this.analyse();
    };
    async analyse() {
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
            if (code === this.lastCode &&
                now - this.lastCodeTime < SAME_CODE_COOLDOWN) {
                return;
            }
            this.lastCode = code;
            this.lastCodeTime = now;
            this.options.onDetect(code);
        }
        catch {
            // Image illisible : on réessaiera à la prochaine analyse.
        }
        finally {
            this.analysing = false;
        }
    }
}
//# sourceMappingURL=scanner.js.map