from django.db import migrations, models


def mark_existing_users_seen(apps, schema_editor):
    """All users that existed before this migration are assumed to have already
    seen (or been exposed to) the tutorial, so we mark them done to avoid
    showing it again on their next login."""
    User = apps.get_model('accounts', 'User')
    User.objects.all().update(has_seen_tutorial=True)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0010_add_expo_push_token'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='has_seen_tutorial',
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(mark_existing_users_seen, migrations.RunPython.noop),
    ]
