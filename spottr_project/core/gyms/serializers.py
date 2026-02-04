from rest_framework import serializers
from .models import Gym, GymActivity, WorkoutInvite, InviteParticipant


class GymSerializer(serializers.ModelSerializer):
    class Meta:
        model = Gym
        fields = [
            'id', 'name', 'address', 'latitude', 'longitude', 'max_capacity',
            'current_activity', 'phone_number', 'hours', 'amenities',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class GymActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = GymActivity
        fields = [
            'id', 'gym', 'timestamp', 'activity_count', 'legs_count',
            'cardio_count', 'workout_class_count', 'other_count',
            'busyness_level', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class InviteParticipantSerializer(serializers.ModelSerializer):
    class Meta:
        model = InviteParticipant
        fields = ['id', 'invite', 'user', 'status', 'joined_at', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class WorkoutInviteSerializer(serializers.ModelSerializer):
    participants = InviteParticipantSerializer(many=True, read_only=True)

    class Meta:
        model = WorkoutInvite
        fields = [
            'id', 'user', 'gym', 'workout_type', 'scheduled_time',
            'spots_available', 'status', 'expires_at', 'participants',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
