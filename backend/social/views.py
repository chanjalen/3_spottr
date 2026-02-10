import json
import os
import uuid
from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST, require_GET
from django.conf import settings

from .models import QuickWorkout, Post, Comment, Reaction
from gyms.models import Gym


def feed_view(request):
    """
    Display the main feed with all posts and quick workouts.
    """
    # Get quick workouts (check-ins) that are visible to main feed
    quick_workouts = QuickWorkout.objects.filter(
        visibility='main'
    ).select_related('user', 'location').order_by('-created_at')[:50]

    # Get regular posts
    posts = Post.objects.filter(
        visibility='main'
    ).select_related('user', 'location').order_by('-created_at')[:50]

    # Combine and sort by created_at
    feed_items = []

    for qw in quick_workouts:
        like_count = Reaction.objects.filter(quick_workout=qw).count()
        comment_count = Comment.objects.filter(quick_workout=qw).count()
        user_liked = False
        if request.user.is_authenticated:
            user_liked = Reaction.objects.filter(quick_workout=qw, user=request.user).exists()

        feed_items.append({
            'type': 'checkin',
            'id': str(qw.id),
            'user': qw.user,
            'location': qw.location,
            'location_name': qw.location_name or (qw.location.name if qw.location else ''),
            'workout_type': qw.type.replace('_', ' ').title() if qw.type else '',
            'description': qw.description,
            'created_at': qw.created_at,
            'photo_url': get_checkin_photo(qw.id),
            'like_count': like_count,
            'comment_count': comment_count,
            'user_liked': user_liked,
        })

    for post in posts:
        like_count = Reaction.objects.filter(post=post).count()
        comment_count = Comment.objects.filter(post=post).count()
        user_liked = False
        if request.user.is_authenticated:
            user_liked = Reaction.objects.filter(post=post, user=request.user).exists()

        post_data = {
            'type': 'workout' if post.workout else 'post',
            'id': str(post.id),
            'user': post.user,
            'location': post.location,
            'description': post.description,
            'created_at': post.created_at,
            'photo_url': post.photo.url if post.photo else None,
            'like_count': like_count,
            'comment_count': comment_count,
            'user_liked': user_liked,
        }

        # Add workout details if this is a workout post
        if post.workout:
            workout = post.workout
            from workouts.models import Exercise, ExerciseSet

            exercises = Exercise.objects.filter(workout=workout)
            exercise_count = exercises.count()
            total_sets = ExerciseSet.objects.filter(exercise__workout=workout).count()

            # Format duration
            if workout.duration:
                total_seconds = int(workout.duration.total_seconds())
                hours = total_seconds // 3600
                minutes = (total_seconds % 3600) // 60
                if hours > 0:
                    duration_str = f"{hours}h {minutes}m"
                else:
                    duration_str = f"{minutes}m"
            else:
                duration_str = "--"

            post_data['workout'] = {
                'id': str(workout.id),
                'name': workout.name,
                'duration': duration_str,
                'exercise_count': exercise_count,
                'total_sets': total_sets,
                'exercises': [e.name for e in exercises[:3]],
            }

        feed_items.append(post_data)

    # Sort by created_at descending
    feed_items.sort(key=lambda x: x['created_at'], reverse=True)

    return render(request, 'social/feed.html', {
        'feed_items': feed_items,
    })


def get_checkin_photo(checkin_id):
    """
    Get the photo URL for a check-in if it exists.
    """
    photo_path = os.path.join(settings.MEDIA_ROOT, 'checkins', f'{checkin_id}.jpg')
    if os.path.exists(photo_path):
        return f'{settings.MEDIA_URL}checkins/{checkin_id}.jpg'
    return None


@login_required
@require_POST
def create_checkin_view(request):
    """
    Create a new quick check-in post.
    """
    try:
        gym_id = request.POST.get('gym')
        activity = request.POST.get('activity')
        photo = request.FILES.get('photo')

        if not gym_id or not activity:
            return JsonResponse({
                'success': False,
                'error': 'Gym and activity are required'
            }, status=400)

        # Get the gym
        try:
            gym = Gym.objects.get(id=gym_id)
        except Gym.DoesNotExist:
            return JsonResponse({
                'success': False,
                'error': 'Gym not found'
            }, status=404)

        # Create the quick workout (check-in)
        checkin = QuickWorkout.objects.create(
            user=request.user,
            location=gym,
            location_name=gym.name,
            type=activity,
            description=f'{activity.replace("_", " ").title()} workout',
            visibility='main',
        )

        # Save the photo if provided
        if photo:
            checkins_dir = os.path.join(settings.MEDIA_ROOT, 'checkins')
            os.makedirs(checkins_dir, exist_ok=True)

            photo_path = os.path.join(checkins_dir, f'{checkin.id}.jpg')
            with open(photo_path, 'wb+') as destination:
                for chunk in photo.chunks():
                    destination.write(chunk)

        return JsonResponse({
            'success': True,
            'checkin_id': checkin.id,
            'message': 'Check-in posted successfully!'
        })

    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


def get_user_posts(user):
    """
    Get all posts and check-ins for a user.
    """
    quick_workouts = QuickWorkout.objects.filter(
        user=user
    ).select_related('location').order_by('-created_at')

    posts = Post.objects.filter(
        user=user
    ).select_related('location').order_by('-created_at')

    user_posts = []

    for qw in quick_workouts:
        user_posts.append({
            'type': 'checkin',
            'id': qw.id,
            'location': qw.location,
            'location_name': qw.location_name or (qw.location.name if qw.location else ''),
            'workout_type': qw.type.replace('_', ' ').title() if qw.type else '',
            'description': qw.description,
            'created_at': qw.created_at,
            'photo_url': get_checkin_photo(qw.id),
        })

    for post in posts:
        post_data = {
            'type': 'workout' if post.workout else 'post',
            'id': post.id,
            'location': post.location,
            'description': post.description,
            'created_at': post.created_at,
            'photo_url': post.photo.url if post.photo else None,
        }

        # Add workout details if this is a workout post
        if post.workout:
            workout = post.workout
            from workouts.models import Exercise, ExerciseSet

            exercises = Exercise.objects.filter(workout=workout)
            exercise_count = exercises.count()
            total_sets = ExerciseSet.objects.filter(exercise__workout=workout).count()

            post_data['workout'] = {
                'id': str(workout.id),
                'name': workout.name,
                'exercise_count': exercise_count,
                'total_sets': total_sets,
            }

        user_posts.append(post_data)

    user_posts.sort(key=lambda x: x['created_at'], reverse=True)

    return user_posts


@login_required
@require_POST
def toggle_like_post_view(request, post_id):
    """
    Toggle like on a post. One like per user per post.
    """
    post = get_object_or_404(Post, id=post_id)

    # Check if user already liked this post
    existing_reaction = Reaction.objects.filter(
        post=post,
        user=request.user
    ).first()

    if existing_reaction:
        # Unlike - remove the reaction
        existing_reaction.delete()
        liked = False
    else:
        # Like - create a reaction
        Reaction.objects.create(
            post=post,
            user=request.user,
            type='like'
        )
        liked = True

    # Get updated like count
    like_count = Reaction.objects.filter(post=post).count()

    return JsonResponse({
        'success': True,
        'liked': liked,
        'like_count': like_count,
    })


@login_required
@require_POST
def toggle_like_checkin_view(request, checkin_id):
    """
    Toggle like on a quick workout (check-in). One like per user.
    """
    checkin = get_object_or_404(QuickWorkout, id=checkin_id)

    # Check if user already liked this checkin
    existing_reaction = Reaction.objects.filter(
        quick_workout=checkin,
        user=request.user
    ).first()

    if existing_reaction:
        existing_reaction.delete()
        liked = False
    else:
        Reaction.objects.create(
            quick_workout=checkin,
            user=request.user,
            type='like'
        )
        liked = True

    like_count = Reaction.objects.filter(quick_workout=checkin).count()

    return JsonResponse({
        'success': True,
        'liked': liked,
        'like_count': like_count,
    })


@login_required
@require_POST
def toggle_like_comment_view(request, comment_id):
    """
    Toggle like on a comment. One like per user per comment.
    """
    comment = get_object_or_404(Comment, id=comment_id)

    existing_reaction = Reaction.objects.filter(
        comment=comment,
        user=request.user
    ).first()

    if existing_reaction:
        existing_reaction.delete()
        liked = False
    else:
        Reaction.objects.create(
            comment=comment,
            user=request.user,
            type='like'
        )
        liked = True

    like_count = Reaction.objects.filter(comment=comment).count()

    return JsonResponse({
        'success': True,
        'liked': liked,
        'like_count': like_count,
    })


@login_required
@require_GET
def get_comments_view(request, post_id):
    """
    Get all comments for a post.
    """
    post = get_object_or_404(Post, id=post_id)

    comments = Comment.objects.filter(post=post).select_related('user').order_by('created_at')

    comments_data = []
    for comment in comments:
        like_count = Reaction.objects.filter(comment=comment).count()
        user_liked = Reaction.objects.filter(comment=comment, user=request.user).exists()

        comments_data.append({
            'id': str(comment.id),
            'user': {
                'id': str(comment.user.id),
                'display_name': comment.user.display_name,
                'username': comment.user.username,
                'avatar_url': comment.user.avatar.url if comment.user.avatar else None,
            },
            'text': comment.description,
            'created_at': comment.created_at.isoformat(),
            'time_ago': get_time_ago(comment.created_at),
            'like_count': like_count,
            'user_liked': user_liked,
            'is_owner': comment.user == request.user,
        })

    return JsonResponse({
        'success': True,
        'comments': comments_data,
        'count': len(comments_data),
    })


@login_required
@require_GET
def get_checkin_comments_view(request, checkin_id):
    """
    Get all comments for a check-in (quick workout).
    """
    checkin = get_object_or_404(QuickWorkout, id=checkin_id)

    comments = Comment.objects.filter(quick_workout=checkin).select_related('user').order_by('created_at')

    comments_data = []
    for comment in comments:
        like_count = Reaction.objects.filter(comment=comment).count()
        user_liked = Reaction.objects.filter(comment=comment, user=request.user).exists()

        comments_data.append({
            'id': str(comment.id),
            'user': {
                'id': str(comment.user.id),
                'display_name': comment.user.display_name,
                'username': comment.user.username,
                'avatar_url': comment.user.avatar.url if comment.user.avatar else None,
            },
            'text': comment.description,
            'created_at': comment.created_at.isoformat(),
            'time_ago': get_time_ago(comment.created_at),
            'like_count': like_count,
            'user_liked': user_liked,
            'is_owner': comment.user == request.user,
        })

    return JsonResponse({
        'success': True,
        'comments': comments_data,
        'count': len(comments_data),
    })


def get_time_ago(dt):
    """Helper to format time ago string."""
    from django.utils import timezone
    now = timezone.now()
    diff = now - dt

    seconds = diff.total_seconds()
    if seconds < 60:
        return 'just now'
    elif seconds < 3600:
        minutes = int(seconds / 60)
        return f'{minutes}m ago'
    elif seconds < 86400:
        hours = int(seconds / 3600)
        return f'{hours}h ago'
    else:
        days = int(seconds / 86400)
        return f'{days}d ago'


@login_required
@require_POST
def add_comment_view(request, post_id):
    """
    Add a comment to a post. Max 15 comments per user per post.
    """
    post = get_object_or_404(Post, id=post_id)

    data = json.loads(request.body)
    text = data.get('text', '').strip()

    if not text:
        return JsonResponse({
            'success': False,
            'error': 'Comment text is required'
        }, status=400)

    if len(text) > 500:
        return JsonResponse({
            'success': False,
            'error': 'Comment is too long (max 500 characters)'
        }, status=400)

    # Check user's comment count on this post
    user_comment_count = Comment.objects.filter(post=post, user=request.user).count()
    if user_comment_count >= 15:
        return JsonResponse({
            'success': False,
            'error': 'You have reached the maximum number of comments (15) on this post'
        }, status=400)

    # Create the comment
    comment = Comment.objects.create(
        post=post,
        user=request.user,
        description=text,
    )

    return JsonResponse({
        'success': True,
        'comment': {
            'id': str(comment.id),
            'user': {
                'id': str(request.user.id),
                'display_name': request.user.display_name,
                'username': request.user.username,
                'avatar_url': request.user.avatar.url if request.user.avatar else None,
            },
            'text': comment.description,
            'created_at': comment.created_at.isoformat(),
            'time_ago': 'just now',
            'like_count': 0,
            'user_liked': False,
            'is_owner': True,
        }
    })


@login_required
@require_POST
def add_checkin_comment_view(request, checkin_id):
    """
    Add a comment to a check-in. Max 15 comments per user per check-in.
    """
    checkin = get_object_or_404(QuickWorkout, id=checkin_id)

    data = json.loads(request.body)
    text = data.get('text', '').strip()

    if not text:
        return JsonResponse({
            'success': False,
            'error': 'Comment text is required'
        }, status=400)

    if len(text) > 500:
        return JsonResponse({
            'success': False,
            'error': 'Comment is too long (max 500 characters)'
        }, status=400)

    user_comment_count = Comment.objects.filter(quick_workout=checkin, user=request.user).count()
    if user_comment_count >= 15:
        return JsonResponse({
            'success': False,
            'error': 'You have reached the maximum number of comments (15) on this post'
        }, status=400)

    comment = Comment.objects.create(
        quick_workout=checkin,
        user=request.user,
        description=text,
    )

    return JsonResponse({
        'success': True,
        'comment': {
            'id': str(comment.id),
            'user': {
                'id': str(request.user.id),
                'display_name': request.user.display_name,
                'username': request.user.username,
                'avatar_url': request.user.avatar.url if request.user.avatar else None,
            },
            'text': comment.description,
            'created_at': comment.created_at.isoformat(),
            'time_ago': 'just now',
            'like_count': 0,
            'user_liked': False,
            'is_owner': True,
        }
    })


@login_required
@require_POST
def delete_comment_view(request, comment_id):
    """
    Delete a comment. Only the comment owner can delete it.
    """
    comment = get_object_or_404(Comment, id=comment_id)

    if comment.user != request.user:
        return JsonResponse({
            'success': False,
            'error': 'You can only delete your own comments'
        }, status=403)

    comment.delete()

    return JsonResponse({'success': True})
