class NotMutualFollowError(Exception):
    """Raised when trying to DM a user who is not a mutual follow."""
    pass


class UserBlockedError(Exception):
    """Raised when a block exists between the two users."""
    pass


class NotGroupMemberError(Exception):
    """Raised when a non-member tries to send a message in a group."""
    pass


class MessageNotFoundError(Exception):
    """Raised when a message cannot be found."""
    pass


class ConversationNotFoundError(Exception):
    """Raised when a conversation cannot be found or the user has no access."""
    pass


class PostNotFoundError(Exception):
    """Raised when a shared post cannot be found."""
    pass


class CannotMessageSelfError(Exception):
    """Raised when a user tries to DM themselves."""
    pass


class RecipientNotFoundError(Exception):
    """Raised when the recipient user does not exist."""
    pass


class RecipientAlreadyCheckedInError(Exception):
    """Raised when trying to zap a user who has already checked in today."""
    pass
