from datetime import timedelta

from django.db.models import Q, Avg
from django.utils import timezone

from gyms.models import Gym, BusyLevel, WorkoutInvite, JoinRequest
from gyms.exceptions import (
    GymNotFoundError,
    AlreadyEnrolledError,
    BusyLevelCooldownError,
    NotEligibleError,
    WorkoutInviteNotFoundError,
    JoinRequestNotFoundError,
    InviteFullError,
    InviteExpiredError,
    DuplicateJoinRequestError,
    NotInviteOwnerError,
)


def search_gyms(query=None, limit=50, offset=0):
    """
    Search gyms by name. Returns all gyms if no query provided.
    """
    qs = Gym.objects.all()

    if query:
        qs = qs.filter(name__icontains=query)

    return qs[offset:offset + limit]


def get_gym_detail(gym_id):
    """Get a single gym by ID, or None if not found."""
    return Gym.objects.filter(id=gym_id).first()


def enroll_user(user, gym_id):
    """
    Enroll the user at a gym. Returns the gym.
    Raises GymNotFoundError if gym_id is invalid.
    Raises AlreadyEnrolledError if user is already enrolled at that gym.
    """
    try:
        gym = Gym.objects.get(id=gym_id)
    except Gym.DoesNotExist:
        raise GymNotFoundError("Gym not found.")

    if user.enrolled_gyms.filter(id=gym.id).exists():
        raise AlreadyEnrolledError("You are already enrolled at this gym.")

    user.enrolled_gyms.add(gym)
    return gym


def unenroll_user(user, gym_id):
    """Remove the user from a specific gym."""
    try:
        gym = Gym.objects.get(id=gym_id)
    except Gym.DoesNotExist:
        raise GymNotFoundError("Gym not found.")

    user.enrolled_gyms.remove(gym)


def get_enrolled_users_count(gym):
    """Get the number of users enrolled at this gym."""
    return gym.enrolled_users.count()


def _is_eligible_for_busy_level(user, gym):
    """
    Check if a user can submit a busy level for a gym.
    Eligible if enrolled at the gym OR has completed a workout there.
    """
    if user.enrolled_gyms.filter(id=gym.id).exists():
        return True

    from workouts.models import Workout
    return Workout.objects.filter(
        user=user, gym=gym, end_time__isnull=False
    ).exists()


def submit_busy_level(user, gym_id, survey_response):
    """
    Submit a busy level survey response for a gym.
    Raises GymNotFoundError if gym doesn't exist.
    Raises NotEligibleError if user isn't enrolled or hasn't worked out there.
    Raises BusyLevelCooldownError if user submitted within the last 15 minutes.
    """
    try:
        gym = Gym.objects.get(id=gym_id)
    except Gym.DoesNotExist:
        raise GymNotFoundError("Gym not found.")

    if not _is_eligible_for_busy_level(user, gym):
        raise NotEligibleError(
            "You must be enrolled at this gym or have completed a workout here to submit a busy level."
        )

    cooldown_cutoff = timezone.now() - timedelta(minutes=15)
    recent = BusyLevel.objects.filter(
        user=user, gym=gym, timestamp__gte=cooldown_cutoff
    ).exists()
    if recent:
        raise BusyLevelCooldownError(
            "You can only submit a busy level once every 15 minutes."
        )

    BusyLevel.objects.create(
        gym=gym,
        user=user,
        timestamp=timezone.now(),
        survey_response=survey_response,
    )

    return get_current_busy_level(gym_id)


BUSY_LEVEL_LABELS = {
    1: 'Not crowded',
    2: 'Not too crowded',
    3: 'Moderately crowded',
    4: 'Crowded',
    5: 'Very crowded',
}


def get_current_busy_level(gym_id):
    """
    Get the current busy level for a gym, averaged over the last 60 minutes.
    Average is rounded to the nearest whole number and mapped to a label.
    """
    one_hour_ago = timezone.now() - timedelta(hours=1)
    recent = BusyLevel.objects.filter(gym_id=gym_id, timestamp__gte=one_hour_ago)

    result = recent.aggregate(average=Avg('survey_response'))
    total = recent.count()

    if result['average'] is not None:
        level = round(result['average'])
        label = BUSY_LEVEL_LABELS[level]
    else:
        level = None
        label = None

    return {
        'level': level,
        'label': label,
        'total_responses': total,
    }


# ---- Workout Invite services ----

def create_workout_invite(user, data):
    """
    Create a workout invite. Validates gym exists.
    For individual invites, resolves invited_username to a User.
    """
    try:
        gym = Gym.objects.get(id=data['gym_id'])
    except Gym.DoesNotExist:
        raise GymNotFoundError("Gym not found.")

    invited_user = None
    if data.get('invited_username'):
        from accounts.models import User
        try:
            invited_user = User.objects.get(username=data['invited_username'])
        except User.DoesNotExist:
            raise WorkoutInviteNotFoundError("Invited user not found.")

    group = None
    if data.get('group_id'):
        from groups.models import Group
        try:
            group = Group.objects.get(id=data['group_id'])
        except Group.DoesNotExist:
            raise WorkoutInviteNotFoundError("Group not found.")

    return WorkoutInvite.objects.create(
        user=user,
        gym=gym,
        group=group,
        invited_user=invited_user,
        description=data['description'],
        workout_type=data['workout_type'],
        scheduled_time=data['scheduled_time'],
        spots_available=data.get('spots_available', 1),
        type=data['type'],
        expires_at=data['expires_at'],
    )


def list_workout_invites(user, gym_id=None):
    """
    List invites visible to the requesting user.
    - Own invites: always shown (including expired)
    - Gym invites: shown if user is enrolled at that gym and invite not expired
    - Group invites: shown if user is a member of the group and invite not expired
    - Individual invites: shown if user is the invited_user and invite not expired
    """
    now = timezone.now()

    # User's own invites (hide expired)
    own = Q(user=user, expires_at__gt=now)

    # Gym invites visible to enrolled users (not expired)
    enrolled_gym_ids = user.enrolled_gyms.values_list('id', flat=True)
    gym_q = Q(type='gym', gym_id__in=enrolled_gym_ids, expires_at__gt=now)

    # Group invites for user's groups (not expired)
    user_group_ids = user.group_memberships.values_list('group_id', flat=True)
    group_q = Q(type='group', group_id__in=user_group_ids, expires_at__gt=now)

    # Individual invites sent to this user (not expired)
    individual_q = Q(type='individual', invited_user=user, expires_at__gt=now)

    qs = WorkoutInvite.objects.filter(own | gym_q | group_q | individual_q).distinct()

    if gym_id:
        qs = qs.filter(gym_id=gym_id)

    return qs


def get_workout_invite_detail(invite_id):
    """Get a single workout invite by ID."""
    try:
        return WorkoutInvite.objects.get(id=invite_id)
    except WorkoutInvite.DoesNotExist:
        raise WorkoutInviteNotFoundError("Workout invite not found.")


def cancel_workout_invite(user, invite_id):
    """Creator cancels/deletes their invite."""
    try:
        invite = WorkoutInvite.objects.get(id=invite_id)
    except WorkoutInvite.DoesNotExist:
        raise WorkoutInviteNotFoundError("Workout invite not found.")

    if invite.user_id != user.id:
        raise NotInviteOwnerError("Only the invite creator can cancel this invite.")

    invite.delete()


# ---- Join Request services ----

def create_join_request(user, invite_id, description):
    """
    Create a join request for a workout invite.
    Validates: invite exists, not expired, not full, no duplicate, not own invite.
    """
    try:
        invite = WorkoutInvite.objects.get(id=invite_id)
    except WorkoutInvite.DoesNotExist:
        raise WorkoutInviteNotFoundError("Workout invite not found.")

    if invite.expires_at <= timezone.now():
        raise InviteExpiredError("This workout invite has expired.")

    if invite.spots_available <= 0:
        raise InviteFullError("This workout invite has no spots available.")

    if invite.user_id == user.id:
        raise DuplicateJoinRequestError("You cannot join your own invite.")

    if JoinRequest.objects.filter(
        workout_invite=invite, user=user, status=JoinRequest.Status.PENDING
    ).exists():
        raise DuplicateJoinRequestError("You already have a pending request for this invite.")

    return JoinRequest.objects.create(
        workout_invite=invite,
        user=user,
        description=description,
    )


def cancel_join_request(user, request_id):
    """Requester cancels their own pending join request."""
    try:
        join_request = JoinRequest.objects.get(id=request_id)
    except JoinRequest.DoesNotExist:
        raise JoinRequestNotFoundError("Join request not found.")

    if join_request.user_id != user.id:
        raise NotInviteOwnerError("You can only cancel your own join request.")

    if join_request.status != JoinRequest.Status.PENDING:
        raise JoinRequestNotFoundError("Only pending requests can be cancelled.")

    join_request.delete()


def list_join_requests(user, invite_id):
    """List all join requests for an invite. Creator only."""
    try:
        invite = WorkoutInvite.objects.get(id=invite_id)
    except WorkoutInvite.DoesNotExist:
        raise WorkoutInviteNotFoundError("Workout invite not found.")

    if invite.user_id != user.id:
        raise NotInviteOwnerError("Only the invite creator can view join requests.")

    return JoinRequest.objects.filter(workout_invite=invite)


def accept_join_request(user, request_id):
    """
    Creator accepts a join request. Sets status, joined_at, decrements spots.
    """
    try:
        join_request = JoinRequest.objects.get(id=request_id)
    except JoinRequest.DoesNotExist:
        raise JoinRequestNotFoundError("Join request not found.")

    invite = join_request.workout_invite

    if invite.user_id != user.id:
        raise NotInviteOwnerError("Only the invite creator can accept requests.")

    if join_request.status != JoinRequest.Status.PENDING:
        raise JoinRequestNotFoundError("This request has already been handled.")

    if invite.spots_available <= 0:
        raise InviteFullError("No spots available.")

    join_request.status = JoinRequest.Status.ACCEPT
    join_request.joined_at = timezone.now()
    join_request.save(update_fields=['status', 'joined_at', 'updated_at'])

    invite.spots_available -= 1
    invite.save(update_fields=['spots_available', 'updated_at'])

    # Create mutual follow (become friends) if not already following each other
    from social.models import Follow
    creator = invite.user
    requester = join_request.user
    Follow.objects.get_or_create(follower=creator, following=requester)
    Follow.objects.get_or_create(follower=requester, following=creator)

    # Send a DM with workout details
    from messaging.models import Message
    scheduled = invite.scheduled_time.strftime('%b %d at %I:%M %p') if invite.scheduled_time else 'TBD'
    gym_name = invite.gym.name if invite.gym else 'the gym'
    msg_content = (
        f"{creator.display_name} and {requester.display_name} have a "
        f"{invite.workout_type} workout at {gym_name} - {scheduled}"
    )
    Message.objects.create(
        sender=creator,
        recipient=requester,
        content=msg_content,
    )

    return join_request


def deny_join_request(user, request_id):
    """Creator denies a join request."""
    try:
        join_request = JoinRequest.objects.get(id=request_id)
    except JoinRequest.DoesNotExist:
        raise JoinRequestNotFoundError("Join request not found.")

    invite = join_request.workout_invite

    if invite.user_id != user.id:
        raise NotInviteOwnerError("Only the invite creator can deny requests.")

    if join_request.status != JoinRequest.Status.PENDING:
        raise JoinRequestNotFoundError("This request has already been handled.")

    join_request.status = JoinRequest.Status.DENY
    join_request.save(update_fields=['status', 'updated_at'])

    return join_request


# ---- Top Lifters services ----

LIFT_MAP = {
    'bench': 'Bench Press',
    'squat': 'Squat',
    'deadlift': 'Deadlift',
}


def get_top_lifters(gym_id, lift='bench'):
    """
    Get top lifters at a gym for a given lift category.
    lift: 'bench', 'squat', 'deadlift', or 'total'
    Returns list of dicts: [{rank, username, display_name, value, unit}, ...]
    """
    from accounts.models import User
    from workouts.models import PersonalRecord

    if lift in LIFT_MAP:
        exercise_name = LIFT_MAP[lift]
        prs = PersonalRecord.objects.filter(
            user__enrolled_gyms__id=gym_id,
            exercise_name__iexact=exercise_name,
            unit__in=['lbs', 'kg'],
        ).select_related('user')

        # Keep only the best PR per user
        best_by_user = {}
        for pr in prs:
            try:
                val = float(pr.value)
            except (ValueError, TypeError):
                continue
            uid = pr.user_id
            if uid not in best_by_user or val > best_by_user[uid]['value']:
                best_by_user[uid] = {
                    'username': pr.user.username,
                    'display_name': pr.user.display_name or pr.user.username,
                    'value': val,
                    'unit': pr.unit,
                }

        results = sorted(best_by_user.values(), key=lambda x: x['value'], reverse=True)[:5]
        for i, r in enumerate(results, 1):
            r['rank'] = i
        return results

    elif lift == 'total':
        enrolled_users = User.objects.filter(enrolled_gyms__id=gym_id)
        results = []
        for user in enrolled_users:
            total = 0
            unit = None
            for name in LIFT_MAP.values():
                pr = PersonalRecord.objects.filter(
                    user=user,
                    exercise_name__iexact=name,
                    unit__in=['lbs', 'kg'],
                ).order_by().first()
                if pr:
                    try:
                        val = float(pr.value)
                        total += val
                        unit = pr.unit
                    except (ValueError, TypeError):
                        pass
            if total > 0:
                results.append({
                    'username': user.username,
                    'display_name': user.display_name or user.username,
                    'value': total,
                    'unit': unit or 'lbs',
                })

        results.sort(key=lambda x: x['value'], reverse=True)
        results = results[:5]
        for i, r in enumerate(results, 1):
            r['rank'] = i
        return results

    return []
