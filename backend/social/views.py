import json
import os
import uuid
from django.shortcuts import render, redirect
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.conf import settings

from .models import QuickWorkout, Post
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
        feed_items.append({
            'type': 'checkin',
            'id': qw.id,
            'user': qw.user,
            'location': qw.location,
            'location_name': qw.location_name or (qw.location.name if qw.location else ''),
            'workout_type': qw.type.replace('_', ' ').title() if qw.type else '',
            'description': qw.description,
            'created_at': qw.created_at,
            'photo_url': get_checkin_photo(qw.id),
        })

    for post in posts:
        feed_items.append({
            'type': 'post',
            'id': post.id,
            'user': post.user,
            'location': post.location,
            'description': post.description,
            'created_at': post.created_at,
        })

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
        user_posts.append({
            'type': 'post',
            'id': post.id,
            'location': post.location,
            'description': post.description,
            'created_at': post.created_at,
        })

    user_posts.sort(key=lambda x: x['created_at'], reverse=True)

    return user_posts
