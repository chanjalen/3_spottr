from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from social.models import Follow


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
