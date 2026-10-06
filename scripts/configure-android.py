from pathlib import Path

MANIFEST = Path("android/app/src/main/AndroidManifest.xml")


def add_permission(text, permission):
    if permission in text:
        return text

    marker = "</manifest>"

    if marker not in text:
        raise SystemExit("Balise </manifest> introuvable")

    line = f'    <uses-permission android:name="{permission}" />\n'

    return text.replace(
        marker,
        line + marker,
        1
    )


def add_metadata(text, name, value):
    if name in text:
        return text

    marker = "</application>"

    if marker not in text:
        raise SystemExit("Balise </application> introuvable")

    metadata = (
        f'        <meta-data '
        f'android:name="{name}" '
        f'android:value="{value}" />\n'
    )

    return text.replace(
        marker,
        metadata + "    " + marker,
        1
    )


if not MANIFEST.is_file():
    raise SystemExit(
        f"Manifest Android introuvable : {MANIFEST}"
    )


text = MANIFEST.read_text(encoding="utf-8")

# Caméra utilisée par le scanner EJDEN.
text = add_permission(
    text,
    "android.permission.CAMERA"
)

# Modèle ML Kit utilisé par startScan().
text = add_metadata(
    text,
    "com.google.mlkit.vision.DEPENDENCIES",
    "barcode_ui"
)

MANIFEST.write_text(
    text,
    encoding="utf-8"
)

print("=== Configuration Android EJDEN ===")
print("CAMERA : OK")
print("ML Kit barcode_ui : OK")
