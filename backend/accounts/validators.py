from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _


class PasswordComplexityValidator:
    """
    Require at least one uppercase letter, one lowercase letter, and one digit.
    """

    def validate(self, password, user=None):
        if not any(c.isupper() for c in password):
            raise ValidationError(
                _('Password must contain at least one uppercase letter.'),
                code='password_no_upper',
            )
        if not any(c.islower() for c in password):
            raise ValidationError(
                _('Password must contain at least one lowercase letter.'),
                code='password_no_lower',
            )
        if not any(c.isdigit() for c in password):
            raise ValidationError(
                _('Password must contain at least one digit.'),
                code='password_no_digit',
            )

    def get_help_text(self):
        return _(
            'Your password must contain at least one uppercase letter, '
            'one lowercase letter, and one digit.'
        )
