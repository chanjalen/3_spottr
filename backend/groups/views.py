from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden

from .models import Group, GroupMember


@login_required
def group_profile_view(request, group_id):
    """Display the group profile page."""
    group = get_object_or_404(Group, id=group_id)

    # For private groups only members can view
    is_member = GroupMember.objects.filter(group=group, user=request.user).exists()
    if group.privacy == Group.Privacy.PRIVATE and not is_member:
        return HttpResponseForbidden("This group is private.")

    members = GroupMember.objects.filter(group=group).select_related('user')
    member_count = members.count()

    user_role = None
    membership = members.filter(user=request.user).first()
    if membership:
        user_role = membership.role

    return render(request, 'groups/group_profile.html', {
        'group': group,
        'members': members,
        'member_count': member_count,
        'is_member': is_member,
        'user_role': user_role,
    })
