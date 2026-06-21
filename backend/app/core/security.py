import hashlib
import secrets


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}${hashed}"


def verify_password(password: str, hashed_password: str) -> bool:
    try:
        salt, stored_hash = hashed_password.split("$", 1)
        computed_hash = hashlib.sha256((salt + password).encode()).hexdigest()
        return computed_hash == stored_hash
    except (ValueError, IndexError):
        return False
