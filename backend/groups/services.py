from django.db.models import Q

from .models import Group, GroupMember, GroupInviteCode, GroupJoinRequest
from .exceptions import (
    GroupNotFoundError,
    NotGroupMemberError,
    NotGroupAdminError,
    AlreadyGroupMemberError,
    JoinRequestNotFoundError,
    DuplicateJoinRequestError,
    InvalidInviteCodeError,
    CannotRemoveCreatorError,
    InviteCodeNotFoundError,
    GroupFullError,
)

GROUP_MEMBER_CAP = 250


def _check_group_capacity(group):
    count = GroupMember.objects.filter(group=group).count()
    if count >= GROUP_MEMBER_CAP:
        raise GroupFullError(
            f"This group has reached the maximum of {GROUP_MEMBER_CAP} members."
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_group(group_id):
    try:
        return Group.objects.get(id=group_id)
    except Group.DoesNotExist:
        raise GroupNotFoundError("Group not found.")


def _get_membership(group, user):
    try:
        return GroupMember.objects.get(group=group, user=user)
    except GroupMember.DoesNotExist:
        raise NotGroupMemberError("You are not a member of this group.")


def _require_admin(group, user):
    """Return the membership if user is admin or creator, else raise."""
    membership = _get_membership(group, user)
    if membership.role not in (GroupMember.Role.ADMIN, GroupMember.Role.CREATOR):
        raise NotGroupAdminError("You do not have admin permissions for this group.")
    return membership


# ---------------------------------------------------------------------------
# Group CRUD
# ---------------------------------------------------------------------------

def create_group(user, name, description='', privacy=Group.Privacy.PUBLIC, avatar=None):
    """
    Create a group and add the creating user as CREATOR.
    Returns the created group.
    """
    group = Group.objects.create(
        created_by=user,
        name=name,
        description=description,
        privacy=privacy,
        avatar=avatar,
    )
    GroupMember.objects.create(
        group=group,
        user=user,
        role=GroupMember.Role.CREATOR,
    )
    # Auto-generate an invite code for the group
    GroupInviteCode.objects.create(
        group=group,
        created_by=user,
    )
    return group


def update_group(user, group_id, **fields):
    """
    Update group details. Only admins/creator can update.
    Returns the updated group.
    """
    group = _get_group(group_id)
    _require_admin(group, user)

    allowed = {'name', 'description', 'privacy', 'avatar'}
    update_fields = []
    for key, value in fields.items():
        if key in allowed:
            setattr(group, key, value)
            update_fields.append(key)

    if update_fields:
        update_fields.append('updated_at')
        group.save(update_fields=update_fields)

    return group


def update_group_avatar(user, group_id, avatar_file):
    """
    Replace the group avatar. Admin/creator only.
    Cleans up any previous MediaAsset/MediaLink before saving the new one.
    Returns the updated group.
    """
    from media.utils import create_media_asset
    from media.models import MediaLink

    group = _get_group(group_id)
    _require_admin(group, user)

    # Remove previous avatar MediaLink and underlying asset
    old_links = MediaLink.objects.filter(
        destination_type='group',
        destination_id=str(group.pk),
        type='avatar',
    ).select_related('asset')
    for ml in old_links:
        ml.asset.delete()

    # Save new file via the ImageField
    group.avatar = avatar_file
    group.save(update_fields=['avatar', 'updated_at'])

    # Track in MediaAsset / MediaLink
    asset = create_media_asset(user, avatar_file, group.avatar.name, 'image', already_saved=True)
    MediaLink.objects.create(
        asset=asset,
        destination_type='group',
        destination_id=str(group.pk),
        type='avatar',
    )

    return group


def delete_group(user, group_id):
    """
    Delete a group. Only the creator can delete.
    """
    group = _get_group(group_id)
    membership = _get_membership(group, user)
    if membership.role != GroupMember.Role.CREATOR:
        raise NotGroupAdminError("Only the group creator can delete the group.")
    group.delete()


def get_group(group_id):
    """Return group by ID or raise GroupNotFoundError."""
    return _get_group(group_id)


def search_groups(query=None, limit=50, offset=0, include_private=False):
    """
    Search groups by name. Returns a queryset.
    When include_private=True (requires a query), both public and private groups are returned.
    """
    if include_private and query:
        qs = Group.objects.filter(name__icontains=query)
    else:
        qs = Group.objects.filter(privacy=Group.Privacy.PUBLIC)
        if query:
            qs = qs.filter(name__icontains=query)
    return qs[offset:offset + limit]


def list_user_groups(user):
    """Return all groups the user is a member of."""
    group_ids = GroupMember.objects.filter(user=user).values_list('group_id', flat=True)
    return Group.objects.filter(id__in=group_ids)


# ---------------------------------------------------------------------------
# Membership
# ---------------------------------------------------------------------------

def add_member(admin_user, group_id, user_id):
    """
    Admin adds a user to the group.
    Returns the new GroupMember.
    """
    from accounts.models import User

    group = _get_group(group_id)
    _require_admin(group, admin_user)

    try:
        target_user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        raise GroupNotFoundError("User not found.")

    if GroupMember.objects.filter(group=group, user=target_user).exists():
        raise AlreadyGroupMemberError("User is already a member of this group.")

    _check_group_capacity(group)

    return GroupMember.objects.create(
        group=group,
        user=target_user,
        role=GroupMember.Role.MEMBER,
    )


def remove_member(admin_user, group_id, user_id):
    """
    Admin removes a user from the group. Cannot remove the creator.
    """
    group = _get_group(group_id)
    _require_admin(group, admin_user)

    try:
        target = GroupMember.objects.get(group=group, user_id=user_id)
    except GroupMember.DoesNotExist:
        raise NotGroupMemberError("User is not a member of this group.")

    if target.role == GroupMember.Role.CREATOR:
        raise CannotRemoveCreatorError("The group creator cannot be removed.")

    target.delete()

    from messaging.models import InboxEntry
    InboxEntry.objects.filter(user=target.user, conversation_type='group', group=group).delete()


def leave_group(user, group_id):
    """
    User voluntarily leaves the group. Creator cannot leave.
    """
    group = _get_group(group_id)
    membership = _get_membership(group, user)

    if membership.role == GroupMember.Role.CREATOR:
        raise CannotRemoveCreatorError(
            "The group creator cannot leave. Delete the group or transfer ownership first."
        )

    membership.delete()

    from messaging.models import InboxEntry
    InboxEntry.objects.filter(user=user, conversation_type='group', group=group).delete()


def promote_member(admin_user, group_id, user_id):
    """
    Promote a member to admin. Only admins/creator can promote.
    Returns the updated membership.
    """
    group = _get_group(group_id)
    _require_admin(group, admin_user)

    try:
        target = GroupMember.objects.get(group=group, user_id=user_id)
    except GroupMember.DoesNotExist:
        raise NotGroupMemberError("User is not a member of this group.")

    if target.role == GroupMember.Role.CREATOR:
        raise CannotRemoveCreatorError("Cannot change the creator's role.")

    target.role = GroupMember.Role.ADMIN
    target.save(update_fields=['role', 'updated_at'])
    return target


def demote_member(admin_user, group_id, user_id):
    """
    Demote an admin back to member. Only admins/creator can demote.
    Returns the updated membership.
    """
    group = _get_group(group_id)
    _require_admin(group, admin_user)

    try:
        target = GroupMember.objects.get(group=group, user_id=user_id)
    except GroupMember.DoesNotExist:
        raise NotGroupMemberError("User is not a member of this group.")

    if target.role == GroupMember.Role.CREATOR:
        raise CannotRemoveCreatorError("Cannot demote the group creator.")

    target.role = GroupMember.Role.MEMBER
    target.save(update_fields=['role', 'updated_at'])
    return target


def join_public_group(user, group_id):
    """
    User joins a public group directly. No invite code or approval needed.
    Returns the new GroupMember.
    """
    group = _get_group(group_id)

    if group.privacy != Group.Privacy.PUBLIC:
        raise NotGroupAdminError("This group is private. You must request to join or use an invite code.")

    if GroupMember.objects.filter(group=group, user=user).exists():
        raise AlreadyGroupMemberError("You are already a member of this group.")

    _check_group_capacity(group)

    return GroupMember.objects.create(
        group=group,
        user=user,
        role=GroupMember.Role.MEMBER,
    )


def list_members(group_id, requesting_user=None):
    """
    List group members. Public groups: anyone can view. Private groups: members only.
    Returns a queryset of GroupMember.
    """
    group = _get_group(group_id)

    if group.privacy == Group.Privacy.PRIVATE:
        if requesting_user is None or not GroupMember.objects.filter(group=group, user=requesting_user).exists():
            raise NotGroupMemberError("You must be a member to view this group's members.")

    return GroupMember.objects.filter(group=group)


# ---------------------------------------------------------------------------
# Invite Codes
# ---------------------------------------------------------------------------

def generate_invite_code(user, group_id):
    """
    Admin generates a new invite code for the group.
    Returns the GroupInviteCode.
    """
    group = _get_group(group_id)
    _require_admin(group, user)

    return GroupInviteCode.objects.create(
        group=group,
        created_by=user,
    )


def list_invite_codes(user, group_id):
    """
    Admin lists all invite codes for a group.
    Returns a queryset of GroupInviteCode.
    """
    group = _get_group(group_id)
    _require_admin(group, user)
    return GroupInviteCode.objects.filter(group=group)


def deactivate_invite_code(user, group_id, code_id):
    """
    Admin deactivates an invite code.
    """
    group = _get_group(group_id)
    _require_admin(group, user)

    try:
        invite_code = GroupInviteCode.objects.get(id=code_id, group=group)
    except GroupInviteCode.DoesNotExist:
        raise InviteCodeNotFoundError("Invite code not found.")

    invite_code.is_active = False
    invite_code.save(update_fields=['is_active', 'updated_at'])
    return invite_code


def join_via_code(user, code):
    """
    User joins a group using an invite code.
    Returns the new GroupMember.
    """
    try:
        invite_code = GroupInviteCode.objects.select_related('group').get(
            code=code, is_active=True
        )
    except GroupInviteCode.DoesNotExist:
        raise InvalidInviteCodeError("Invalid or inactive invite code.")

    group = invite_code.group

    if GroupMember.objects.filter(group=group, user=user).exists():
        raise AlreadyGroupMemberError("You are already a member of this group.")

    _check_group_capacity(group)

    return GroupMember.objects.create(
        group=group,
        user=user,
        role=GroupMember.Role.MEMBER,
    )


# ---------------------------------------------------------------------------
# Join Requests (for private groups)
# ---------------------------------------------------------------------------

def create_join_request(user, group_id, message=''):
    """
    User requests to join a private group.
    Returns the GroupJoinRequest.
    """
    group = _get_group(group_id)

    if GroupMember.objects.filter(group=group, user=user).exists():
        raise AlreadyGroupMemberError("You are already a member of this group.")

    if GroupJoinRequest.objects.filter(
        group=group, user=user, status=GroupJoinRequest.Status.PENDING
    ).exists():
        raise DuplicateJoinRequestError("You already have a pending join request for this group.")

    return GroupJoinRequest.objects.create(
        group=group,
        user=user,
        message=message,
    )


def list_join_requests(admin_user, group_id):
    """
    Admin lists pending join requests for a group.
    Returns a queryset.
    """
    group = _get_group(group_id)
    _require_admin(group, admin_user)
    return GroupJoinRequest.objects.filter(
        group=group, status=GroupJoinRequest.Status.PENDING
    )


def accept_join_request(admin_user, request_id):
    """
    Admin accepts a join request. Creates a GroupMember for the user.
    Returns the GroupJoinRequest.
    """
    try:
        join_request = GroupJoinRequest.objects.select_related('group').get(id=request_id)
    except GroupJoinRequest.DoesNotExist:
        raise JoinRequestNotFoundError("Join request not found.")

    _require_admin(join_request.group, admin_user)

    join_request.status = GroupJoinRequest.Status.ACCEPTED
    join_request.save(update_fields=['status', 'updated_at'])

    _check_group_capacity(join_request.group)

    # Create membership (ignore if already exists, e.g. joined via code in the meantime)
    GroupMember.objects.get_or_create(
        group=join_request.group,
        user=join_request.user,
        defaults={'role': GroupMember.Role.MEMBER},
    )

    return join_request


def deny_join_request(admin_user, request_id):
    """
    Admin denies a join request.
    Returns the GroupJoinRequest.
    """
    try:
        join_request = GroupJoinRequest.objects.select_related('group').get(id=request_id)
    except GroupJoinRequest.DoesNotExist:
        raise JoinRequestNotFoundError("Join request not found.")

    _require_admin(join_request.group, admin_user)

    join_request.status = GroupJoinRequest.Status.DENIED
    join_request.save(update_fields=['status', 'updated_at'])

    return join_request


# ---------------------------------------------------------------------------
# Group Streak
# ---------------------------------------------------------------------------

def update_group_streaks_for_user(user):
    """
    Called after a user logs activity. Marks their check-in date on all their
    group memberships, then tries to advance each group's streak.

    Also backfills last_checkin_date for other group members whose personal
    streak is already current today but whose last_checkin_date hasn't been set
    (e.g. they logged activity before this field existed).
    """
    from workouts.services.streak_service import get_streak_date
    from workouts.models import Streak

    today = get_streak_date()
    memberships = GroupMember.objects.filter(user=user).select_related('group')

    for membership in memberships:
        if membership.last_checkin_date != today:
            membership.last_checkin_date = today
            membership.save(update_fields=['last_checkin_date', 'updated_at'])

        # Backfill last_checkin_date for other members who have a streak today
        # but whose last_checkin_date is stale or null (logged before this field existed).
        # Use a single batch query instead of N+1 per stale member.
        stale_members = list(
            GroupMember.objects.filter(group=membership.group)
            .exclude(user=user)
            .exclude(last_checkin_date=today)
            .values_list('id', 'user_id')
        )
        if stale_members:
            stale_member_map = {user_id: member_id for member_id, user_id in stale_members}
            checked_in_user_ids = set(
                Streak.objects.filter(
                    user_id__in=stale_member_map.keys(),
                    last_streak_date=today,
                ).values_list('user_id', flat=True)
            )
            ids_to_update = [
                stale_member_map[uid] for uid in checked_in_user_ids
            ]
            if ids_to_update:
                from django.utils import timezone as tz
                GroupMember.objects.filter(id__in=ids_to_update).update(
                    last_checkin_date=today,
                    updated_at=tz.now(),
                )

        _try_advance_group_streak(membership.group, today)


def _try_advance_group_streak(group, today):
    """
    Advance the group streak if all members have checked in today.
    Handles gap detection: if a previous day was skipped, streak resets to 1.
    Uses select_for_update to prevent race conditions.
    """
    from django.db import transaction
    from datetime import timedelta

    # Fast path: skip acquiring the lock if already advanced today.
    # This avoids lock contention when multiple users in the same group
    # log activity concurrently — only the first one needs the lock.
    if Group.objects.filter(id=group.id, last_streak_date=today).exists():
        return

    with transaction.atomic():
        group = Group.objects.select_for_update().get(id=group.id)

        # Double-check after acquiring the lock (another worker may have advanced it)
        if group.last_streak_date == today:
            return

        # Check if all members have checked in today
        all_checked_in = not GroupMember.objects.filter(group=group).exclude(
            last_checkin_date=today
        ).exists()

        if not all_checked_in:
            return

        # All members checked in — determine streak value
        yesterday = today - timedelta(days=1)
        if group.last_streak_date == yesterday:
            group.group_streak += 1
        else:
            # Gap or fresh start
            group.group_streak = 1

        if group.group_streak > group.longest_group_streak:
            group.longest_group_streak = group.group_streak

        group.last_streak_date = today
        group.save(update_fields=[
            'group_streak', 'longest_group_streak', 'last_streak_date', 'updated_at',
        ])


def reset_stale_group_streaks():
    """
    Resets streaks for groups that didn't have all members check in yesterday.
    Called by the daily management command as a safety net.
    Returns count of groups reset.
    """
    from workouts.services.streak_service import get_streak_date
    from datetime import timedelta

    today = get_streak_date()
    yesterday = today - timedelta(days=1)

    # Groups with an active streak that weren't completed yesterday or today
    stale = Group.objects.filter(group_streak__gt=0).exclude(
        last_streak_date__gte=yesterday
    )
    count = stale.update(group_streak=0)
    return count


def get_group_streak_details(group_id, requesting_user):
    """
    Return streak details for a group, including per-member streak info.
    Access: members only for private groups, anyone for public.
    """
    from workouts.services.streak_service import get_streak_date

    group = _get_group(group_id)

    # Access check (same pattern as list_members)
    if group.privacy == Group.Privacy.PRIVATE:
        if requesting_user is None or not GroupMember.objects.filter(
            group=group, user=requesting_user
        ).exists():
            raise NotGroupMemberError("You must be a member to view this group's streak details.")

    today = get_streak_date()

    # Lazy eval: reset streak if a day was missed
    from datetime import timedelta
    yesterday = today - timedelta(days=1)
    if group.group_streak > 0 and group.last_streak_date is not None and group.last_streak_date < yesterday:
        group.group_streak = 0
        group.save(update_fields=['group_streak', 'updated_at'])

    members_qs = GroupMember.objects.filter(group=group).select_related('user')

    members_data = []
    for m in members_qs:
        members_data.append({
            'user_id': str(m.user_id),
            'username': m.user.username,
            'display_name': m.user.display_name,
            'avatar_url': m.user.avatar_url or None,
            'current_streak': m.user.current_streak,
            'has_activity_today': m.last_checkin_date == today,
        })

    return {
        'group_streak': group.group_streak,
        'longest_group_streak': group.longest_group_streak,
        'members': members_data,
    }
