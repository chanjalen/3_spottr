import django.db.models.deletion
import django.utils.timezone
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('groups', '0001_initial'),
        ('messaging', '0007_message_join_request'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='InboxEntry',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('conversation_type', models.CharField(choices=[('dm', 'DM'), ('group', 'Group')], max_length=5)),
                ('latest_message_at', models.DateTimeField(blank=True, null=True)),
                ('unread_count', models.PositiveIntegerField(default=0)),
                ('group', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='inbox_entries', to='groups.group')),
                ('latest_message', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='messaging.message')),
                ('partner', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='inbox_entries', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.AddIndex(
            model_name='inboxentry',
            index=models.Index(fields=['user', '-latest_message_at'], name='idx_inbox_user_time'),
        ),
        migrations.AddConstraint(
            model_name='inboxentry',
            constraint=models.UniqueConstraint(condition=models.Q(partner__isnull=False), fields=['user', 'partner'], name='unique_inbox_dm'),
        ),
        migrations.AddConstraint(
            model_name='inboxentry',
            constraint=models.UniqueConstraint(condition=models.Q(group__isnull=False), fields=['user', 'group'], name='unique_inbox_group'),
        ),
    ]
