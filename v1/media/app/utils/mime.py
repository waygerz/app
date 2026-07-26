"""Content-type allowlist and magic-byte sniffing."""

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": (b"\xff\xd8\xff", 3),
    "image/png": (b"\x89PNG\r\n\x1a\n", 8),
    "image/gif": (b"GIF87a", 6),  # also checked: GIF89a
    "image/webp": (b"RIFF", 4),
}

GIF_SIGS = (b"GIF87a", b"GIF89a")


def extension_for(content_type: str) -> str:
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
    }.get(content_type, ".bin")


def max_bytes_for(content_type: str, *, image_limit: int, gif_limit: int) -> int:
    if content_type == "image/gif":
        return gif_limit
    return image_limit


def sniff_content_type(header: bytes) -> str | None:
    if len(header) >= 3 and header[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if len(header) >= 8 and header[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(header) >= 6 and header[:6] in GIF_SIGS:
        return "image/gif"
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return "image/webp"
    return None


def matches_declared(content_type: str, header: bytes) -> bool:
    sniffed = sniff_content_type(header)
    return sniffed == content_type