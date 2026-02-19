from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('messaging', '0004_add_is_request_to_message'),
    ]

    operations = [
        # Remove old single-field indexes
        migrations.RemoveIndex(
            model_name='message',
            name='idx_message_recipient',
        ),
        migrations.RemoveIndex(
            model_name='message',
            name='idx_message_group',
        ),
        migrations.RemoveIndex(
            model_name='message',
            name='idx_message_sender',
        ),
        # Add composite cursor-optimized indexes
        migrations.AddIndex(
            model_name='message',
            index=models.Index(
                fields=['group', '-created_at', '-id'],
                name='idx_message_group_cursor',
            ),
        ),
        migrations.AddIndex(
            model_name='message',
            index=models.Index(
                fields=['sender', 'recipient', '-created_at', '-id'],
                name='idx_message_dm_sent',
            ),
        ),
        migrations.AddIndex(
            model_name='message',
            index=models.Index(
                fields=['recipient', 'sender', '-created_at', '-id'],
                name='idx_message_dm_recv',
            ),
        ),
    ]
