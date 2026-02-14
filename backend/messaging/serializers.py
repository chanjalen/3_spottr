from rest_framework import serializers
from .models import Message, MessageRead


# ---------------------------------------------------------------------------
# Output serializers
# ---------------------------------------------------------------------------

class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    recipient_username = serializers.SerializerMethodField()
    group_name = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()
    shared_post_id = serializers.CharField(source='post_id', read_only=True)

    class Meta:
        model = Message
        fields = [
            'id', 'sender', 'sender_username',
            'recipient', 'recipient_username',
            'group', 'group_name',
            'content', 'shared_post_id',
            'is_read', 'created_at',
        ]

    def get_recipient_username(self, obj):
        return obj.recipient.username if obj.recipient else None

    def get_group_name(self, obj):
        return obj.group.name if obj.group else None

    def get_is_read(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.read_receipts.filter(user=request.user).exists()
        return False


class ConversationSerializer(serializers.Serializer):
    """Represents a conversation preview (latest message + partner info)."""
    partner_id = serializers.CharField()
    partner_username = serializers.CharField()
    latest_message = MessageSerializer()
    unread_count = serializers.IntegerField()


class GroupConversationSerializer(serializers.Serializer):
    """Represents a group conversation preview."""
    group_id = serializers.CharField()
    group_name = serializers.CharField()
    latest_message = MessageSerializer()
    unread_count = serializers.IntegerField()


class UnreadCountSerializer(serializers.Serializer):
    dm = serializers.IntegerField()
    group = serializers.IntegerField()
    total = serializers.IntegerField()


# ---------------------------------------------------------------------------
# Input serializers
# ---------------------------------------------------------------------------

class SendDMSerializer(serializers.Serializer):
    recipient_id = serializers.CharField()
    content = serializers.CharField(max_length=5000)
    post_id = serializers.CharField(required=False, default=None)


class SendGroupMessageSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=5000)
    post_id = serializers.CharField(required=False, default=None)


class MarkReadSerializer(serializers.Serializer):
    message_ids = serializers.ListField(
        child=serializers.CharField(),
        max_length=100,
    )
