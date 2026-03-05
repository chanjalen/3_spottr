from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db import models
from django.shortcuts import get_object_or_404

from social.models import Follow
from common.throttles import SocialWriteRateThrottle


# ── Likes ─────────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def like_post(request, post_id):
    """Toggle like on a post (token-auth friendly)."""
    from social.models import Post, Reaction
    post = get_object_or_404(Post, id=post_id)
    existing = Reaction.objects.filter(post=post, user=request.user).first()
    if existing:
        existing.delete()
        liked = False
    else:
        Reaction.objects.create(post=post, user=request.user, type='like')
        liked = True
        try:
            from notifications.dispatcher import notify_like_post
            notify_like_post(request.user, post)
        except Exception:
            pass
    like_count = Reaction.objects.filter(post=post).count()
    return Response({'liked': liked, 'like_count': like_count})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def like_checkin(request, checkin_id):
    """Toggle like on a check-in (token-auth friendly)."""
    from social.models import QuickWorkout, Reaction
    checkin = get_object_or_404(QuickWorkout, id=checkin_id)
    existing = Reaction.objects.filter(quick_workout=checkin, user=request.user).first()
    if existing:
        existing.delete()
        liked = False
    else:
        Reaction.objects.create(quick_workout=checkin, user=request.user, type='like')
        liked = True
    like_count = Reaction.objects.filter(quick_workout=checkin).count()
    return Response({'liked': liked, 'like_count': like_count})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([SocialWriteRateThrottle])
def create_post(request):
    """
    Create a post. Accepts multipart/form-data for photo/video uploads.
    Fields: text, workout_id (optional), pr_exercise_name, pr_value, pr_unit,
            photo (file), video (file),
            poll_question, poll_options[] (repeat), poll_duration (hours).
    """
    from social.models import Post

    text = (request.data.get('text') or '').strip()
    workout_id = (request.data.get('workout_id') or '').strip()
    pr_exercise_name = (request.data.get('pr_exercise_name') or '').strip()
    pr_value = (request.data.get('pr_value') or '').strip()
    pr_unit = (request.data.get('pr_unit') or 'lbs').strip()
    photo = request.FILES.get('photo')
    video = request.FILES.get('video')

    # Poll fields
    poll_question = (request.data.get('poll_question') or '').strip()
    poll_options = request.data.getlist('poll_options[]') if hasattr(request.data, 'getlist') else request.data.get('poll_options[]', [])
    if isinstance(poll_options, str):
        poll_options = [poll_options]
    poll_options = [o.strip() for o in poll_options if o.strip()]
    try:
        poll_duration = max(1, int(float(request.data.get('poll_duration') or 24)))
    except (ValueError, TypeError):
        poll_duration = 24
    has_poll = bool(poll_question and len(poll_options) >= 2)

    has_pr = bool(pr_exercise_name and pr_value)

    if not text and not photo and not video and not has_pr and not workout_id and not has_poll:
        return Response({'success': False, 'error': 'Post must have content'}, status=400)

    if len(text) > 500:
        return Response({'success': False, 'error': 'Post text cannot exceed 500 characters'}, status=400)

    workout = None
    if workout_id:
        from workouts.models import Workout
        workout = Workout.objects.filter(id=workout_id, user=request.user).first()

    post = Post.objects.create(
        user=request.user,
        description=text,
        workout=workout,
        visibility='main',
    )

    if photo:
        try:
            post.photo = photo
            post.save(update_fields=['photo'])
            try:
                from media.utils import create_media_asset
                from media.models import MediaLink
                asset = create_media_asset(request.user, photo, post.photo.name, 'image', already_saved=True)
                MediaLink.objects.create(asset=asset, destination_type='post', destination_id=str(post.id), type='inline')
            except Exception:
                pass
        except Exception:
            pass

    if video:
        try:
            post.video = video
            post.save(update_fields=['video'])
            try:
                from media.utils import create_media_asset
                from media.models import MediaLink
                asset = create_media_asset(request.user, video, post.video.name, 'video', already_saved=True)
                MediaLink.objects.create(asset=asset, destination_type='post', destination_id=str(post.id), type='inline')
            except Exception:
                pass
        except Exception:
            pass

    if has_pr:
        try:
            pr_float = float(pr_value)
        except (ValueError, TypeError):
            pr_float = 0.0
        from accounts.models import PersonalRecord
        from datetime import date
        PersonalRecord.objects.create(
            user=request.user,
            post=post,
            exercise_name=pr_exercise_name,
            value=pr_float,
            unit=pr_unit,
            achieved_date=date.today(),
        )

    if has_poll:
        from social.models import Poll, PollOption
        from django.utils import timezone
        from datetime import timedelta
        poll = Poll.objects.create(
            post=post,
            question=poll_question,
            duration_hours=poll_duration,
            ends_at=timezone.now() + timedelta(hours=poll_duration),
        )
        for idx, option_text in enumerate(poll_options):
            PollOption.objects.create(
                poll=poll,
                text=option_text,
                order=idx,
            )

    return Response({'success': True, 'post_id': str(post.id)})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([SocialWriteRateThrottle])
def create_checkin(request):
    """
    Create a quick check-in (QuickWorkout). Updates streak.
    Fields: activity (required), description, gym_id, location_name, photo (file).
    """
    from social.models import QuickWorkout
    from django.db.models import F as DjF

    activity = (request.data.get('activity') or '').strip()[:50]
    description = (request.data.get('description') or '').strip()[:300]
    gym_id = (request.data.get('gym_id') or '').strip()
    location_name = (request.data.get('location_name') or '').strip()
    workout_id = (request.data.get('workout_id') or '').strip()
    photo = request.FILES.get('photo')
    video = request.FILES.get('video')

    if not activity:
        return Response({'success': False, 'error': 'Activity type is required'}, status=400)

    if not gym_id and not location_name:
        return Response({'success': False, 'error': 'A gym or location name is required'}, status=400)

    gym = None
    if gym_id:
        try:
            from gyms.models import Gym
            gym = Gym.objects.get(id=gym_id)
            location_name = gym.name
        except Exception:
            return Response({'success': False, 'error': 'Gym not found'}, status=400)

    linked_workout = None
    if workout_id:
        from workouts.models import Workout
        linked_workout = Workout.objects.filter(id=workout_id, user=request.user).first()

    checkin = QuickWorkout.objects.create(
        user=request.user,
        location=gym,
        location_name=location_name,
        type=activity,
        description=description or f'{activity.replace("_", " ").title()} workout',
        workout=linked_workout,
        audience=['friends'],
    )

    if photo:
        try:
            from media.utils import create_media_asset
            from media.models import MediaLink
            path = f'checkins/{checkin.id}.jpg'
            asset = create_media_asset(request.user, photo, path, 'image')
            MediaLink.objects.create(
                asset=asset,
                destination_type='quick_workout',
                destination_id=str(checkin.id),
                type='inline',
            )
        except Exception:
            pass

    if video:
        try:
            from media.utils import create_media_asset
            from media.models import MediaLink
            import os
            ext = os.path.splitext(video.name)[1] or '.mp4'
            path = f'checkins/{checkin.id}{ext}'
            asset = create_media_asset(request.user, video, path, 'video')
            MediaLink.objects.create(
                asset=asset,
                destination_type='quick_workout',
                destination_id=str(checkin.id),
                type='inline',
            )
        except Exception:
            pass

    request.user.total_workouts = DjF('total_workouts') + 1
    request.user.save(update_fields=['total_workouts'])
    request.user.refresh_from_db()

    try:
        from workouts.services.streak_service import update_streak
        update_streak(request.user, activity_type='checkin')
    except Exception:
        pass

    try:
        from groups.services import update_group_streaks_for_user
        update_group_streaks_for_user(request.user)
    except Exception:
        pass

    return Response({'success': True, 'checkin_id': str(checkin.id)})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def vote_poll(request, poll_id):
    """
    Vote on a poll option. Allows changing vote.
    Body: { "option_id": <id> }
    """
    from social.models import Poll, PollOption, PollVote

    try:
        poll = Poll.objects.get(id=poll_id)
    except Poll.DoesNotExist:
        return Response({'error': 'Poll not found'}, status=404)

    if not poll.is_active:
        return Response({'error': 'This poll has ended'}, status=400)

    option_id = request.data.get('option_id')
    if not option_id:
        return Response({'error': 'option_id is required'}, status=400)

    try:
        option = PollOption.objects.get(id=option_id, poll=poll)
    except PollOption.DoesNotExist:
        return Response({'error': 'Option not found'}, status=404)

    if PollVote.objects.filter(poll=poll, user=request.user).exists():
        return Response({'error': 'You have already voted on this poll.'}, status=400)

    PollVote.objects.create(poll=poll, user=request.user, option=option)
    option.votes += 1
    option.save()

    total_votes = poll.get_total_votes()
    options_data = [
        {'id': opt.id, 'text': opt.text, 'votes': opt.votes, 'order': opt.order}
        for opt in poll.options.all().order_by('order')
    ]
    return Response({
        'id': poll.id,
        'question': poll.question,
        'options': options_data,
        'total_votes': total_votes,
        'user_vote_id': option.id,
        'is_active': poll.is_active,
        'ends_at': poll.ends_at.isoformat() if poll.ends_at else None,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def poll_voters(request, poll_id):
    """
    Return per-option voter lists. Only accessible by the post owner.
    """
    from social.models import Poll, PollVote

    try:
        poll = Poll.objects.get(id=poll_id)
    except Poll.DoesNotExist:
        return Response({'error': 'Poll not found'}, status=404)

    if poll.post.user != request.user:
        return Response({'error': 'Permission denied'}, status=403)

    options_data = []
    for opt in poll.options.all().order_by('order'):
        votes = PollVote.objects.filter(option=opt).select_related('user')
        voters = []
        for v in votes:
            voters.append({
                'username': v.user.username,
                'display_name': getattr(v.user, 'display_name', '') or v.user.username,
                'avatar_url': getattr(v.user, 'avatar_url', None),
            })
        options_data.append({
            'id': str(opt.id),
            'text': opt.text,
            'voters': voters,
        })

    return Response({'options': options_data})


def _lb_user(u):
    return {
        'id': str(u.id),
        'username': u.username,
        'display_name': getattr(u, 'display_name', '') or u.username,
        'avatar_url': u.avatar_url if hasattr(u, 'avatar_url') else None,
        'current_streak': u.current_streak,
        'total_workouts': u.total_workouts,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def leaderboard(request):
    """
    Streak-based leaderboard.
    ?tab=friends (default) — following + self, ranked by -current_streak, -total_workouts
    ?tab=gym[&gym_id=<uuid>] — users enrolled in the selected gym
    """
    from accounts.models import User

    tab = request.query_params.get('tab', 'friends')

    if tab == 'gym':
        enrolled_gyms = list(request.user.enrolled_gyms.all())
        gym_id_param = request.query_params.get('gym_id')
        selected_gym = None
        if gym_id_param:
            selected_gym = next((g for g in enrolled_gyms if str(g.id) == gym_id_param), None)
        if not selected_gym and enrolled_gyms:
            selected_gym = enrolled_gyms[0]

        gyms_data = [{'id': str(g.id), 'name': g.name} for g in enrolled_gyms]

        if not selected_gym:
            return Response({
                'tab': 'gym',
                'gym_id': None,
                'gym_name': None,
                'enrolled_gyms': gyms_data,
                'leaderboard': [],
                'my_rank': None,
            })

        gym_qs = (
            User.objects.filter(enrolled_gyms=selected_gym)
            .order_by('-current_streak', '-total_workouts')
            .only('id', 'username', 'display_name', 'current_streak', 'total_workouts', 'avatar')
        )
        ranked = [{'rank': i + 1, 'user': _lb_user(u)} for i, u in enumerate(gym_qs)]
        my_rank = next((e['rank'] for e in ranked if e['user']['id'] == str(request.user.id)), None)

        return Response({
            'tab': 'gym',
            'gym_id': str(selected_gym.id),
            'gym_name': selected_gym.name,
            'enrolled_gyms': gyms_data,
            'leaderboard': ranked,
            'my_rank': my_rank,
        })

    # Friends: following + self
    following_ids = list(
        Follow.objects.filter(follower=request.user).values_list('following_id', flat=True)
    )
    all_ids = following_ids + [request.user.id]
    friends_qs = (
        User.objects.filter(id__in=all_ids)
        .order_by('-current_streak', '-total_workouts')
        .only('id', 'username', 'display_name', 'current_streak', 'total_workouts', 'avatar')
    )
    ranked = [{'rank': i + 1, 'user': _lb_user(u)} for i, u in enumerate(friends_qs)]
    my_rank = next((e['rank'] for e in ranked if e['user']['id'] == str(request.user.id)), None)

    return Response({
        'tab': 'friends',
        'gym_id': None,
        'gym_name': None,
        'enrolled_gyms': [],
        'leaderboard': ranked,
        'my_rank': my_rank,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def new_followers(request):
    """
    List recent followers that the user hasn't followed back.
    These appear as 'new follower' notifications in the Pending Invitations section.
    """
    # Users who follow me but I don't follow back
    my_following_ids = Follow.objects.filter(
        follower=request.user
    ).values_list('following_id', flat=True)

    new_follows = Follow.objects.filter(
        following=request.user,
    ).exclude(
        follower_id__in=my_following_ids,
    ).select_related('follower').order_by('-created_at')[:20]

    data = [
        {
            'id': str(f.id),
            'user_id': str(f.follower.id),
            'username': f.follower.username,
            'display_name': getattr(f.follower, 'display_name', '') or f.follower.username,
            'followed_at': f.created_at.isoformat(),
        }
        for f in new_follows
    ]

    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mutual_follows(request):
    """
    List users who mutually follow the current user.
    Optional: ?q=<search> to filter by username.
    """
    my_following_ids = set(
        Follow.objects.filter(follower=request.user).values_list('following_id', flat=True)
    )
    my_follower_ids = set(
        Follow.objects.filter(following=request.user).values_list('follower_id', flat=True)
    )

    mutual_ids = my_following_ids & my_follower_ids

    from accounts.models import User
    qs = User.objects.filter(id__in=mutual_ids)

    query = request.query_params.get('q', '').strip()[:100]
    if query:
        qs = qs.filter(username__icontains=query)

    qs = qs[:50]

    data = [
        {
            'id': str(u.id),
            'username': u.username,
            'display_name': getattr(u, 'display_name', '') or u.username,
        }
        for u in qs
    ]

    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def vote_poll(request, poll_id):
    from social.models import Poll, PollOption, PollVote
    try:
        poll = Poll.objects.get(id=poll_id)
    except Poll.DoesNotExist:
        return Response({'error': 'Poll not found'}, status=404)

    if not poll.is_active:
        return Response({'error': 'This poll has ended'}, status=400)

    option_id = request.data.get('option_id')
    if not option_id:
        return Response({'error': 'option_id is required'}, status=400)

    try:
        option = PollOption.objects.get(id=option_id, poll=poll)
    except PollOption.DoesNotExist:
        return Response({'error': 'Option not found'}, status=404)

    if PollVote.objects.filter(poll=poll, user=request.user).exists():
        return Response({'error': 'You have already voted on this poll.'}, status=400)

    PollVote.objects.create(poll=poll, user=request.user, option=option)
    option.votes += 1
    option.save()

    total_votes = poll.get_total_votes()
    options_data = [
        {'id': opt.id, 'text': opt.text, 'votes': opt.votes, 'order': opt.order}
        for opt in poll.options.all().order_by('order')
    ]
    return Response({
        'id': poll.id,
        'question': poll.question,
        'options': options_data,
        'total_votes': total_votes,
        'user_vote_id': option.id,
        'is_active': poll.is_active,
        'ends_at': poll.ends_at.isoformat() if poll.ends_at else None,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def poll_voters(request, poll_id):
    from social.models import Poll, PollVote
    try:
        poll = Poll.objects.get(id=poll_id)
    except Poll.DoesNotExist:
        return Response({'error': 'Poll not found'}, status=404)

    if poll.post.user != request.user:
        return Response({'error': 'Permission denied'}, status=403)

    options_data = []
    for opt in poll.options.all().order_by('order'):
        votes = PollVote.objects.filter(option=opt).select_related('user')
        voters = [
            {
                'username': v.user.username,
                'display_name': getattr(v.user, 'display_name', '') or v.user.username,
                'avatar_url': getattr(v.user, 'avatar_url', None),
            }
            for v in votes
        ]
        options_data.append({'id': str(opt.id), 'text': opt.text, 'voters': voters})

    return Response({'options': options_data})


# ── Post detail ────────────────────────────────────────────────────────────────


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def post_detail(request, post_id):
    """
    GET /api/social/posts/<post_id>/
    Returns a single post or check-in as a FeedItem-shaped dict.
    item_type hint: ?type=checkin to skip Post lookup and go straight to QuickWorkout.
    """
    from social.models import Post, QuickWorkout, Reaction, Comment
    from workouts.models import PersonalRecord

    item_type_hint = request.query_params.get('type', '')

    if item_type_hint != 'checkin':
        post = Post.objects.select_related('user', 'workout').filter(id=post_id).first()
        if post:
            like_count = Reaction.objects.filter(post=post).count()
            comment_count = Comment.objects.filter(post=post).count()
            user_liked = Reaction.objects.filter(post=post, user=request.user).exists()

            pr = PersonalRecord.objects.filter(post=post).first()
            personal_record = None
            if pr:
                personal_record = {'exercise_name': pr.exercise_name, 'value': pr.value, 'unit': pr.unit}

            workout_data = None
            if post.workout:
                from workouts.models import Exercise, ExerciseSet
                exercises = list(Exercise.objects.filter(workout=post.workout).order_by('order'))
                total_sets = ExerciseSet.objects.filter(exercise__workout=post.workout).count()
                duration_str = ''
                if post.workout.duration:
                    total_seconds = int(post.workout.duration.total_seconds())
                    hours = total_seconds // 3600
                    minutes = (total_seconds % 3600) // 60
                    duration_str = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"
                workout_data = {
                    'id': str(post.workout.id),
                    'name': post.workout.name,
                    'exercise_count': len(exercises),
                    'total_sets': total_sets,
                    'duration': duration_str,
                    'exercises': [e.name for e in exercises[:3]],
                }

            photo_url = None
            video_url = None
            if post.photo:
                from media.utils import build_media_url
                photo_url = build_media_url(post.photo.name)
            if post.video:
                from media.utils import build_media_url
                video_url = build_media_url(post.video.name)

            poll_data = None
            try:
                poll = post.poll
                user_vote_id = None
                try:
                    from social.models import PollVote
                    vote = PollVote.objects.filter(poll=poll, user=request.user).first()
                    if vote:
                        user_vote_id = vote.option_id
                except Exception:
                    pass
                poll_data = {
                    'id': poll.id,
                    'question': poll.question,
                    'options': [
                        {
                            'id': opt.id,
                            'text': opt.text,
                            'votes': opt.votes,
                            'order': opt.order,
                        }
                        for opt in poll.options.all()
                    ],
                    'total_votes': poll.get_total_votes(),
                    'user_vote_id': user_vote_id,
                    'is_active': poll.is_active,
                    'ends_at': poll.ends_at.isoformat() if poll.ends_at else None,
                }
            except Exception:
                pass

            detected_type = 'workout' if post.workout_id else 'post'

            return Response({
                'id': str(post.id),
                'type': detected_type,
                'user': {
                    'id': str(post.user.id),
                    'username': post.user.username,
                    'display_name': getattr(post.user, 'display_name', '') or post.user.username,
                    'avatar_url': getattr(post.user, 'avatar_url', None),
                    'streak': getattr(post.user, 'current_streak', 0),
                },
                'created_at': post.created_at.isoformat(),
                'description': post.description or '',
                'location_name': None,
                'photo_url': photo_url,
                'video_url': video_url,
                'link_url': getattr(post, 'link_url', None),
                'like_count': like_count,
                'comment_count': comment_count,
                'user_liked': user_liked,
                'workout': workout_data,
                'personal_record': personal_record,
                'poll': poll_data,
            })

    checkin = QuickWorkout.objects.select_related('user', 'location').filter(id=post_id).first()
    if checkin:
        like_count = Reaction.objects.filter(quick_workout=checkin).count()
        comment_count = Comment.objects.filter(quick_workout=checkin).count()
        user_liked = Reaction.objects.filter(quick_workout=checkin, user=request.user).exists()

        photo_url = None
        try:
            from media.utils import get_media_url
            photo_url = get_media_url('quick_workout', str(checkin.id))
        except Exception:
            pass

        return Response({
            'id': str(checkin.id),
            'type': 'checkin',
            'user': {
                'id': str(checkin.user.id),
                'username': checkin.user.username,
                'display_name': getattr(checkin.user, 'display_name', '') or checkin.user.username,
                'avatar_url': getattr(checkin.user, 'avatar_url', None),
                'streak': getattr(checkin.user, 'current_streak', 0),
            },
            'created_at': checkin.created_at.isoformat(),
            'description': checkin.description or '',
            'location_name': checkin.location_name or (checkin.location.name if checkin.location else None),
            'photo_url': photo_url,
            'video_url': None,
            'link_url': None,
            'like_count': like_count,
            'comment_count': comment_count,
            'user_liked': user_liked,
            'workout': None,
            'personal_record': None,
        })

    return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)


# ── Share ──────────────────────────────────────────────────────────────────────


class ShareRecipientsView(APIView):
    """
    GET /api/social/share/recipients/?q=
    Returns friends, group chats, and orgs the user can share a post to.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from accounts.models import User
        from groups.models import Group, GroupMember
        from organizations.models import Organization, OrgMember
        from messaging.models import InboxEntry

        q = (request.query_params.get('q') or '').strip()[:100]

        # Mutual-follow ids (needed for both paths)
        my_following_ids = set(
            Follow.objects.filter(follower=request.user).values_list('following_id', flat=True)
        )
        my_follower_ids = set(
            Follow.objects.filter(following=request.user).values_list('follower_id', flat=True)
        )
        mutual_ids = my_following_ids & my_follower_ids

        if q:
            # Full filtered search
            friends_qs = (
                User.objects.filter(id__in=mutual_ids)
                .filter(models.Q(username__icontains=q) | models.Q(display_name__icontains=q))
                [:20]
            )
            member_group_ids = GroupMember.objects.filter(
                user=request.user
            ).values_list('group_id', flat=True)
            groups_qs = Group.objects.filter(id__in=member_group_ids, name__icontains=q)[:10]
            admin_org_ids = OrgMember.objects.filter(
                user=request.user, role__in=['admin', 'creator']
            ).values_list('org_id', flat=True)
            orgs_qs = Organization.objects.filter(id__in=admin_org_ids, name__icontains=q)[:10]
        else:
            # Default: top 5 most recently messaged friends, top 3 groups, all admin orgs
            recent_partner_ids = list(
                InboxEntry.objects
                .filter(user=request.user, partner__isnull=False)
                .order_by('-latest_message_at')
                .values_list('partner_id', flat=True)[:20]
            )
            # Keep only mutual follows, preserve recency order
            ordered_friend_ids = [i for i in recent_partner_ids if i in mutual_ids][:5]
            friends_qs = sorted(
                User.objects.filter(id__in=ordered_friend_ids),
                key=lambda u: ordered_friend_ids.index(u.id)
            )

            recent_group_ids = list(
                InboxEntry.objects
                .filter(user=request.user, group__isnull=False)
                .order_by('-latest_message_at')
                .values_list('group_id', flat=True)[:3]
            )
            groups_qs = sorted(
                Group.objects.filter(id__in=recent_group_ids),
                key=lambda g: recent_group_ids.index(g.id)
            )

            admin_org_ids = list(
                OrgMember.objects.filter(
                    user=request.user, role__in=['admin', 'creator']
                ).values_list('org_id', flat=True)
            )
            orgs_qs = Organization.objects.filter(id__in=admin_org_ids)

        friends_data = [
            {
                'id': str(u.id),
                'display_name': getattr(u, 'display_name', '') or u.username,
                'username': u.username,
                'avatar_url': u.avatar_url if hasattr(u, 'avatar_url') else None,
                'type': 'user',
            }
            for u in friends_qs
        ]
        groups_data = [
            {
                'id': str(g.id),
                'name': g.name,
                'avatar_url': g.avatar_url if hasattr(g, 'avatar_url') else None,
                'type': 'group',
            }
            for g in groups_qs
        ]
        orgs_data = [
            {
                'id': str(o.id),
                'name': o.name,
                'avatar_url': o.avatar_url if hasattr(o, 'avatar_url') else None,
                'type': 'org',
            }
            for o in orgs_qs
        ]

        return Response({'friends': friends_data, 'groups': groups_data, 'orgs': orgs_data})


class SharePostView(APIView):
    """
    POST /api/social/share/send/
    Body: { post_id, item_type, recipient_ids, group_ids, org_ids, message }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        from messaging.services import send_dm, send_group_message
        from organizations.models import Organization, OrgMember, Announcement

        post_id = (request.data.get('post_id') or '').strip()
        item_type = (request.data.get('item_type') or 'post').strip()
        recipient_ids = request.data.get('recipient_ids') or []
        group_ids = request.data.get('group_ids') or []
        org_ids = request.data.get('org_ids') or []
        message = (request.data.get('message') or '').strip()

        if not post_id:
            return Response({'error': 'post_id is required'}, status=400)

        # Resolve post or checkin
        shared_post_id = None
        shared_checkin_id = None
        if item_type == 'post':
            from social.models import Post
            try:
                Post.objects.get(id=post_id)
                shared_post_id = post_id
            except Post.DoesNotExist:
                return Response({'error': 'Post not found'}, status=404)
        else:
            from social.models import QuickWorkout
            try:
                QuickWorkout.objects.get(id=post_id)
                shared_checkin_id = post_id
            except QuickWorkout.DoesNotExist:
                return Response({'error': 'Check-in not found'}, status=404)

        sent_count = 0
        errors = []

        # DMs to individual friends
        for rid in recipient_ids:
            try:
                send_dm(
                    sender=request.user,
                    recipient_id=rid,
                    content=message,
                    post_id=shared_post_id,
                    quick_workout_id=shared_checkin_id,
                )
                sent_count += 1
            except Exception as e:
                errors.append(str(e))

        # Group messages
        for gid in group_ids:
            try:
                send_group_message(
                    sender=request.user,
                    group_id=gid,
                    content=message,
                    post_id=shared_post_id,
                    quick_workout_id=shared_checkin_id,
                )
                sent_count += 1
            except Exception as e:
                errors.append(str(e))

        # Org announcements — only if user is admin/creator
        for oid in org_ids:
            try:
                membership = OrgMember.objects.get(
                    org_id=oid, user=request.user, role__in=['admin', 'creator']
                )
                content = message if message else f'Shared a {item_type}'
                Announcement.objects.create(
                    org=membership.org,
                    author=request.user,
                    content=content,
                )
                sent_count += 1
            except OrgMember.DoesNotExist:
                errors.append(f'Not an admin of org {oid}')
            except Exception as e:
                errors.append(str(e))

        return Response({'sent_count': sent_count, 'errors': errors})
