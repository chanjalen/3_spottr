import secrets

from django.contrib.auth.models import BaseUserManager


class UserManager(BaseUserManager):
    def _generate_username(self):
        """Generate a unique temporary username like user_a3f2b1c4."""
        for _ in range(5):
            username = 'user_' + secrets.token_hex(4)
            if not self.model.objects.filter(username=username).exists():
                return username
        raise ValueError('Could not generate a unique username — please try again.')

    def create_user(self, email, birthday, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')

        email = self.normalize_email(email)

        # Auto-generate a temporary username if none provided
        username = extra_fields.pop('username', None) or self._generate_username()

        user = self.model(
            username=username,
            email=email,
            birthday=birthday,
            **extra_fields,
        )
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, email, birthday, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('is_email_verified', True)
        extra_fields.setdefault('onboarding_step', 5)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(email, birthday, password, username=username, **extra_fields)
