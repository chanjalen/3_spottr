from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from social.models import Follow


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_post(request):
    """
    Create a post. Accepts multipart/form-data for photo/video uploads.
    Fields: text, workout_id (optional), pr_exercise_name, pr_value, pr_unit,
            photo (file), video (file).
    """
    from social.models import Post

    text = (request.data.get('text') or '').strip()
    workout_id = (request.data.get('workout_id') or '').strip()
    pr_exercise_name = (request.data.get('pr_exercise_name') or '').strip()
    pr_value = (request.data.get('pr_value') or '').strip()
    pr_unit = (request.data.get('pr_unit') or 'lbs').strip()
    photo = request.FILES.get('photo')
    video = request.FILES.get('video')

    has_pr = bool(pr_exercise_name and pr_value)

    if not text and not photo and not video and not has_pr and not workout_id:
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
        post.photo = photo
        post.save(update_fields=['photo'])
        try:
            from media.utils import create_media_asset
            from media.models import MediaLink
            asset = create_media_asset(request.user, photo, post.photo.name, 'image', already_saved=True)
            MediaLink.objects.create(asset=asset, destination_type='post', destination_id=str(post.id), type='inline')
        except Exception:
            pass

    if video:
        post.video = video
        post.save(update_fields=['video'])
        try:
            from media.utils import create_media_asset
            from media.models import MediaLink
            asset = create_media_asset(request.user, video, post.video.name, 'video', already_saved=True)
            MediaLink.objects.create(asset=asset, destination_type='post', destination_id=str(post.id), type='inline')
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

    return Response({'success': True, 'post_id': str(post.id)})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_checkin(request):
    """
    Create a quick check-in (QuickWorkout). Updates streak.
    Fields: activity (required), description, gym_id, location_name, photo (file).
    """
    from social.models import QuickWorkout
    from django.db.models import F as DjF

    activity = (request.data.get('activity') or '').strip()
    description = (request.data.get('description') or '').strip()
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

    query = request.query_params.get('q', '').strip()
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
