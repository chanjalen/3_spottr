from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('messaging', '0005_optimize_message_indexes'),
    ]

    operations = [
        migrations.AddField(
            model_name='message',
            name='is_system',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='message',
            name='sender',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='sent_messages',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
