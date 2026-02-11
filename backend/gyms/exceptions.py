class GymNotFoundError(Exception):
    """Raised when a gym cannot be found by the given ID."""
    pass


class AlreadyEnrolledError(Exception):
    """Raised when a user attempts to enroll but is already enrolled at a gym."""
    pass


class BusyLevelCooldownError(Exception):
    """Raised when a user submits a busy level within the 15-minute cooldown."""
    pass


class NotEligibleError(Exception):
    """Raised when a user is not eligible to submit a busy level for a gym."""
    pass


# Workout Invite exceptions

class WorkoutInviteNotFoundError(Exception):
    """Raised when a workout invite cannot be found."""
    pass


class JoinRequestNotFoundError(Exception):
    """Raised when a join request cannot be found."""
    pass


class InviteFullError(Exception):
    """Raised when a workout invite has no spots available."""
    pass


class InviteExpiredError(Exception):
    """Raised when a workout invite has expired."""
    pass


class DuplicateJoinRequestError(Exception):
    """Raised when a user already has a pending join request for an invite."""
    pass


class NotInviteOwnerError(Exception):
    """Raised when a non-creator tries to manage an invite's join requests."""
    pass
