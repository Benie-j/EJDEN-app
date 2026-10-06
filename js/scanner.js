// src/scanner.ts
// Scanner EJDEN
//
// Android / iOS natif : @capacitor-mlkit/barcode-scanning
// Web : BarcodeDetector + getUserMedia
//
// L'interface publique reste volontairement simple :
// start() / stop() / isRunning / isTorchSupported() / setTorch()
const CapacitorGlobal = window.Capacitor;
const NativeBarcodeScanner = (CapacitorGlobal?.Plugins?.["CapacitorBarcodeScanner"] ?? {});
// Valeurs identiques à celles du plugin @capacitor-mlkit/barcode-scanning
const BarcodeFormat = {
    All: 17
};
const LensFacing = { Back: 1 };
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
const DETECTION_INTERVAL = 150;
const SAME_CODE_COOLDOWN = 1800;
function isNativePlatform() {
    return CapacitorGlobal?.isNativePlatform() ?? false;
}
function getDetectorConstructor() {
    const ctor = window.BarcodeDetector;
    return ctor ?? null;
}
export function isCameraScanSupported() {
    if (isNativePlatform()) {
        return true;
    }
    return (typeof navigator.mediaDevices?.getUserMedia === "function" &&
        getDetectorConstructor() !== null);
}
export function normalizeBarcode(value) {
    return value.replace(/\s+/g, "").trim();
}
export class BarcodeScanner {
    options;
    // Web scanner
    stream = null;
    detector = null;
    frameId = null;
    lastAnalysis = 0;
    lastCode = "";
    lastCodeTime = 0;
    analysing = false;
    // Native scanner
    nativeRunning = false;
    nativeListener = null;
    session = 0;
    constructor(options) {
        this.options = options;
    }
    get isRunning() {
        return this.nativeRunning || this.stream !== null;
    }
    async start() {
        await this.stopAsync();
        const session = ++this.session;
        if (isNativePlatform()) {
            await this.startNative(session);
            return;
        }
        await this.startWeb(session);
    }
    stop() {
        void this.stopAsync();
    }
    async stopAsync() {
        this.session += 1;
        this.stopWeb();
        if (this.nativeListener) {
            try {
                await this.nativeListener.remove();
            }
            catch {
                // Listener déjà supprimé.
            }
            this.nativeListener = null;
        }
        if (this.nativeRunning) {
            this.nativeRunning = false;
        }
        this.restoreNativeWebView();
    }
    /* ========================================
       NATIVE
    ======================================== */
    async startNative(session) {
        try {
            if (session !== this.session) {
                return;
            }
            this.nativeRunning = true;
            const result = await NativeBarcodeScanner.scanBarcode({
                hint: BarcodeFormat.All,
                cameraDirection: LensFacing.Back,
                scanInstructions: "Placez le code-barres dans le cadre",
                android: {
                    scanningLibrary: "zxing"
                }
            });
            if (session !== this.session) {
                return;
            }
            const code = normalizeBarcode(result.ScanResult ?? "");
            if (code) {
                this.lastCode = code;
                this.lastCodeTime = Date.now();
                this.options.onDetect(code);
            }
            this.nativeRunning = false;
        }
        catch (error) {
            if (session !== this.session) {
                return;
            }
            this.nativeRunning = false;
            const message = error instanceof Error && error.message
                ? error.message
                : "";
            if (message.toLowerCase().includes("permission") ||
                message.toLowerCase().includes("denied")) {
                this.options.onError("permission-denied", "Accès à la caméra refusé. Autorisez-le dans les réglages.");
                return;
            }
            this.options.onError("camera-error", message || "Impossible de démarrer le scanner caméra.");
        }
    }
    prepareNativeWebView() {
        document.documentElement.style.background = "transparent";
        document.body.style.background = "transparent";
        document.documentElement.classList.add("ejden-native-scanner-active");
        document.body.classList.add("ejden-native-scanner-active");
    }
    restoreNativeWebView() {
        document.documentElement.style.background = "";
        document.body.style.background = "";
        document.documentElement.classList.remove("ejden-native-scanner-active");
        document.body.classList.remove("ejden-native-scanner-active");
    }
    /* ========================================
       WEB
    ======================================== */
    async startWeb(session) {
        if (typeof navigator.mediaDevices?.getUserMedia !==
            "function") {
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
                video: {
                    facingMode: {
                        ideal: "environment"
                    }
                },
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
    stopWeb() {
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
    isTorchSupported() {
        if (isNativePlatform()) {
            return this.nativeRunning;
        }
        const track = this.stream?.getVideoTracks()[0];
        if (!track ||
            typeof track.getCapabilities !== "function") {
            return false;
        }
        const capabilities = track.getCapabilities();
        return capabilities.torch === true;
    }
    async setTorch(on) {
        if (isNativePlatform()) {
            return false;
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
                    }
                ]
            });
            return true;
        }
        catch {
            return false;
        }
    }
    /* ========================================
       WEB DETECTION
    ======================================== */
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
        const name = error instanceof DOMException
            ? error.name
            : "";
        if (name === "NotAllowedError" ||
            name === "SecurityError") {
            this.options.onError("permission-denied", "Accès à la caméra refusé. Autorisez-le dans les réglages.");
            return;
        }
        if (name === "NotFoundError" ||
            name === "OverconstrainedError") {
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
            time - this.lastAnalysis <
                DETECTION_INTERVAL ||
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
            if (session !== this.session ||
                results.length === 0) {
                return;
            }
            const rawValue = results[0].rawValue ?? "";
            const code = normalizeBarcode(rawValue);
            const now = Date.now();
            if (!code) {
                return;
            }
            if (code === this.lastCode &&
                now - this.lastCodeTime <
                    SAME_CODE_COOLDOWN) {
                return;
            }
            this.lastCode = code;
            this.lastCodeTime = now;
            this.options.onDetect(code);
        }
        catch {
            // Image illisible : prochaine analyse.
        }
        finally {
            this.analysing = false;
        }
    }
}
//# sourceMappingURL=scanner.js.map