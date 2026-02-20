from rest_framework import serializers
from .models import Message, MessageRead


# ---------------------------------------------------------------------------
# Output serializers
# ---------------------------------------------------------------------------

class SharedPostSerializer(serializers.Serializer):
    """Full serializer for a shared post displayed in chat."""
    id = serializers.CharField()
    item_type = serializers.SerializerMethodField()
    detail_url = serializers.SerializerMethodField()
    author_username = serializers.SerializerMethodField()
    author_display_name = serializers.SerializerMethodField()
    author_avatar_url = serializers.SerializerMethodField()
    description = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    photo_url = serializers.SerializerMethodField()
    video_url = serializers.SerializerMethodField()
    like_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()
    workout = serializers.SerializerMethodField()
    personal_record = serializers.SerializerMethodField()

    def get_item_type(self, obj):
        if hasattr(obj, 'workout_id') and obj.workout_id:
            return 'workout'
        return 'post'

    def get_detail_url(self, obj):
        return f'/social/post/{obj.id}/view/'

    def get_author_username(self, obj):
        return obj.user.username if obj.user else None

    def get_author_display_name(self, obj):
        return obj.user.display_name if obj.user else None

    def get_author_avatar_url(self, obj):
        return obj.user.avatar_url if obj.user else None

    def get_photo_url(self, obj):
        if obj.photo:
            from media.utils import build_media_url
            return build_media_url(obj.photo.name)
        return None

    def get_video_url(self, obj):
        if obj.video:
            from media.utils import build_media_url
            return build_media_url(obj.video.name)
        return None

    def get_like_count(self, obj):
        from social.models import Reaction
        return Reaction.objects.filter(post=obj).count()

    def get_comment_count(self, obj):
        from social.models import Comment
        return Comment.objects.filter(post=obj).count()

    def get_workout(self, obj):
        if not obj.workout:
            return None
        workout = obj.workout
        from workouts.models import Exercise, ExerciseSet
        exercises = Exercise.objects.filter(workout=workout)
        total_sets = ExerciseSet.objects.filter(exercise__workout=workout).count()

        if workout.duration:
            total_seconds = int(workout.duration.total_seconds())
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            duration_str = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"
        else:
            duration_str = "--"

        return {
            'name': workout.name,
            'duration': duration_str,
            'exercise_count': exercises.count(),
            'total_sets': total_sets,
            'exercises': [e.name for e in exercises[:3]],
        }

    def get_personal_record(self, obj):
        from workouts.models import PersonalRecord
        pr = PersonalRecord.objects.filter(post=obj).first()
        if pr:
            return {
                'exercise_name': pr.exercise_name,
                'value': pr.value,
                'unit': pr.unit,
            }
        return None


class SharedCheckinSerializer(serializers.Serializer):
    """Full serializer for a shared check-in displayed in chat."""
    id = serializers.CharField()
    item_type = serializers.SerializerMethodField()
    detail_url = serializers.SerializerMethodField()
    author_username = serializers.SerializerMethodField()
    author_display_name = serializers.SerializerMethodField()
    author_avatar_url = serializers.SerializerMethodField()
    description = serializers.CharField(allow_blank=True, allow_null=True, required=False)
    photo_url = serializers.SerializerMethodField()
    workout_type = serializers.SerializerMethodField()
    location_name = serializers.SerializerMethodField()
    like_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()

    def get_item_type(self, obj):
        return 'checkin'

    def get_detail_url(self, obj):
        return f'/social/checkin/{obj.id}/view/'

    def get_author_username(self, obj):
        return obj.user.username if obj.user else None

    def get_author_display_name(self, obj):
        return obj.user.display_name if obj.user else None

    def get_author_avatar_url(self, obj):
        return obj.user.avatar_url if obj.user else None

    def get_photo_url(self, obj):
        from media.utils import get_media_url, build_media_url
        url = get_media_url('quick_workout', str(obj.id))
        if url:
            return url
        from django.core.files.storage import default_storage
        path = f'checkins/{obj.id}.jpg'
        try:
            if default_storage.exists(path):
                return build_media_url(path)
        except Exception:
            pass
        return None

    def get_workout_type(self, obj):
        return obj.type.replace('_', ' ').title() if obj.type else ''

    def get_location_name(self, obj):
        return obj.location_name or (obj.location.name if obj.location else '')

    def get_like_count(self, obj):
        from social.models import Reaction
        return Reaction.objects.filter(quick_workout=obj).count()

    def get_comment_count(self, obj):
        from social.models import Comment
        return Comment.objects.filter(quick_workout=obj).count()


class MessageListSerializer(serializers.ModelSerializer):
    """
    Serializer for message lists. Returns full shared post/check-in data inline
    so post cards render directly in the chat thread.
    """
    sender_username = serializers.SerializerMethodField()
    sender_avatar_url = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()
    shared_post_id = serializers.CharField(source='post_id', read_only=True)
    shared_post = serializers.SerializerMethodField()
    join_request_id = serializers.SerializerMethodField()
    join_request_status = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            'id', 'sender', 'sender_username', 'sender_avatar_url',
            'content', 'is_request', 'is_system', 'is_read',
            'created_at', 'shared_post_id', 'shared_post',
            'join_request_id', 'join_request_status',
        ]

    def get_sender_username(self, obj):
        return obj.sender.username if obj.sender else None

    def get_sender_avatar_url(self, obj):
        return obj.sender.avatar_url if obj.sender else None

    def get_is_read(self, obj):
        # Use prefetched receipts (to_attr='user_read_receipts') when available
        if hasattr(obj, 'user_read_receipts'):
            return bool(obj.user_read_receipts)
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.read_receipts.filter(user=request.user).exists()
        return False

    def get_join_request_id(self, obj):
        return str(obj.join_request_id) if obj.join_request_id else None

    def get_join_request_status(self, obj):
        if obj.join_request_id and obj.join_request:
            return obj.join_request.status
        return None

    def get_shared_post(self, obj):
        try:
            if obj.post:
                return SharedPostSerializer(obj.post).data
            if obj.quick_workout:
                return SharedCheckinSerializer(obj.quick_workout).data
        except Exception:
            return None
        return None


class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    recipient_username = serializers.SerializerMethodField()
    group_name = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()
    shared_post_id = serializers.CharField(source='post_id', read_only=True)
    shared_post = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            'id', 'sender', 'sender_username',
            'recipient', 'recipient_username',
            'group', 'group_name',
            'content', 'shared_post_id', 'shared_post',
            'is_request', 'is_read', 'created_at',
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

    def get_shared_post(self, obj):
        try:
            if obj.post:
                return SharedPostSerializer(obj.post).data
            if obj.quick_workout:
                return SharedCheckinSerializer(obj.quick_workout).data
        except Exception:
            return None
        return None


class ConversationSerializer(serializers.Serializer):
    """Represents a conversation preview (latest message + partner info)."""
    partner_id = serializers.CharField()
    partner_username = serializers.CharField()
    latest_message = MessageListSerializer()
    unread_count = serializers.IntegerField()


class GroupConversationSerializer(serializers.Serializer):
    """Represents a group conversation preview."""
    group_id = serializers.CharField()
    group_name = serializers.CharField()
    group_streak = serializers.IntegerField()
    latest_message = MessageListSerializer()
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
    quick_workout_id = serializers.CharField(required=False, default=None)


class SendGroupMessageSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=5000)
    post_id = serializers.CharField(required=False, default=None)
    quick_workout_id = serializers.CharField(required=False, default=None)


class MarkReadSerializer(serializers.Serializer):
    message_ids = serializers.ListField(
        child=serializers.CharField(),
        max_length=100,
    )
