class OrgNotFoundError(Exception):
    """Raised when an organization cannot be found."""
    pass


class NotOrgMemberError(Exception):
    """Raised when a user is not a member of the organization."""
    pass


class NotOrgAdminError(Exception):
    """Raised when a non-admin/creator tries to perform an admin action."""
    pass


class AlreadyOrgMemberError(Exception):
    """Raised when a user is already a member of the organization."""
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
    """Raised when trying to remove or demote the org creator."""
    pass


class InviteCodeNotFoundError(Exception):
    """Raised when an invite code cannot be found."""
    pass


class OrgFullError(Exception):
    """Raised when an organization has reached its maximum member capacity."""
    pass


class AnnouncementNotFoundError(Exception):
    """Raised when an announcement cannot be found."""
    pass


class PollNotFoundError(Exception):
    """Raised when an announcement has no attached poll."""
    pass


class PollOptionNotFoundError(Exception):
    """Raised when a poll option cannot be found."""
    pass


class AlreadyVotedError(Exception):
    """Raised when a user has already voted on this poll."""
    pass


class PollExpiredError(Exception):
    """Raised when trying to vote on an expired poll."""
    pass
