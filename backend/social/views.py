import json
import os
import uuid
from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST, require_GET
from django.conf import settings
from django.core.files.storage import default_storage
from django.db.models import F, Q, Max, Subquery, OuterRef, Exists, Count

from .models import QuickWorkout, Post, Comment, Reaction, Poll, PollOption, PollVote, Follow
from media.models import MediaLink
from media.utils import create_media_asset, get_media_url, build_media_url
from gyms.models import Gym, WorkoutInvite, JoinRequest
from workouts.models import PersonalRecord
from messaging.models import Message, MessageRead
from messaging.services import send_dm, send_group_message
from messaging.exceptions import NotMutualFollowError, UserBlockedError, NotGroupMemberError, PostNotFoundError
from groups.models import Group, GroupMember, GroupJoinRequest
from django.utils import timezone
from datetime import timedelta, date


@login_required
def social_view(request):
    """
    Display the social page with pending invitations, DM conversations,
    and group conversations.
    """
    user = request.user

    # === PENDING: New followers (people who follow me but I don't follow back) ===
    my_following_ids = Follow.objects.filter(follower=user).values_list('following_id', flat=True)
    new_followers = Follow.objects.filter(
        following=user
    ).exclude(
        follower_id__in=my_following_ids
    ).select_related('follower').order_by('-created_at')[:10]

    new_followers_data = []
    for f in new_followers:
        new_followers_data.append({
            'id': str(f.id),
            'user': f.follower,
            'created_at': f.created_at,
            'time_ago': get_time_ago(f.created_at),
        })

    # === PENDING: Workout invites (invites where I'm the invited user or in a group) ===
    workout_invites = WorkoutInvite.objects.filter(
        Q(invited_user=user) |
        Q(type='gym', group__members__user=user)
    ).exclude(
        user=user
    ).distinct().select_related('user', 'gym').order_by('-created_at')[:10]

    workout_invites_data = []
    for invite in workout_invites:
        workout_invites_data.append({
            'id': str(invite.id),
            'from_user': invite.user,
            'gym_name': invite.gym.name if invite.gym else '',
            'workout_type': invite.workout_type,
            'scheduled_time': invite.scheduled_time,
            'description': invite.description,
            'created_at': invite.created_at,
            'time_ago': get_time_ago(invite.created_at),
        })

    # === PENDING: Group join requests (for groups where I'm admin/creator) ===
    admin_group_ids = GroupMember.objects.filter(
        user=user, role__in=['admin', 'creator']
    ).values_list('group_id', flat=True)

    group_join_requests = GroupJoinRequest.objects.filter(
        group_id__in=admin_group_ids,
        status='pending',
    ).select_related('user', 'group').order_by('-created_at')[:10]

    group_join_requests_data = []
    for jr in group_join_requests:
        group_join_requests_data.append({
            'id': str(jr.id),
            'user': jr.user,
            'group': jr.group,
            'group_name': jr.group.name,
            'message': jr.message,
            'created_at': jr.created_at,
            'time_ago': get_time_ago(jr.created_at),
        })

    # === PENDING: Workout join requests (people requesting to join MY workout invites) ===
    workout_join_requests = JoinRequest.objects.filter(
        workout_invite__user=user,
        status='pending',
    ).select_related('user', 'workout_invite', 'workout_invite__gym').order_by('-created_at')[:10]

    workout_join_requests_data = []
    for jr in workout_join_requests:
        invite = jr.workout_invite
        workout_join_requests_data.append({
            'id': str(jr.id),
            'user': jr.user,
            'workout_type': invite.workout_type,
            'gym_name': invite.gym.name if invite.gym else '',
            'scheduled_time': invite.scheduled_time,
            'description': jr.description,
            'created_at': jr.created_at,
            'time_ago': get_time_ago(jr.created_at),
        })

    # === DM CONVERSATIONS ===
    # Get latest message per conversation partner
    dm_conversations = []
    # Get all DM partners (users I've sent to or received from)
    sent_partners = Message.objects.filter(
        sender=user, recipient__isnull=False
    ).values_list('recipient_id', flat=True).distinct()
    received_partners = Message.objects.filter(
        recipient=user
    ).values_list('sender_id', flat=True).distinct()
    partner_ids = set(list(sent_partners) + list(received_partners))

    from accounts.models import User as UserModel
    for partner_id in partner_ids:
        partner = UserModel.objects.filter(id=partner_id).first()
        if not partner:
            continue

        # Get last message between me and this partner
        last_msg = Message.objects.filter(
            Q(sender=user, recipient=partner) |
            Q(sender=partner, recipient=user)
        ).order_by('-created_at').first()

        if not last_msg:
            continue

        # Count unread messages from this partner
        unread_count = Message.objects.filter(
            sender=partner, recipient=user
        ).exclude(
            read_receipts__user=user
        ).count()

        dm_conversations.append({
            'partner': partner,
            'last_message': last_msg.content[:80],
            'last_message_time': last_msg.created_at,
            'time_ago': get_time_ago(last_msg.created_at),
            'unread_count': unread_count,
            'is_zap': last_msg.content == 'ZAP',
        })

    # Sort DM conversations by last message time
    dm_conversations.sort(key=lambda x: x['last_message_time'], reverse=True)

    # === GROUP CONVERSATIONS ===
    group_conversations = []
    my_groups = GroupMember.objects.filter(user=user).select_related('group')

    for membership in my_groups:
        group = membership.group
        member_count = GroupMember.objects.filter(group=group).count()

        # Get last message in this group
        last_msg = Message.objects.filter(group=group).order_by('-created_at').first()

        # Count unread group messages
        unread_count = 0
        if last_msg:
            unread_count = Message.objects.filter(
                group=group
            ).exclude(
                sender=user
            ).exclude(
                read_receipts__user=user
            ).count()

        group_conversations.append({
            'group': group,
            'member_count': member_count,
            'role': membership.role,
            'last_message': last_msg.content[:80] if last_msg else None,
            'last_message_sender': last_msg.sender.display_name if last_msg else None,
            'last_message_time': last_msg.created_at if last_msg else group.created_at,
            'time_ago': get_time_ago(last_msg.created_at) if last_msg else '',
            'unread_count': unread_count,
        })

    # Sort group conversations by last message time
    group_conversations.sort(key=lambda x: x['last_message_time'], reverse=True)

    # === MY GROUPS (for create/join modal) ===
    # Search results for public groups I'm not in
    my_group_ids = my_groups.values_list('group_id', flat=True)
    public_groups = Group.objects.filter(
        privacy='public'
    ).exclude(
        id__in=my_group_ids
    ).annotate(
        member_count=Count('members')
    ).order_by('-created_at')[:20]

    # Total unread count
    total_unread = sum(c['unread_count'] for c in dm_conversations) + \
                   sum(c['unread_count'] for c in group_conversations)

    # === FRIENDS (mutual follows) for new chat modal ===
    my_follower_ids = Follow.objects.filter(following=user).values_list('follower_id', flat=True)
    friends = UserModel.objects.filter(
        id__in=my_following_ids
    ).filter(
        id__in=my_follower_ids
    ).order_by('display_name')

    return render(request, 'social/social.html', {
        'new_followers': new_followers_data,
        'workout_invites': workout_invites_data,
        'group_join_requests': group_join_requests_data,
        'workout_join_requests': workout_join_requests_data,
        'dm_conversations': dm_conversations,
        'group_conversations': group_conversations,
        'public_groups': public_groups,
        'total_unread': total_unread,
        'pending_count': len(new_followers_data) + len(workout_invites_data) + len(group_join_requests_data) + len(workout_join_requests_data),
        'friends': friends,
    })


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
            'photo_url': get_media_url('post', str(post.id)) or (build_media_url(post.photo.name) if post.photo else None),
            'video_url': build_media_url(post.video.name) if post.video else None,
            'link_url': post.link_url,
            'like_count': like_count,
            'comment_count': comment_count,
            'user_liked': user_liked,
        }

        # Check for poll
        try:
            poll = post.poll
            user_voted = False
            user_vote_option = None
            if request.user.is_authenticated:
                vote = PollVote.objects.filter(poll=poll, user=request.user).first()
                if vote:
                    user_voted = True
                    user_vote_option = str(vote.option.id)

            total_votes = poll.get_total_votes()
            poll_options = []
            for opt in poll.options.all():
                percentage = round((opt.votes / total_votes * 100) if total_votes > 0 else 0)
                poll_options.append({
                    'id': str(opt.id),
                    'text': opt.text,
                    'votes': opt.votes,
                    'percentage': percentage,
                })

            post_data['poll'] = {
                'id': str(poll.id),
                'question': poll.question,
                'options': poll_options,
                'total_votes': total_votes,
                'is_active': poll.is_active,
                'user_voted': user_voted,
                'user_vote_option': user_vote_option,
            }
        except Poll.DoesNotExist:
            post_data['poll'] = None

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

        # Check for personal records attached to this post
        pr = PersonalRecord.objects.filter(post=post).first()
        if pr:
            post_data['personal_record'] = {
                'id': str(pr.id),
                'exercise_name': pr.exercise_name,
                'value': pr.value,
                'unit': pr.unit,
            }

        feed_items.append(post_data)

    # Sort by created_at descending
    feed_items.sort(key=lambda x: x['created_at'], reverse=True)

    return render(request, 'social/feed.html', {
        'feed_items': feed_items,
    })


def post_detail_view(request, post_id):
    """Display a single post with full details."""
    post = get_object_or_404(Post, id=post_id)

    like_count = Reaction.objects.filter(post=post).count()
    comment_count = Comment.objects.filter(post=post).count()
    user_liked = False
    if request.user.is_authenticated:
        user_liked = Reaction.objects.filter(post=post, user=request.user).exists()

    item = {
        'type': 'workout' if post.workout else 'post',
        'id': str(post.id),
        'user': post.user,
        'location': post.location,
        'description': post.description,
        'created_at': post.created_at,
        'photo_url': get_media_url('post', str(post.id)) or (build_media_url(post.photo.name) if post.photo else None),
        'video_url': build_media_url(post.video.name) if post.video else None,
        'link_url': post.link_url,
        'like_count': like_count,
        'comment_count': comment_count,
        'user_liked': user_liked,
    }

    # Workout details
    if post.workout:
        workout = post.workout
        from workouts.models import Exercise, ExerciseSet
        exercises = Exercise.objects.filter(workout=workout)
        exercise_count = exercises.count()
        total_sets = ExerciseSet.objects.filter(exercise__workout=workout).count()

        if workout.duration:
            total_seconds = int(workout.duration.total_seconds())
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            duration_str = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"
        else:
            duration_str = "--"

        item['workout'] = {
            'id': str(workout.id),
            'name': workout.name,
            'duration': duration_str,
            'exercise_count': exercise_count,
            'total_sets': total_sets,
            'exercises': [e.name for e in exercises[:3]],
        }

    # Personal record
    pr = PersonalRecord.objects.filter(post=post).first()
    if pr:
        item['personal_record'] = {
            'id': str(pr.id),
            'exercise_name': pr.exercise_name,
            'value': pr.value,
            'unit': pr.unit,
        }

    # Poll
    try:
        poll = post.poll
        user_voted = False
        user_vote_option = None
        if request.user.is_authenticated:
            vote = PollVote.objects.filter(poll=poll, user=request.user).first()
            if vote:
                user_voted = True
                user_vote_option = str(vote.option.id)
        total_votes = poll.get_total_votes()
        poll_options = []
        for opt in poll.options.all():
            percentage = round((opt.votes / total_votes * 100) if total_votes > 0 else 0)
            poll_options.append({
                'id': str(opt.id),
                'text': opt.text,
                'votes': opt.votes,
                'percentage': percentage,
            })
        item['poll'] = {
            'id': str(poll.id),
            'question': poll.question,
            'options': poll_options,
            'total_votes': total_votes,
            'is_active': poll.is_active,
            'user_voted': user_voted,
            'user_vote_option': user_vote_option,
        }
    except Poll.DoesNotExist:
        item['poll'] = None

    return render(request, 'social/post_detail.html', {'item': item})


def checkin_detail_view(request, checkin_id):
    """Display a single check-in with full details."""
    checkin = get_object_or_404(QuickWorkout, id=checkin_id)

    like_count = Reaction.objects.filter(quick_workout=checkin).count()
    comment_count = Comment.objects.filter(quick_workout=checkin).count()
    user_liked = False
    if request.user.is_authenticated:
        user_liked = Reaction.objects.filter(quick_workout=checkin, user=request.user).exists()

    item = {
        'type': 'checkin',
        'id': str(checkin.id),
        'user': checkin.user,
        'location': checkin.location,
        'location_name': checkin.location_name or (checkin.location.name if checkin.location else ''),
        'workout_type': checkin.type.replace('_', ' ').title() if checkin.type else '',
        'description': checkin.description,
        'created_at': checkin.created_at,
        'photo_url': get_checkin_photo(checkin.id),
        'like_count': like_count,
        'comment_count': comment_count,
        'user_liked': user_liked,
    }

    return render(request, 'social/post_detail.html', {'item': item})


def get_checkin_photo(checkin_id):
    """
    Get the photo URL for a check-in if it exists.
    """
    url = get_media_url('quick_workout', str(checkin_id))
    if url:
        return url
    # Fallback for legacy uploads without MediaAsset rows
    path = f'checkins/{checkin_id}.jpg'
    try:
        if default_storage.exists(path):
            return build_media_url(path)
    except Exception:
        pass
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

        # Increment total workouts
        request.user.total_workouts = F('total_workouts') + 1
        request.user.save(update_fields=['total_workouts'])

        # Save the photo if provided
        if photo:
            path = f'checkins/{checkin.id}.jpg'
            asset = create_media_asset(request.user, photo, path, 'image')
            MediaLink.objects.create(
                asset=asset,
                destination_type='quick_workout',
                destination_id=str(checkin.id),
                type='inline',
            )

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


def get_user_posts(user, viewer=None):
    """
    Get all posts and check-ins for a user.
    viewer is the logged-in user (for user_liked checks).
    """
    quick_workouts = QuickWorkout.objects.filter(
        user=user
    ).select_related('location').order_by('-created_at')

    posts = Post.objects.filter(
        user=user
    ).select_related('location').order_by('-created_at')

    user_posts = []

    for qw in quick_workouts:
        like_count = Reaction.objects.filter(quick_workout=qw).count()
        comment_count = Comment.objects.filter(quick_workout=qw).count()
        user_liked = False
        if viewer and viewer.is_authenticated:
            user_liked = Reaction.objects.filter(quick_workout=qw, user=viewer).exists()

        user_posts.append({
            'type': 'checkin',
            'id': qw.id,
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
        if viewer and viewer.is_authenticated:
            user_liked = Reaction.objects.filter(post=post, user=viewer).exists()

        post_data = {
            'type': 'workout' if post.workout else 'post',
            'id': post.id,
            'location': post.location,
            'description': post.description,
            'created_at': post.created_at,
            'photo_url': get_media_url('post', str(post.id)) or (build_media_url(post.photo.name) if post.photo else None),
            'video_url': build_media_url(post.video.name) if post.video else None,
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
    Get all top-level comments for a post (excluding replies).
    """
    post = get_object_or_404(Post, id=post_id)

    # Only get top-level comments (not replies)
    comments = Comment.objects.filter(post=post, parent_comment__isnull=True).select_related('user').order_by('created_at')

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
                'avatar_url': comment.user.avatar_url or None,
            },
            'text': comment.description,
            'created_at': comment.created_at.isoformat(),
            'time_ago': get_time_ago(comment.created_at),
            'like_count': like_count,
            'user_liked': user_liked,
            'is_owner': comment.user == request.user,
            'reply_count': comment.reply_count,
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
    Get all top-level comments for a check-in (quick workout).
    """
    checkin = get_object_or_404(QuickWorkout, id=checkin_id)

    # Only get top-level comments (not replies)
    comments = Comment.objects.filter(quick_workout=checkin, parent_comment__isnull=True).select_related('user').order_by('created_at')

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
                'avatar_url': comment.user.avatar_url or None,
            },
            'text': comment.description,
            'created_at': comment.created_at.isoformat(),
            'time_ago': get_time_ago(comment.created_at),
            'like_count': like_count,
            'user_liked': user_liked,
            'is_owner': comment.user == request.user,
            'reply_count': comment.reply_count,
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
                'avatar_url': request.user.avatar_url or None,
            },
            'text': comment.description,
            'created_at': comment.created_at.isoformat(),
            'time_ago': 'just now',
            'like_count': 0,
            'user_liked': False,
            'is_owner': True,
            'reply_count': 0,
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
                'avatar_url': request.user.avatar_url or None,
            },
            'text': comment.description,
            'created_at': comment.created_at.isoformat(),
            'time_ago': 'just now',
            'like_count': 0,
            'user_liked': False,
            'is_owner': True,
            'reply_count': 0,
        }
    })


@login_required
@require_POST
def delete_post_view(request, post_id):
    """Delete a post. Only the post owner can delete it."""
    post = get_object_or_404(Post, id=post_id)
    if post.user != request.user:
        return JsonResponse({'success': False, 'error': 'You can only delete your own posts'}, status=403)
    post.delete()
    # Decrement total workouts (floor at 0)
    from accounts.models import User
    User.objects.filter(pk=request.user.pk, total_workouts__gt=0).update(total_workouts=F('total_workouts') - 1)
    request.user.refresh_from_db()
    return JsonResponse({'success': True, 'total_workouts': request.user.total_workouts})


@login_required
@require_POST
def delete_checkin_view(request, checkin_id):
    """Delete a check-in. Only the owner can delete it."""
    checkin = get_object_or_404(QuickWorkout, id=checkin_id)
    if checkin.user != request.user:
        return JsonResponse({'success': False, 'error': 'You can only delete your own check-ins'}, status=403)
    # Also remove the photo file and MediaAsset/MediaLink if they exist
    photo_path = f'checkins/{checkin.id}.jpg'
    if default_storage.exists(photo_path):
        default_storage.delete(photo_path)
    # Clean up MediaLink/MediaAsset rows
    media_links = MediaLink.objects.filter(
        destination_type='quick_workout',
        destination_id=str(checkin.id),
    ).select_related('asset')
    for ml in media_links:
        ml.asset.delete()  # cascades to delete the MediaLink too
    checkin.delete()
    # Decrement total workouts (floor at 0)
    from accounts.models import User
    User.objects.filter(pk=request.user.pk, total_workouts__gt=0).update(total_workouts=F('total_workouts') - 1)
    request.user.refresh_from_db()
    return JsonResponse({'success': True, 'total_workouts': request.user.total_workouts})


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


@login_required
@require_GET
def get_comment_replies_view(request, comment_id):
    """
    Get all replies to a comment.
    """
    comment = get_object_or_404(Comment, id=comment_id)

    replies = Comment.objects.filter(parent_comment=comment).select_related('user').order_by('created_at')

    replies_data = []
    for reply in replies:
        like_count = Reaction.objects.filter(comment=reply).count()
        user_liked = Reaction.objects.filter(comment=reply, user=request.user).exists()

        replies_data.append({
            'id': str(reply.id),
            'user': {
                'id': str(reply.user.id),
                'display_name': reply.user.display_name,
                'username': reply.user.username,
                'avatar_url': reply.user.avatar_url or None,
            },
            'text': reply.description,
            'created_at': reply.created_at.isoformat(),
            'time_ago': get_time_ago(reply.created_at),
            'like_count': like_count,
            'user_liked': user_liked,
            'is_owner': reply.user == request.user,
            'reply_count': reply.reply_count,
        })

    return JsonResponse({
        'success': True,
        'replies': replies_data,
        'count': len(replies_data),
    })


@login_required
@require_POST
def add_comment_reply_view(request, comment_id):
    """
    Add a reply to a comment. Max 15 replies per user per parent comment.
    """
    parent_comment = get_object_or_404(Comment, id=comment_id)

    data = json.loads(request.body)
    text = data.get('text', '').strip()

    if not text:
        return JsonResponse({
            'success': False,
            'error': 'Reply text is required'
        }, status=400)

    if len(text) > 500:
        return JsonResponse({
            'success': False,
            'error': 'Reply is too long (max 500 characters)'
        }, status=400)

    # Check user's reply count on this comment
    user_reply_count = Comment.objects.filter(parent_comment=parent_comment, user=request.user).count()
    if user_reply_count >= 15:
        return JsonResponse({
            'success': False,
            'error': 'You have reached the maximum number of replies (15) on this comment'
        }, status=400)

    # Create the reply
    reply = Comment.objects.create(
        parent_comment=parent_comment,
        user=request.user,
        description=text,
    )

    return JsonResponse({
        'success': True,
        'reply': {
            'id': str(reply.id),
            'user': {
                'id': str(request.user.id),
                'display_name': request.user.display_name,
                'username': request.user.username,
                'avatar_url': request.user.avatar_url or None,
            },
            'text': reply.description,
            'created_at': reply.created_at.isoformat(),
            'time_ago': 'just now',
            'like_count': 0,
            'user_liked': False,
            'is_owner': True,
            'reply_count': 0,
        }
    })


@login_required
@require_POST
def create_post_view(request):
    """
    Create a new text/media post.
    Supports text, photo, link URL, tags (via hashtags in text), polls, and PRs.
    """
    # Handle both JSON and form data (for file uploads)
    content_type = request.content_type or ''

    if 'multipart/form-data' in content_type:
        text = request.POST.get('text', '').strip()
        link_url = request.POST.get('link_url', '').strip() or None
        visibility = request.POST.get('visibility', 'main')
        reply_restriction = request.POST.get('reply_restriction', 'everyone')
        photo = request.FILES.get('photo')
        video = request.FILES.get('video')

        # Poll data
        poll_question = request.POST.get('poll_question', '').strip()
        poll_options = request.POST.getlist('poll_options[]')
        poll_duration = float(request.POST.get('poll_duration', 24))

        # PR data
        pr_exercise_name = request.POST.get('pr_exercise_name', '').strip()
        pr_value = request.POST.get('pr_value', '').strip()
        pr_unit = request.POST.get('pr_unit', 'lbs')
        pr_achieved_date = request.POST.get('pr_achieved_date', '')
    else:
        data = json.loads(request.body) if request.body else {}
        text = data.get('text', '').strip()
        link_url = data.get('link_url', '').strip() or None
        visibility = data.get('visibility', 'main')
        reply_restriction = data.get('reply_restriction', 'everyone')
        photo = None
        video = None

        # Poll data
        poll_question = data.get('poll_question', '').strip()
        poll_options = data.get('poll_options', [])
        poll_duration = float(data.get('poll_duration', 24))

        # PR data
        pr_exercise_name = data.get('pr_exercise_name', '').strip()
        pr_value = data.get('pr_value', '').strip()
        pr_unit = data.get('pr_unit', 'lbs')
        pr_achieved_date = data.get('pr_achieved_date', '')

    # Check if has PR
    has_pr = bool(pr_exercise_name and pr_value)

    # Validation
    if not text and not photo and not video and not poll_question and not has_pr:
        return JsonResponse({
            'success': False,
            'error': 'Post must have text, media, poll, or a personal record'
        }, status=400)

    if len(text) > 500:
        return JsonResponse({
            'success': False,
            'error': 'Post text cannot exceed 500 characters'
        }, status=400)

    # Create the post
    post = Post.objects.create(
        user=request.user,
        description=text,
        link_url=link_url,
        visibility=visibility,
        reply_restriction=reply_restriction,
    )

    # Save photo if provided
    if photo:
        post.photo = photo
        post.save()
        # Track in MediaAsset/MediaLink (already_saved=True because ImageField saved it)
        asset = create_media_asset(request.user, photo, post.photo.name, 'image', already_saved=True)
        MediaLink.objects.create(
            asset=asset,
            destination_type='post',
            destination_id=str(post.id),
            type='inline',
        )

    # Save video if provided
    if video:
        post.video = video
        post.save()
        asset = create_media_asset(request.user, video, post.video.name, 'video', already_saved=True)
        MediaLink.objects.create(
            asset=asset,
            destination_type='post',
            destination_id=str(post.id),
            type='inline',
        )

    # Create poll if provided
    if poll_question and len(poll_options) >= 2:
        poll = Poll.objects.create(
            post=post,
            question=poll_question,
            duration_hours=max(1, int(poll_duration)),
            ends_at=timezone.now() + timedelta(hours=poll_duration),
        )

        for idx, option_text in enumerate(poll_options):
            if option_text.strip():
                PollOption.objects.create(
                    poll=poll,
                    text=option_text.strip(),
                    order=idx,
                )

    # Create PR if provided
    if has_pr:
        # Parse date
        if pr_achieved_date:
            try:
                achieved_date = date.fromisoformat(pr_achieved_date)
            except ValueError:
                achieved_date = date.today()
        else:
            achieved_date = date.today()

        # Check if there's an existing PR for this exercise
        existing_pr = PersonalRecord.objects.filter(
            user=request.user,
            exercise_name__iexact=pr_exercise_name
        ).first()

        if existing_pr:
            # Compare and only update if new value is better
            from accounts.views import is_new_pr_better
            if is_new_pr_better(pr_value, pr_unit, existing_pr.value, existing_pr.unit):
                # Update existing PR with new value and link to this post
                existing_pr.value = pr_value
                existing_pr.unit = pr_unit
                existing_pr.achieved_date = achieved_date
                existing_pr.post = post
                existing_pr.save()
        else:
            # Create new PR
            PersonalRecord.objects.create(
                user=request.user,
                post=post,
                exercise_name=pr_exercise_name,
                value=pr_value,
                unit=pr_unit,
                achieved_date=achieved_date,
            )

    return JsonResponse({
        'success': True,
        'post_id': str(post.id),
        'message': 'Post created successfully!'
    })


@login_required
@require_POST
def vote_poll_view(request, poll_id):
    """
    Vote on a poll option.
    If user has already voted, allows changing their vote.
    """
    poll = get_object_or_404(Poll, id=poll_id)

    # Check if poll is still active
    if not poll.is_active:
        return JsonResponse({
            'success': False,
            'error': 'This poll has ended'
        }, status=400)

    data = json.loads(request.body)
    option_id = data.get('option_id')

    option = get_object_or_404(PollOption, id=option_id, poll=poll)

    # Check if user already voted
    existing_vote = PollVote.objects.filter(poll=poll, user=request.user).first()

    if existing_vote:
        # User is changing their vote
        if str(existing_vote.option.id) == str(option_id):
            # Same option selected - no change needed
            pass
        else:
            # Different option - decrement old, increment new
            old_option = existing_vote.option
            old_option.votes = max(0, old_option.votes - 1)
            old_option.save()

            # Update vote to new option
            existing_vote.option = option
            existing_vote.save()

            # Increment new option
            option.votes += 1
            option.save()
    else:
        # New vote
        PollVote.objects.create(
            poll=poll,
            user=request.user,
            option=option,
        )

        # Increment vote count
        option.votes += 1
        option.save()

    # Get updated results
    total_votes = poll.get_total_votes()
    results = []
    for opt in poll.options.all():
        percentage = round((opt.votes / total_votes * 100) if total_votes > 0 else 0)
        results.append({
            'id': str(opt.id),
            'text': opt.text,
            'votes': opt.votes,
            'percentage': percentage,
        })

    return JsonResponse({
        'success': True,
        'total_votes': total_votes,
        'results': results,
        'voted_option': str(option.id),
    })


@login_required
@require_GET
def share_recipients_view(request):
    """
    Get friends (mutual follows) and groups for the share modal.
    Supports ?q= search parameter.
    """
    user = request.user
    q = request.GET.get('q', '').strip().lower()

    # Get mutual follows (friends)
    from accounts.models import User as UserModel
    my_following_ids = set(Follow.objects.filter(follower=user).values_list('following_id', flat=True))
    my_follower_ids = set(Follow.objects.filter(following=user).values_list('follower_id', flat=True))
    friend_ids = my_following_ids & my_follower_ids

    friends_qs = UserModel.objects.filter(id__in=friend_ids).order_by('display_name')
    if q:
        friends_qs = friends_qs.filter(
            Q(display_name__icontains=q) | Q(username__icontains=q)
        )

    friends = []
    for f in friends_qs[:30]:
        friends.append({
            'id': str(f.id),
            'display_name': f.display_name,
            'username': f.username,
            'avatar_url': f.avatar_url or None,
            'type': 'user',
        })

    # Get user's groups
    groups_qs = Group.objects.filter(
        members__user=user
    ).order_by('name')
    if q:
        groups_qs = groups_qs.filter(name__icontains=q)

    groups = []
    for g in groups_qs[:20]:
        groups.append({
            'id': str(g.id),
            'name': g.name,
            'type': 'group',
        })

    return JsonResponse({
        'success': True,
        'friends': friends,
        'groups': groups,
    })


@login_required
@require_POST
def share_post_view(request):
    """
    Share a post or check-in to one or more friends and/or groups.
    Body JSON: { post_id, item_type, recipient_ids: [], group_ids: [] }
    """
    data = json.loads(request.body)
    item_id = data.get('post_id', '')
    item_type = data.get('item_type', 'post')
    user_message = data.get('message', '').strip()
    recipient_ids = data.get('recipient_ids', [])
    group_ids = data.get('group_ids', [])

    if not item_id:
        return JsonResponse({'success': False, 'error': 'Item ID is required'}, status=400)

    if not recipient_ids and not group_ids:
        return JsonResponse({'success': False, 'error': 'Select at least one recipient'}, status=400)

    # Determine if this is a Post or a QuickWorkout (check-in)
    post_id_for_msg = None
    qw_id_for_msg = None
    if item_type == 'checkin':
        checkin = get_object_or_404(QuickWorkout, id=item_id)
        qw_id_for_msg = str(checkin.id)
    else:
        post = get_object_or_404(Post, id=item_id)
        post_id_for_msg = str(post.id)

    content = user_message if user_message else "Shared a post"

    sent_count = 0
    errors = []

    # Send to individual friends
    for rid in recipient_ids:
        try:
            send_dm(request.user, rid, content, post_id=post_id_for_msg, quick_workout_id=qw_id_for_msg)
            sent_count += 1
        except (NotMutualFollowError, UserBlockedError) as e:
            errors.append(str(e))

    # Send to groups
    for gid in group_ids:
        try:
            send_group_message(request.user, gid, content, post_id=post_id_for_msg, quick_workout_id=qw_id_for_msg)
            sent_count += 1
        except (NotGroupMemberError, PostNotFoundError) as e:
            errors.append(str(e))

    return JsonResponse({
        'success': True,
        'sent_count': sent_count,
        'errors': errors,
    })
