from rest_framework import serializers
from django.db.models import Count

from organizations.models import (
    Organization, OrgMember, OrgInviteCode, OrgJoinRequest,
    Announcement, AnnouncementPoll, AnnouncementPollOption,
)


# ---------------------------------------------------------------------------
# Output serializers
# ---------------------------------------------------------------------------

class OrgMemberSerializer(serializers.ModelSerializer):
    user_id = serializers.CharField(source='user.id')
    username = serializers.CharField(source='user.username')
    display_name = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = OrgMember
        fields = ['user_id', 'username', 'display_name', 'avatar_url', 'role', 'joined_at']

    def get_display_name(self, obj):
        return obj.user.display_name or obj.user.username

    def get_avatar_url(self, obj):
        return obj.user.avatar_url or None


class OrgInviteCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrgInviteCode
        fields = ['id', 'code', 'is_active', 'created_at']


class OrgJoinRequestSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    display_name = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = OrgJoinRequest
        fields = ['id', 'username', 'display_name', 'avatar_url', 'message', 'status', 'created_at']

    def get_display_name(self, obj):
        return obj.user.display_name or obj.user.username

    def get_avatar_url(self, obj):
        return obj.user.avatar_url or None


class OrgListSerializer(serializers.ModelSerializer):
    """Compact representation for lists/discovery."""
    avatar_url = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()
    user_role = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    latest_announcement = serializers.SerializerMethodField()
    pending_request = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = ['id', 'name', 'description', 'privacy', 'avatar_url', 'member_count', 'user_role', 'unread_count', 'latest_announcement', 'pending_request', 'created_at']

    def get_avatar_url(self, obj):
        return obj.avatar_url

    def get_member_count(self, obj):
        return obj.members.count()

    def get_user_role(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            member = OrgMember.objects.filter(org=obj, user=request.user).first()
            return member.role if member else None
        return None

    def get_unread_count(self, obj):
        unread_map = self.context.get('unread_map', {})
        return unread_map.get(str(obj.id), 0)

    def get_latest_announcement(self, obj):
        latest_ann_map = self.context.get('latest_ann_map', {})
        return latest_ann_map.get(str(obj.id))  # None if org has no announcements

    def get_pending_request(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return OrgJoinRequest.objects.filter(org=obj, user=request.user, status='pending').exists()
        return False


class OrgDetailSerializer(OrgListSerializer):
    """Full detail including creator info and invite code."""
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    invite_code = serializers.SerializerMethodField()

    class Meta(OrgListSerializer.Meta):
        fields = OrgListSerializer.Meta.fields + ['created_by_username', 'invite_code']

    def get_invite_code(self, obj):
        code = obj.invite_codes.filter(is_active=True).first()
        return code.code if code else None


# ---------------------------------------------------------------------------
# Announcement serializers
# ---------------------------------------------------------------------------

class AnnouncementMediaSerializer(serializers.Serializer):
    url = serializers.CharField()
    kind = serializers.CharField()
    thumbnail_url = serializers.CharField(allow_null=True)
    width = serializers.IntegerField(allow_null=True)
    height = serializers.IntegerField(allow_null=True)


class AnnouncementReactionSerializer(serializers.Serializer):
    """Grouped reaction summary: one row per emoji."""
    emoji = serializers.CharField()
    count = serializers.IntegerField()
    user_reacted = serializers.BooleanField()


class AnnouncementPollOptionSerializer(serializers.ModelSerializer):
    user_voted = serializers.SerializerMethodField()

    class Meta:
        model = AnnouncementPollOption
        fields = ['id', 'text', 'votes', 'order', 'user_voted']

    def get_user_voted(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        voted_option_id = self.context.get('user_voted_option_id')
        return str(obj.id) == str(voted_option_id) if voted_option_id else False


class AnnouncementPollSerializer(serializers.ModelSerializer):
    options = serializers.SerializerMethodField()
    is_active = serializers.BooleanField(read_only=True)
    total_votes = serializers.SerializerMethodField()
    user_voted_option_id = serializers.SerializerMethodField()

    class Meta:
        model = AnnouncementPoll
        fields = ['id', 'question', 'is_active', 'ends_at', 'total_votes', 'user_voted_option_id', 'options']

    def get_total_votes(self, obj):
        return obj.get_total_votes()

    def get_user_voted_option_id(self, obj):
        votes = getattr(obj, 'requesting_user_votes', None)
        if votes is not None:
            return str(votes[0].option_id) if votes else None
        # Fallback: per-announcement query (no prefetch)
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        vote = obj.user_votes.filter(user=request.user).select_related('option').first()
        return str(vote.option_id) if vote else None

    def get_options(self, obj):
        user_voted_option_id = self.get_user_voted_option_id(obj)
        ctx = {**self.context, 'user_voted_option_id': user_voted_option_id}
        return AnnouncementPollOptionSerializer(
            obj.options.all(), many=True, context=ctx
        ).data


class AnnouncementSerializer(serializers.ModelSerializer):
    author_id = serializers.CharField(source='author.id', read_only=True)
    author_username = serializers.CharField(source='author.username', read_only=True)
    author_display_name = serializers.SerializerMethodField()
    author_avatar_url = serializers.SerializerMethodField()
    media = serializers.SerializerMethodField()
    poll = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Announcement
        fields = [
            'id', 'org', 'author_id', 'author_username', 'author_display_name',
            'author_avatar_url', 'content', 'media', 'poll', 'reactions', 'created_at',
            'is_read',
        ]

    def get_author_display_name(self, obj):
        return obj.author.display_name or obj.author.username

    def get_author_avatar_url(self, obj):
        avatar_map = self.context.get('author_avatar_map')
        if avatar_map is not None:
            return avatar_map.get(str(obj.author_id)) or None
        return obj.author.avatar_url or None

    def get_media(self, obj):
        media_map = self.context.get('media_map')
        if media_map is not None:
            return media_map.get(str(obj.id), [])
        # Fallback: per-announcement query (e.g. WS push, no bulk prefetch)
        from media.models import MediaLink
        from django.conf import settings
        links = (
            MediaLink.objects
            .filter(destination_type='announcement', destination_id=str(obj.id), type='inline')
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

    def get_poll(self, obj):
        try:
            poll = obj.poll
        except AnnouncementPoll.DoesNotExist:
            return None
        if poll is None:
            return None
        return AnnouncementPollSerializer(poll, context=self.context).data

    def get_reactions(self, obj):
        reactions = getattr(obj, 'prefetched_reactions', None)
        if reactions is None:
            # Fallback: per-announcement queries (no prefetch, e.g. WS push)
            rows = (
                obj.reactions
                .values('emoji')
                .annotate(count=Count('id'))
                .order_by('-count', 'emoji')
            )
            request = self.context.get('request')
            user_emojis = set()
            if request and request.user.is_authenticated:
                user_emojis = set(
                    obj.reactions
                    .filter(user=request.user)
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

    def get_is_read(self, obj):
        last_read_at = self.context.get('last_read_at')
        if not last_read_at:
            return False
        return obj.created_at <= last_read_at


# ---------------------------------------------------------------------------
# Input serializers
# ---------------------------------------------------------------------------

class CreateOrgSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    description = serializers.CharField(max_length=500, required=False, default='', allow_blank=True)
    privacy = serializers.ChoiceField(choices=['public', 'private'], default='public')


class UpdateOrgSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, required=False)
    description = serializers.CharField(max_length=500, required=False, allow_blank=True)
    privacy = serializers.ChoiceField(choices=['public', 'private'], required=False)


class PollInputSerializer(serializers.Serializer):
    question = serializers.CharField(max_length=280)
    duration_hours = serializers.IntegerField(min_value=1, max_value=168, default=24)
    options = serializers.ListField(
        child=serializers.CharField(max_length=100),
        min_length=2,
        max_length=10,
    )


class CreateAnnouncementSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=5000, required=False, default='')
    media_ids = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        default=list,
        max_length=10,
    )
    poll = PollInputSerializer(required=False, default=None)

    def validate(self, data):
        if not data.get('content') and not data.get('media_ids') and not data.get('poll'):
            raise serializers.ValidationError(
                "An announcement must have at least a text, media, or poll."
            )
        return data


class JoinViaCodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=8)


class JoinRequestSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=500, required=False, default='', allow_blank=True)


class ReactSerializer(serializers.Serializer):
    emoji = serializers.CharField(max_length=8)

    def validate_emoji(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Emoji cannot be empty.")
        if value.isascii() and value.replace(' ', '').isalnum():
            raise serializers.ValidationError("Invalid emoji.")
        return value


class VoteSerializer(serializers.Serializer):
    option_id = serializers.CharField()
