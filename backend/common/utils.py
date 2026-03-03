from django.core.cache import cache


def check_rate_limit(key: str, limit: int, period: int) -> bool:
    """
    Simple cache-based rate limiter. Returns True if the request should be
    allowed, False if it exceeds the limit.

    Uses cache.add (atomic set-if-not-exists) to avoid race conditions on
    the first request in a window.

    Args:
        key: Unique cache key for this user+action (e.g. 'rl:create:user_id').
        limit: Maximum allowed requests in the window.
        period: Window duration in seconds.
    """
    if cache.add(key, 1, period):
        # Key didn't exist — first request in this window
        return True
    count = cache.incr(key)
    return count <= limit
