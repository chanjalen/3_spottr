from rest_framework import serializers
from accounts.models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'id', 'email', 'phone_number', 'username', 'display_name',
            'birthday', 'avatar', 'bio', 'workout_frequency', 'member_since',
            'current_streak', 'longest_streak', 'total_workouts', 'status',
            'current_activity', 'current_gym', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
