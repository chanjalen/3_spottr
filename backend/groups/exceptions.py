class GroupNotFoundError(Exception):
    """Raised when a group cannot be found by the given ID."""
    pass


class NotGroupMemberError(Exception):
    """Raised when a user is not a member of the group."""
    pass


class NotGroupAdminError(Exception):
    """Raised when a non-admin/creator tries to perform an admin action."""
    pass


class AlreadyGroupMemberError(Exception):
    """Raised when a user is already a member of the group."""
    pass


class JoinRequestNotFoundError(Exception):
    """Raised when a join request cannot be found."""
    pass


class DuplicateJoinRequestError(Exception):
    """Raised when a user already has a pending join request."""
    pass


class InvalidInviteCodeError(Exception):
    """Raised when an invite code is invalid or inactive."""
    pass


class CannotRemoveCreatorError(Exception):
    """Raised when trying to remove or demote the group creator."""
    pass


class InviteCodeNotFoundError(Exception):
    """Raised when an invite code cannot be found."""
    pass
