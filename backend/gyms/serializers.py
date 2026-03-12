from rest_framework import serializers
from .models import Gym, WorkoutInvite, JoinRequest
from gyms import services


class GymListSerializer(serializers.ModelSerializer):
    is_enrolled = serializers.SerializerMethodField()
    busy_level = serializers.SerializerMethodField()
    top_lifter = serializers.SerializerMethodField()

    class Meta:
        model = Gym
        fields = ['id', 'name', 'address', 'latitude', 'longitude', 'rating', 'rating_count',
                  'is_enrolled', 'busy_level', 'top_lifter']

    def get_is_enrolled(self, obj):
        enrolled_ids = self.context.get('enrolled_ids')
        if enrolled_ids is not None:
            return str(obj.id) in enrolled_ids
        # Fallback for callers that don't pass enrolled_ids
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return request.user.enrolled_gyms.filter(id=obj.id).exists()
        return False

    def get_busy_level(self, obj):
        busy_map = self.context.get('busy_map')
        if busy_map is None:
            return None
        return busy_map.get(str(obj.id))

    def get_top_lifter(self, obj):
        top_lifter_map = self.context.get('top_lifter_map')
        if top_lifter_map is None:
            return None
        return top_lifter_map.get(str(obj.id))


class GymDetailSerializer(serializers.ModelSerializer):
    enrolled_users_count = serializers.SerializerMethodField()
    is_enrolled = serializers.SerializerMethodField()

    class Meta:
        model = Gym
        fields = [
            'id', 'name', 'address', 'latitude', 'longitude',
            'website', 'phone_number', 'hours', 'amenities',
            'google_place_id', 'rating', 'rating_count',
            'enrolled_users_count', 'is_enrolled', 'created_at', 'updated_at',
        ]

    def get_enrolled_users_count(self, obj):
        return services.get_enrolled_users_count(obj)

    def get_is_enrolled(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return request.user.enrolled_gyms.filter(id=obj.id).exists()
        return False


class BusyLevelSubmitSerializer(serializers.Serializer):
    survey_response = serializers.IntegerField(min_value=1, max_value=5)


class BusyLevelResponseSerializer(serializers.Serializer):
    level = serializers.IntegerField(allow_null=True)
    label = serializers.CharField(allow_null=True)
    total_responses = serializers.IntegerField()


# ---- Workout Invite serializers ----

class WorkoutInviteCreateSerializer(serializers.Serializer):
    gym_id = serializers.CharField()
    description = serializers.CharField(max_length=255)
    workout_type = serializers.CharField(max_length=50)
    scheduled_time = serializers.DateTimeField()
    spots_available = serializers.IntegerField(min_value=1, default=1)
    type = serializers.ChoiceField(choices=['gym', 'group', 'individual'])
    expires_at = serializers.DateTimeField()
    group_id = serializers.CharField(required=False, allow_null=True)
    invited_username = serializers.CharField(required=False, allow_null=True)


class JoinRequestSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = JoinRequest
        fields = ['id', 'username', 'description', 'status', 'joined_at', 'created_at']


class WorkoutInviteListSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    gym_name = serializers.CharField(source='gym.name', read_only=True)
    is_expired = serializers.SerializerMethodField()

    class Meta:
        model = WorkoutInvite
        fields = [
            'id', 'username', 'gym_name', 'description', 'workout_type',
            'scheduled_time', 'spots_available', 'total_spots', 'type', 'is_expired',
            'expires_at', 'created_at',
        ]

    def get_is_expired(self, obj):
        from django.utils import timezone
        return obj.expires_at <= timezone.now()


class WorkoutInviteDetailSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    gym_name = serializers.CharField(source='gym.name', read_only=True)
    invited_username = serializers.CharField(source='invited_user.username', read_only=True, default=None)
    group_name = serializers.CharField(source='group.name', read_only=True, default=None)
    workout_chat_id = serializers.CharField(source='workout_chat.id', read_only=True, default=None)
    is_expired = serializers.SerializerMethodField()
    join_requests = serializers.SerializerMethodField()

    class Meta:
        model = WorkoutInvite
        fields = [
            'id', 'username', 'gym_name', 'group_name', 'invited_username',
            'description', 'workout_type', 'scheduled_time',
            'spots_available', 'total_spots',
            'type', 'is_expired', 'expires_at', 'join_requests',
            'workout_chat_id', 'created_at', 'updated_at',
        ]

    def get_is_expired(self, obj):
        from django.utils import timezone
        return obj.expires_at <= timezone.now()

    def get_join_requests(self, obj):
        request = self.context.get('request')
        if request and obj.user_id == request.user.id:
            qs = obj.join_requests.all()
            return JoinRequestSerializer(qs, many=True).data
        # Non-creators only see accepted members
        qs = obj.join_requests.filter(status=JoinRequest.Status.ACCEPT)
        return JoinRequestSerializer(qs, many=True).data


class JoinRequestCreateSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=255)


# ---- Leaderboard serializers ----

class TopLifterSerializer(serializers.Serializer):
    rank = serializers.IntegerField()
    username = serializers.CharField()
    display_name = serializers.CharField()
    avatar_url = serializers.CharField(allow_null=True)
    current_streak = serializers.IntegerField()
    value = serializers.FloatField()
    unit = serializers.CharField()
