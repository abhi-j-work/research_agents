# Backend/redis_cache.py

import os
import json
import redis

# --- NEW: Add a flag to explicitly enable/disable Redis ---
# The code will only try to connect if USE_REDIS is set to 'true' in your .env file.
# By default, we now assume it's off if not specified.
USE_REDIS = os.getenv("USE_REDIS", "false").lower() == "true"
r = None # Initialize the Redis client variable to None

if USE_REDIS:
    try:
        REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        r = redis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=2)
        r.ping() # Check the connection
        print("INFO: Redis connection successful. Caching is ENABLED.")
    except redis.exceptions.ConnectionError as e:
        # If connection fails even when enabled, print a clear warning.
        print(f"WARNING: USE_REDIS is 'true' but connection failed. Caching is DISABLED. Error: {e}")
        r = None # Ensure client is None on failure
else:
    # If not enabled, print a simple info message instead of a warning.
    print("INFO: USE_REDIS is not 'true'. Caching is DISABLED.")

def cache_set(key: str, value: any, expire_seconds: int = 3600):
    """Caches a value in Redis if the connection is active."""
    if r: # This check now respects the USE_REDIS flag
        try:
            if isinstance(value, dict) or isinstance(value, list):
                value = json.dumps(value)
            r.set(key, value, ex=expire_seconds)
        except Exception as e:
            print(f"Redis SET failed for key '{key}': {e}")

def cache_get(key: str) -> any:
    """Retrieves a value from Redis if the connection is active."""
    if r: # This check now respects the USE_REDIS flag
        try:
            cached_value = r.get(key)
            if cached_value:
                try:
                    # Try to parse as JSON, otherwise return the raw string
                    return json.loads(cached_value)
                except json.JSONDecodeError:
                    return cached_value
        except Exception as e:
            print(f"Redis GET failed for key '{key}': {e}")
    return None