from rest_framework import serializers
from .models import Group, GroupMember


class GroupMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = GroupMember
        fields = ['id', 'group', 'user', 'role', 'joined_at', 'created_at', 'updated_at']
        read_only_fields = ['id', 'joined_at', 'created_at', 'updated_at']


class GroupSerializer(serializers.ModelSerializer):
    members = GroupMemberSerializer(many=True, read_only=True)

    class Meta:
        model = Group
        fields = [
            'id', 'created_by', 'name', 'avatar', 'description',
            'group_streak', 'members', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
