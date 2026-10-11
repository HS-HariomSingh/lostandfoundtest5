import os
import urllib.parse
from typing import Optional, Dict, Any

def get_aiven_db_config() -> Dict[str, Any]:
    uri = os.getenv("AIVEN_MYSQL_URL") or os.getenv("AIVEN_SERVICE_URI")
    if uri:
        parsed = urllib.parse.urlparse(uri)
        return {
            "host": parsed.hostname,
            "port": parsed.port or 3306,
            "user": parsed.username or "avnadmin",
            "password": parsed.password or "",
            "database": parsed.path.lstrip("/") or "lostandfound_db",
            "ssl_mode": "REQUIRED",
        }

    return {
        "host": os.getenv("AIVEN_MYSQL_HOST", "localhost"),
        "port": int(os.getenv("AIVEN_MYSQL_PORT", "3306")),
        "user": os.getenv("AIVEN_MYSQL_USER", "avnadmin"),
        "password": os.getenv("AIVEN_MYSQL_PASSWORD", ""),
        "database": os.getenv("AIVEN_MYSQL_DATABASE", "lostandfound_db"),
        "ssl_mode": os.getenv("AIVEN_MYSQL_SSL_MODE", "REQUIRED"),
    }
