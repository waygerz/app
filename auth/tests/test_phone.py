"""Phone canonicalization (US-only E.164)."""
import pytest

from app.services.service_auth import InvalidPhone, normalize_phone as normalize


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("9042398484", "+19042398484"),       # bare 10-digit -> US
        ("(904) 993-6889", "+19049936889"),   # formatted
        ("904-434-9877", "+19044349877"),      # dashes
        ("+1 904 599 0351", "+19045990351"),  # already +1, spaced
        ("19046310661", "+19046310661"),       # leading 1, no +
    ],
)
def test_normalize_us_variants(raw, expected):
    assert normalize(raw) == expected


@pytest.mark.parametrize("raw", ["", None, "12345", "abcdefg", "+447911123456", "555"])
def test_normalize_rejects_invalid(raw):
    with pytest.raises(InvalidPhone):
        normalize(raw)
