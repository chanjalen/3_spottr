import logging

from config.celery import app

logger = logging.getLogger(__name__)


@app.task(bind=True, max_retries=3, default_retry_delay=5)
def fanout_group_inbox(self, message_id, group_id, sender_id):
    """
    Async: update InboxEntry for all group members after a group message.
    DB work: 4 queries regardless of group size (get message, bulk_create, UPDATE x2, aggregate).
    Redis: 1 publish per non-sender (unavoidable fan-out).
    """
    try:
        from messaging.models import Message, InboxEntry
        from groups.models import GroupMember
        from django.db.models import F, Sum, Q

        message = Message.objects.get(id=message_id)
        member_ids = list(
            GroupMember.objects.filter(group_id=group_id)
            .values_list('user_id', flat=True)
        )

        # Step 1: create entries for members who don't have one yet
        InboxEntry.objects.bulk_create([
            InboxEntry(
                user_id=uid,
                conversation_type='group',
                group_id=group_id,
                latest_message_id=message.id,
                latest_message_at=message.created_at,
                unread_count=0,
            )
            for uid in member_ids
        ], ignore_conflicts=True)

        # Step 2: update content for all members
        InboxEntry.objects.filter(
            conversation_type='group', group_id=group_id, user_id__in=member_ids
        ).update(
            latest_message_id=message.id,
            latest_message_at=message.created_at,
        )

        # Step 3: atomic unread increment for non-senders
        InboxEntry.objects.filter(
            conversation_type='group', group_id=group_id, user_id__in=member_ids
        ).exclude(user_id=sender_id).update(unread_count=F('unread_count') + 1)

        # Step 4: push unread_update to non-senders.
        # One bulk aggregate query instead of N individual get_unread_count calls.
        non_sender_ids = [uid for uid in member_ids if str(uid) != str(sender_id)]
        if not non_sender_ids:
            return

        unread_rows = (
            InboxEntry.objects
            .filter(user_id__in=non_sender_ids)
            .values('user_id')
            .annotate(
                dm=Sum('unread_count', filter=Q(conversation_type='dm'), default=0),
                group=Sum('unread_count', filter=Q(conversation_type='group'), default=0),
            )
        )
        unread_map = {
            str(row['user_id']): {
                'dm': row['dm'] or 0,
                'group': row['group'] or 0,
                'total': (row['dm'] or 0) + (row['group'] or 0),
            }
            for row in unread_rows
        }

        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer:
            send = async_to_sync(channel_layer.group_send)
            for uid in non_sender_ids:
                counts = unread_map.get(str(uid), {'dm': 0, 'group': 0, 'total': 0})
                try:
                    send(
                        f"dm_{str(uid).replace('-', '')}",
                        {'type': 'unread_update', 'counts': counts},
                    )
                except Exception as exc:
                    logger.warning("Unread push to user %s failed: %s", uid, exc)

    except Exception as exc:
        raise self.retry(exc=exc)
