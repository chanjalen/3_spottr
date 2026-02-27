from django.db import migrations, models


def mark_existing_users_verified(apps, schema_editor):
    """
    Existing users are already through the signup flow — mark them as
    email-verified and fully onboarded so they go straight to MainTabs.
    """
    User = apps.get_model('accounts', 'User')
    User.objects.all().update(is_email_verified=True, onboarding_step=5)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_remove_user_enrolled_gym_user_enrolled_gyms'),
    ]

    operations = [
        # 1. Make phone_number optional
        migrations.AlterField(
            model_name='user',
            name='phone_number',
            field=models.CharField(blank=True, max_length=20, null=True, unique=True),
        ),
        # 2. Make display_name optional with empty default
        migrations.AlterField(
            model_name='user',
            name='display_name',
            field=models.CharField(blank=True, default='', max_length=50),
        ),
        # 3. Add email verification fields
        migrations.AddField(
            model_name='user',
            name='is_email_verified',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='user',
            name='email_verification_token',
            field=models.CharField(blank=True, max_length=64, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='email_verification_token_expires',
            field=models.DateTimeField(blank=True, null=True),
        ),
        # 4. Add onboarding step (default=5 so new rows start verified/complete)
        migrations.AddField(
            model_name='user',
            name='onboarding_step',
            field=models.IntegerField(default=5),
        ),
        # 5. Data migration: treat all pre-existing rows as verified + fully onboarded
        migrations.RunPython(mark_existing_users_verified, migrations.RunPython.noop),
    ]
