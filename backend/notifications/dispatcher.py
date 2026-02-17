from notifications.models import Notification


def notify_like_post(actor, post):
    """Create a notification when someone likes a post."""
    if actor.id == post.user_id:
        return  # Don't notify yourself
    Notification.objects.create(
        recipient=post.user,
        triggered_by=actor,
        type=Notification.Type.LIKE_POST,
        target_type=Notification.TargetType.POST,
        target_id=str(post.id),
    )


def notify_comment(actor, post, comment):
    """Create a notification when someone comments on a post."""
    if actor.id == post.user_id:
        return
    Notification.objects.create(
        recipient=post.user,
        triggered_by=actor,
        type=Notification.Type.COMMENT,
        target_type=Notification.TargetType.POST,
        target_id=str(post.id),
        context_type=Notification.TargetType.COMMENT,
        context_id=str(comment.id),
    )


def notify_comment_on_checkin(actor, checkin, comment):
    """Create a notification when someone comments on a check-in."""
    if actor.id == checkin.user_id:
        return
    Notification.objects.create(
        recipient=checkin.user,
        triggered_by=actor,
        type=Notification.Type.COMMENT,
        target_type=Notification.TargetType.QUICK_WORKOUT,
        target_id=str(checkin.id),
        context_type=Notification.TargetType.COMMENT,
        context_id=str(comment.id),
    )


def notify_comment_reply(actor, parent_comment, reply):
    """Create a notification when someone replies to a comment."""
    if actor.id == parent_comment.user_id:
        return
    Notification.objects.create(
        recipient=parent_comment.user,
        triggered_by=actor,
        type=Notification.Type.COMMENT,
        target_type=Notification.TargetType.COMMENT,
        target_id=str(parent_comment.id),
        context_type=Notification.TargetType.COMMENT,
        context_id=str(reply.id),
    )


def notify_follow(actor, target_user):
    """Create a notification when someone follows a user."""
    if actor.id == target_user.id:
        return
    Notification.objects.create(
        recipient=target_user,
        triggered_by=actor,
        type=Notification.Type.FOLLOW,
        target_type=Notification.TargetType.USER,
        target_id=str(target_user.id),
    )
