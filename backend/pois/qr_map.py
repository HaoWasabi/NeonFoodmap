"""Short-lived signed tokens for /map?poi=&qr= deep links (partner-printed QR)."""

from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

# QR printed from partner portal remains valid for 1 hour.
MAP_QR_MAX_AGE = 3600

_SALT = 'poi-map-qr-v1'


def sign_poi_map_qr(poi_id: int) -> str:
    signer = TimestampSigner(salt=_SALT)
    return signer.sign(str(poi_id))


def verify_poi_map_qr(token: str) -> int:
    """Return POI id if token is valid and not expired; raises BadSignature / SignatureExpired."""
    signer = TimestampSigner(salt=_SALT)
    value = signer.unsign(token, max_age=MAP_QR_MAX_AGE)
    return int(value)
