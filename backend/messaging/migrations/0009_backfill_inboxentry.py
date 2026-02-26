from django.db import migrations
from django.db.models import Q


def backfill(apps, schema_editor):
    Message = apps.get_model('messaging', 'Message')
    InboxEntry = apps.get_model('messaging', 'InboxEntry')
    GroupMember = apps.get_model('groups', 'GroupMember')

    # --- DMs ---
    sent = (
        Message.objects.filter(recipient__isnull=False)
        .values_list('sender_id', 'recipient_id')
        .distinct()
    )
    convo_keys = set()
    for sender_id, recipient_id in sent:
        key = tuple(sorted([str(sender_id), str(recipient_id)]))
        convo_keys.add(key)

    for user_a_id, user_b_id in convo_keys:
        for user_id, partner_id in [(user_a_id, user_b_id), (user_b_id, user_a_id)]:
            latest = (
                Message.objects.filter(
                    Q(sender_id=user_id, recipient_id=partner_id)
                    | Q(sender_id=partner_id, recipient_id=user_id)
                )
                .order_by('-created_at', '-id')
                .first()
            )
            if not latest:
                continue
            unread = (
                Message.objects.filter(sender_id=partner_id, recipient_id=user_id)
                .exclude(read_receipts__user_id=user_id)
                .count()
            )
            InboxEntry.objects.get_or_create(
                user_id=user_id,
                conversation_type='dm',
                partner_id=partner_id,
                defaults={
                    'latest_message': latest,
                    'latest_message_at': latest.created_at,
                    'unread_count': unread,
                },
            )

    # --- Groups ---
    for membership in GroupMember.objects.select_related('group'):
        latest = (
            Message.objects.filter(group_id=membership.group_id)
            .order_by('-created_at', '-id')
            .first()
        )
        if not latest:
            continue
        unread = (
            Message.objects.filter(group_id=membership.group_id)
            .exclude(sender_id=membership.user_id)
            .exclude(read_receipts__user_id=membership.user_id)
            .count()
        )
        InboxEntry.objects.get_or_create(
            user_id=membership.user_id,
            conversation_type='group',
            group_id=membership.group_id,
            defaults={
                'latest_message': latest,
                'latest_message_at': latest.created_at,
                'unread_count': unread,
            },
        )


def reverse_backfill(apps, schema_editor):
    InboxEntry = apps.get_model('messaging', 'InboxEntry')
    InboxEntry.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('messaging', '0008_inboxentry'),
    ]

    operations = [
        migrations.RunPython(backfill, reverse_backfill),
    ]
