from rest_framework import serializers
from .models import Group, GroupMember, GroupInviteCode, GroupJoinRequest


# ---------------------------------------------------------------------------
# Output serializers
# ---------------------------------------------------------------------------

class GroupMemberSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    display_name = serializers.CharField(source='user.display_name', read_only=True)
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = GroupMember
        fields = ['id', 'user', 'username', 'display_name', 'role', 'joined_at', 'avatar_url']
        read_only_fields = ['id', 'user', 'username', 'display_name', 'role', 'joined_at', 'avatar_url']

    def get_avatar_url(self, obj):
        return obj.user.avatar_url or None


class GroupListSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True)
    is_member = serializers.BooleanField(read_only=True, default=False)
    has_pending_request = serializers.BooleanField(read_only=True, default=False)
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = [
            'id', 'name', 'description', 'avatar_url', 'privacy',
            'group_streak', 'longest_group_streak', 'member_count', 'is_member',
            'has_pending_request', 'created_at',
        ]

    def get_avatar_url(self, obj):
        return obj.avatar_url


class GroupDetailSerializer(serializers.ModelSerializer):
    members = GroupMemberSerializer(many=True, read_only=True)
    member_count = serializers.SerializerMethodField()
    is_member = serializers.SerializerMethodField()
    user_role = serializers.SerializerMethodField()
    invite_code = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = [
            'id', 'created_by', 'name', 'description', 'avatar_url', 'privacy',
            'group_streak', 'longest_group_streak', 'members', 'member_count',
            'is_member', 'user_role', 'invite_code', 'created_at', 'updated_at',
        ]

    def get_avatar_url(self, obj):
        return obj.avatar_url

    def get_member_count(self, obj):
        return obj.members.count()

    def get_is_member(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.members.filter(user=request.user).exists()
        return False

    def get_user_role(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            membership = obj.members.filter(user=request.user).first()
            return membership.role if membership else None
        return None

    def get_invite_code(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            if obj.members.filter(user=request.user).exists():
                code = obj.invite_codes.filter(is_active=True).first()
                return code.code if code else None
        return None


class GroupStreakMemberSerializer(serializers.Serializer):
    user_id = serializers.CharField()
    username = serializers.CharField()
    display_name = serializers.CharField()
    avatar_url = serializers.CharField(allow_null=True)
    current_streak = serializers.IntegerField()
    has_activity_today = serializers.BooleanField()


class GroupStreakDetailSerializer(serializers.Serializer):
    group_streak = serializers.IntegerField()
    longest_group_streak = serializers.IntegerField()
    members = GroupStreakMemberSerializer(many=True)


class GroupInviteCodeSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = GroupInviteCode
        fields = ['id', 'code', 'created_by', 'created_by_username', 'is_active', 'created_at']
        read_only_fields = ['id', 'code', 'created_by', 'created_by_username', 'is_active', 'created_at']


class GroupJoinRequestSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = GroupJoinRequest
        fields = ['id', 'user', 'username', 'message', 'status', 'created_at']
        read_only_fields = ['id', 'user', 'username', 'status', 'created_at']


# ---------------------------------------------------------------------------
# Input serializers
# ---------------------------------------------------------------------------

class CreateGroupSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    description = serializers.CharField(max_length=500, required=False, default='')
    privacy = serializers.ChoiceField(choices=Group.Privacy.choices, default=Group.Privacy.PUBLIC)
    avatar = serializers.ImageField(required=False, default=None)


class UpdateGroupSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, required=False)
    description = serializers.CharField(max_length=500, required=False)
    privacy = serializers.ChoiceField(choices=Group.Privacy.choices, required=False)
    avatar = serializers.ImageField(required=False)


class JoinRequestMessageSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=500, required=False, default='')


class JoinViaCodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=8)
