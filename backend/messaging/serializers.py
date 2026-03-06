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
    poll = serializers.SerializerMethodField()

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

    def get_poll(self, obj):
        try:
            poll = obj.poll
        except Exception:
            return None
        if not poll:
            return None
        total_votes = poll.get_total_votes()
        return {
            'question': poll.question,
            'total_votes': total_votes,
            'is_active': poll.is_active,
            'options': [
                {
                    'id': opt.id,
                    'text': opt.text,
                    'votes': opt.votes,
                }
                for opt in poll.options.all()
            ],
        }


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
    video_url = serializers.SerializerMethodField()
    is_front_camera = serializers.BooleanField()
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
        from media.models import MediaLink
        image_link = MediaLink.objects.filter(
            destination_type='quick_workout',
            destination_id=str(obj.id),
            type='inline',
            asset__kind='image',
        ).select_related('asset').first()
        if image_link:
            return build_media_url(image_link.asset.storage_key)
        from django.core.files.storage import default_storage
        path = f'checkins/{obj.id}.jpg'
        try:
            if default_storage.exists(path):
                return build_media_url(path)
        except Exception:
            pass
        return None

    def get_video_url(self, obj):
        from media.utils import build_media_url
        from media.models import MediaLink
        video_link = MediaLink.objects.filter(
            destination_type='quick_workout',
            destination_id=str(obj.id),
            type='inline',
            asset__kind='video',
        ).select_related('asset').first()
        if video_link:
            return build_media_url(video_link.asset.storage_key)
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


class SharedProfileSerializer(serializers.Serializer):
    """Serializer for a shared user profile card displayed in chat."""
    item_type = serializers.SerializerMethodField()
    username = serializers.CharField()
    display_name = serializers.CharField()
    avatar_url = serializers.SerializerMethodField()
    current_streak = serializers.SerializerMethodField()
    total_workouts = serializers.SerializerMethodField()

    def get_item_type(self, obj):
        return 'profile'

    def get_avatar_url(self, obj):
        return obj.avatar_url if obj else None

    def get_current_streak(self, obj):
        return getattr(obj, 'current_streak', 0) or 0

    def get_total_workouts(self, obj):
        return getattr(obj, 'total_workouts', 0) or 0


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
    shared_profile_card = serializers.SerializerMethodField()
    join_request_id = serializers.SerializerMethodField()
    join_request_status = serializers.SerializerMethodField()
    media = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            'id', 'sender', 'sender_username', 'sender_avatar_url',
            'content', 'is_request', 'is_system', 'is_read',
            'created_at', 'shared_post_id', 'shared_post', 'shared_profile_card',
            'join_request_id', 'join_request_status',
            'media', 'reactions',
        ]

    def get_sender_username(self, obj):
        return obj.sender.username if obj.sender else None

    def get_sender_avatar_url(self, obj):
        avatar_map = self.context.get('sender_avatar_map')
        if avatar_map is not None:
            return avatar_map.get(str(obj.sender_id)) or None
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

    def get_shared_profile_card(self, obj):
        try:
            if obj.shared_profile_id and obj.shared_profile:
                return SharedProfileSerializer(obj.shared_profile).data
        except Exception:
            return None
        return None

    def get_media(self, obj):
        media_map = self.context.get('media_map')
        if media_map is not None:
            return media_map.get(str(obj.id), [])
        # Fallback: per-message query (e.g. WS send path, no bulk prefetch)
        from media.models import MediaLink
        from django.conf import settings
        links = (
            MediaLink.objects
            .filter(destination_type='message', destination_id=str(obj.id), type='inline')
            .select_related('asset')
            .order_by('position')
        )
        result = []
        for link in links:
            asset = link.asset
            thumbnail_url = (
                f"{settings.MEDIA_URL}{asset.thumbnail_key}" if asset.thumbnail_key else None
            )
            result.append({
                'url': asset.url,
                'kind': asset.kind,
                'thumbnail_url': thumbnail_url,
                'width': asset.width,
                'height': asset.height,
            })
        return result

    def get_reactions(self, obj):
        reactions = getattr(obj, 'prefetched_reactions', None)
        if reactions is None:
            # Fallback: original per-message queries (e.g. WS send path, no prefetch)
            from django.db.models import Count
            from messaging.models import MessageReaction
            rows = (
                MessageReaction.objects
                .filter(message=obj)
                .values('emoji')
                .annotate(count=Count('id'))
                .order_by('-count', 'emoji')
            )
            request = self.context.get('request')
            user_emojis = set()
            if request and request.user.is_authenticated:
                user_emojis = set(
                    MessageReaction.objects
                    .filter(message=obj, user=request.user)
                    .values_list('emoji', flat=True)
                )
            return [
                {'emoji': r['emoji'], 'count': r['count'], 'user_reacted': r['emoji'] in user_emojis}
                for r in rows
            ]
        request = self.context.get('request')
        user_id = str(request.user.id) if (request and request.user.is_authenticated) else None
        counts = {}
        user_emojis = set()
        for r in reactions:
            counts[r.emoji] = counts.get(r.emoji, 0) + 1
            if user_id and str(r.user_id) == user_id:
                user_emojis.add(r.emoji)
        return sorted(
            [{'emoji': e, 'count': c, 'user_reacted': e in user_emojis} for e, c in counts.items()],
            key=lambda x: -x['count'],
        )


class MessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    sender_avatar_url = serializers.SerializerMethodField()
    recipient_username = serializers.SerializerMethodField()
    group_name = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()
    shared_post_id = serializers.CharField(source='post_id', read_only=True)
    shared_post = serializers.SerializerMethodField()
    shared_profile_card = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            'id', 'sender', 'sender_username', 'sender_avatar_url',
            'recipient', 'recipient_username',
            'group', 'group_name',
            'content', 'shared_post_id', 'shared_post', 'shared_profile_card',
            'is_request', 'is_read', 'created_at',
        ]

    def get_sender_avatar_url(self, obj):
        return obj.sender.avatar_url if obj.sender else None

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

    def get_shared_profile_card(self, obj):
        try:
            if obj.shared_profile_id and obj.shared_profile:
                return SharedProfileSerializer(obj.shared_profile).data
        except Exception:
            return None
        return None


class ConversationSerializer(serializers.Serializer):
    """Represents a conversation preview (latest message + partner info)."""
    partner_id = serializers.CharField()
    partner_username = serializers.CharField()
    partner_display_name = serializers.CharField()
    partner_avatar_url = serializers.CharField(allow_null=True)
    latest_message = MessageListSerializer()
    unread_count = serializers.IntegerField()
    partner_has_activity_today = serializers.BooleanField()
    preview_text = serializers.CharField(allow_null=True)


class GroupConversationSerializer(serializers.Serializer):
    """Represents a group conversation preview."""
    group_id = serializers.CharField()
    group_name = serializers.CharField()
    group_streak = serializers.IntegerField()
    avatar_url = serializers.CharField(allow_null=True)
    member_count = serializers.IntegerField()
    latest_message = MessageListSerializer(allow_null=True)
    unread_count = serializers.IntegerField()
    preview_text = serializers.CharField(allow_null=True)


class UnreadCountSerializer(serializers.Serializer):
    dm = serializers.IntegerField()
    group = serializers.IntegerField()
    org = serializers.IntegerField()
    total = serializers.IntegerField()


# ---------------------------------------------------------------------------
# Input serializers
# ---------------------------------------------------------------------------

class SendDMSerializer(serializers.Serializer):
    recipient_id = serializers.CharField()
    content = serializers.CharField(max_length=5000, required=False, default='', allow_blank=True)
    post_id = serializers.CharField(required=False, default=None)
    quick_workout_id = serializers.CharField(required=False, default=None)
    media_id = serializers.CharField(required=False, default=None)

    def validate(self, data):
        if not data.get('content') and not data.get('media_id') and not data.get('post_id') and not data.get('quick_workout_id'):
            raise serializers.ValidationError("A message must have content, media, or a shared post.")
        return data


class SendGroupMessageSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=5000, required=False, default='', allow_blank=True)
    post_id = serializers.CharField(required=False, default=None)
    quick_workout_id = serializers.CharField(required=False, default=None)
    media_id = serializers.CharField(required=False, default=None)

    def validate(self, data):
        if not data.get('content') and not data.get('media_id') and not data.get('post_id') and not data.get('quick_workout_id'):
            raise serializers.ValidationError("A message must have content, media, or a shared post.")
        return data


class ReactMessageSerializer(serializers.Serializer):
    emoji = serializers.CharField(max_length=8)

    def validate_emoji(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Emoji cannot be empty.")
        # Reject plain ASCII alphanumeric strings — they are not emoji
        if value.isascii() and value.replace(' ', '').isalnum():
            raise serializers.ValidationError("Invalid emoji.")
        return value


class MarkReadSerializer(serializers.Serializer):
    message_ids = serializers.ListField(
        child=serializers.CharField(),
        max_length=100,
    )
