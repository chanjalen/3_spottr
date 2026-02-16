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


def search_groups(query=None, limit=50, offset=0):
    """Search public groups by name. Returns a queryset."""
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

def recalculate_group_streak(group_id):
    """
    Recalculate the group streak.
    If ALL members have current_streak > 0, increment group_streak by 1.
    If any member has current_streak == 0, reset group_streak to 0.
    Returns the updated group.
    """
    group = _get_group(group_id)

    member_user_ids = GroupMember.objects.filter(group=group).values_list('user_id', flat=True)

    if not member_user_ids:
        group.group_streak = 0
        group.save(update_fields=['group_streak', 'updated_at'])
        return group

    from accounts.models import User
    any_broken = User.objects.filter(
        id__in=member_user_ids, current_streak=0
    ).exists()

    if any_broken:
        group.group_streak = 0
    else:
        group.group_streak += 1

    group.save(update_fields=['group_streak', 'updated_at'])
    return group
