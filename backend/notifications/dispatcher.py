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


def notify_workout_invite(actor, recipient, workout_invite):
    """Create a notification when someone sends an individual workout invite."""
    if actor.id == recipient.id:
        return
    Notification.objects.create(
        recipient=recipient,
        triggered_by=actor,
        type=Notification.Type.WORKOUT_INVITE,
        target_type=Notification.TargetType.WORKOUT_INVITE,
        target_id=str(workout_invite.id),
    )


def notify_like_checkin(actor, checkin):
    """Create a notification when someone likes a check-in."""
    if actor.id == checkin.user_id:
        return
    Notification.objects.create(
        recipient=checkin.user,
        triggered_by=actor,
        type=Notification.Type.LIKE_CHECKIN,
        target_type=Notification.TargetType.QUICK_WORKOUT,
        target_id=str(checkin.id),
    )


def notify_like_comment(actor, comment):
    """Create a notification when someone likes a comment."""
    if actor.id == comment.user_id:
        return
    Notification.objects.create(
        recipient=comment.user,
        triggered_by=actor,
        type=Notification.Type.LIKE_COMMENT,
        target_type=Notification.TargetType.COMMENT,
        target_id=str(comment.id),
    )


def notify_mention(actor, recipient, target_type, target_id):
    """
    Generic mention notifier. Called by post/checkin/comment creation
    once @mention parsing is implemented.
    target_type: Notification.TargetType value (POST, QUICK_WORKOUT, COMMENT)
    target_id:   str UUID of the containing content
    """
    if actor.id == recipient.id:
        return
    Notification.objects.create(
        recipient=recipient,
        triggered_by=actor,
        type=Notification.Type.MENTION,
        target_type=target_type,
        target_id=str(target_id),
    )


def notify_group_join_request(actor, group, join_request):
    """Notify all group admins when someone requests to join a private group."""
    from groups.models import GroupMember
    admin_memberships = GroupMember.objects.filter(
        group=group,
        role__in=['admin', 'creator'],
    ).select_related('user')
    for membership in admin_memberships:
        if membership.user_id != actor.id:
            Notification.objects.create(
                recipient=membership.user,
                triggered_by=actor,
                type=Notification.Type.JOIN_REQUEST,
                target_type=Notification.TargetType.GROUP,
                target_id=str(group.id),
                context_type='join_request',
                context_id=str(join_request.id),
            )


def notify_workout_join_request(actor, workout_invite, join_request):
    """Notify the workout invite owner when someone requests to join."""
    owner = workout_invite.user
    if actor.id == owner.id:
        return
    Notification.objects.create(
        recipient=owner,
        triggered_by=actor,
        type=Notification.Type.JOIN_REQUEST,
        target_type=Notification.TargetType.WORKOUT_INVITE,
        target_id=str(workout_invite.id),
        context_type='workout_join_request',
        context_id=str(join_request.id),
    )
