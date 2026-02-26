from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Add a composite index on MessageRead(user_id, message_id).

    The unread count query pattern is:
      SELECT COUNT(*) FROM messaging_message
      WHERE recipient_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM messaging_messageread
        WHERE user_id = $1 AND message_id = messaging_message.id
      )

    The existing idx_read_receipt_user index is on (user, -read_at) and does
    not include message_id, so Postgres can't do an index-only lookup for the
    EXISTS subquery. A (user_id, message_id) index lets it resolve each EXISTS
    with a single index seek instead of a scan + filter.

    Note: unique_read_receipt already enforces uniqueness on (message, user),
    but its key order (message_id first) is sub-optimal when user_id is the
    selective constant in the WHERE clause.
    """

    dependencies = [
        ('messaging', '0009_backfill_inboxentry'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='messageread',
            index=models.Index(
                fields=['user', 'message'],
                name='idx_messageread_user_message',
            ),
        ),
    ]
