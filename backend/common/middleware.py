from rest_framework.authtoken.models import Token


class TokenAuthMiddleware:
    """
    Reads the Authorization: Token <key> header and sets request.user
    so that @login_required views work for mobile token-authenticated clients.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.user.is_authenticated:
            auth_header = request.META.get('HTTP_AUTHORIZATION', '')
            if auth_header.startswith('Token '):
                key = auth_header.split(' ', 1)[1].strip()
                try:
                    token = Token.objects.select_related('user').get(key=key)
                    request.user = token.user
                except Token.DoesNotExist:
                    pass

        return self.get_response(request)
