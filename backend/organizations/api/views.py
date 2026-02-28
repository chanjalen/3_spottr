from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from django.utils import timezone
from django.core.cache import cache

from organizations import services
from organizations.models import OrgMember
from organizations.exceptions import (
    OrgNotFoundError, NotOrgMemberError, NotOrgAdminError,
    AlreadyOrgMemberError, JoinRequestNotFoundError, DuplicateJoinRequestError,
    InvalidInviteCodeError, CannotRemoveCreatorError, InviteCodeNotFoundError,
    OrgFullError, AnnouncementNotFoundError, PollNotFoundError,
    PollOptionNotFoundError, AlreadyVotedError, PollExpiredError,
)
from organizations.api.serializers import (
    OrgListSerializer, OrgDetailSerializer, OrgMemberSerializer,
    OrgInviteCodeSerializer, OrgJoinRequestSerializer,
    AnnouncementSerializer, CreateOrgSerializer, UpdateOrgSerializer,
    CreateAnnouncementSerializer, JoinViaCodeSerializer, JoinRequestSerializer,
    ReactSerializer, VoteSerializer,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_avatar_map(user_ids):
    """
    Bulk-fetch user avatar URLs for all user_ids in one query.
    Returns a dict mapping str(user_id) → url string.
    """
    from media.models import MediaLink
    ids = [str(uid) for uid in user_ids if uid is not None]
    if not ids:
        return {}
    links = (
        MediaLink.objects
        .filter(destination_type='user', destination_id__in=ids, type='avatar')
        .select_related('asset')
    )
    return {link.destination_id: link.asset.url for link in links}


def _build_media_map(destination_type, items):
    """
    Bulk-fetch MediaLink rows for all items in one query.
    Returns a dict mapping str(item.id) → list of media dicts.
    """
    from media.models import MediaLink
    from django.conf import settings
    ids = [str(m.id) for m in items]
    if not ids:
        return {}
    links = (
        MediaLink.objects
        .filter(destination_type=destination_type, destination_id__in=ids, type='inline')
        .select_related('asset')
        .order_by('destination_id', 'position')
    )
    media_map = {}
    for link in links:
        asset = link.asset
        thumbnail_url = (
            f"{settings.MEDIA_URL}{asset.thumbnail_key}" if asset.thumbnail_key else None
        )
        media_map.setdefault(link.destination_id, []).append({
            'url': asset.url, 'kind': asset.kind,
            'thumbnail_url': thumbnail_url,
            'width': asset.width, 'height': asset.height,
        })
    return media_map


# ---------------------------------------------------------------------------
# Organization CRUD
# ---------------------------------------------------------------------------

ORG_LIST_TTL = 2 * 60  # 2 minutes


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def org_list_create(request):
    """GET: list the user's orgs. POST: create a new org."""
    if request.method == 'GET':
        cache_key = f'org:list:{request.user.id}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)

        from django.db.models import Q, Count
        from organizations.models import Announcement
        orgs = services.list_user_orgs(request.user)
        # Build per-org unread announcement counts in 2 queries.
        memberships = {
            str(m['org_id']): m['last_announcements_read_at']
            for m in OrgMember.objects.filter(
                user=request.user,
                org__in=orgs,
                last_announcements_read_at__isnull=False,
            ).values('org_id', 'last_announcements_read_at')
        }
        unread_map = {}
        if memberships:
            unread_q = Q()
            for org_id_str, last_read_at in memberships.items():
                unread_q |= Q(org_id=org_id_str, created_at__gt=last_read_at)
            for row in (
                Announcement.objects
                .filter(unread_q)
                .exclude(author=request.user)
                .values('org_id')
                .annotate(count=Count('id'))
            ):
                unread_map[str(row['org_id'])] = row['count']
        # Latest announcement preview per org (single DISTINCT ON query + 2 batch lookups).
        from organizations.models import AnnouncementPoll
        from media.models import MediaLink
        org_ids = [o.pk for o in orgs]
        latest_ann_map = {}
        if org_ids:
            latest_anns = (
                Announcement.objects
                .filter(org_id__in=org_ids)
                .order_by('org_id', '-created_at')
                .distinct('org_id')
                .select_related('author')
            )
            ann_ids = [a.id for a in latest_anns]
            ann_with_media = set(
                MediaLink.objects
                .filter(destination_type='announcement', destination_id__in=[str(i) for i in ann_ids], type='inline')
                .values_list('destination_id', flat=True)
            )
            ann_with_poll = set(
                AnnouncementPoll.objects
                .filter(announcement_id__in=ann_ids)
                .values_list('announcement_id', flat=True)
            )
            for ann in latest_anns:
                latest_ann_map[str(ann.org_id)] = {
                    'author_display_name': ann.author.display_name or ann.author.username,
                    'content': ann.content,
                    'has_media': str(ann.id) in ann_with_media,
                    'has_poll': ann.id in ann_with_poll,
                    'created_at': ann.created_at.isoformat(),
                }
        serializer = OrgListSerializer(
            orgs, many=True,
            context={'request': request, 'unread_map': unread_map, 'latest_ann_map': latest_ann_map},
        )
        data = serializer.data
        cache.set(cache_key, data, ORG_LIST_TTL)
        return Response(data)

    # POST — create
    serializer = CreateOrgSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    d = serializer.validated_data
    org = services.create_org(
        user=request.user,
        name=d['name'],
        description=d['description'],
        privacy=d['privacy'],
    )
    cache.delete(f'org:list:{request.user.id}')
    return Response(OrgDetailSerializer(org, context={'request': request}).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def org_discover(request):
    """Search/browse public organizations."""
    query = request.query_params.get('q', '').strip()
    limit = min(int(request.query_params.get('limit', 50)), 100)
    offset = int(request.query_params.get('offset', 0))
    orgs = services.search_orgs(user=request.user, query=query or None, limit=limit, offset=offset)
    serializer = OrgListSerializer(orgs, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def org_detail(request, org_id):
    """GET: org detail. PATCH: update (admin). DELETE: delete (creator)."""
    try:
        org = services.get_org(org_id)
    except OrgNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        return Response(OrgDetailSerializer(org, context={'request': request}).data)

    if request.method == 'PATCH':
        serializer = UpdateOrgSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            org = services.update_org(request.user, org_id, **serializer.validated_data)
        except (NotOrgAdminError, NotOrgMemberError) as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
        return Response(OrgDetailSerializer(org, context={'request': request}).data)

    # DELETE
    try:
        services.delete_org(request.user, org_id)
    except NotOrgAdminError as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    except NotOrgMemberError as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def org_avatar(request, org_id):
    """Update org avatar. Admin/creator only."""
    file = request.FILES.get('avatar')
    if not file:
        return Response({'error': 'No avatar file provided.'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        org = services.update_org_avatar(request.user, org_id, file)
    except OrgNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotOrgAdminError, NotOrgMemberError) as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    return Response(OrgDetailSerializer(org, context={'request': request}).data)


# ---------------------------------------------------------------------------
# Membership
# ---------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def org_members(request, org_id):
    """List org members."""
    try:
        members = services.list_members(org_id, requesting_user=request.user)
    except OrgNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotOrgMemberError as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    serializer = OrgMemberSerializer(members, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def org_join(request, org_id):
    """Join a public org directly."""
    try:
        services.join_public_org(request.user, org_id)
    except OrgNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except AlreadyOrgMemberError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except OrgFullError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except NotOrgAdminError as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    cache.delete(f'org:list:{request.user.id}')
    return Response({'joined': True})


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def org_leave(request, org_id):
    """Leave an org."""
    try:
        services.leave_org(request.user, org_id)
    except OrgNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotOrgMemberError as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    except CannotRemoveCreatorError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    cache.delete(f'org:list:{request.user.id}')
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def member_promote(request, org_id, user_id):
    try:
        services.promote_member(request.user, org_id, user_id)
    except OrgNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotOrgAdminError, NotOrgMemberError) as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    except CannotRemoveCreatorError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'promoted': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def member_demote(request, org_id, user_id):
    try:
        services.demote_member(request.user, org_id, user_id)
    except OrgNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotOrgAdminError, NotOrgMemberError) as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    except CannotRemoveCreatorError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'demoted': True})


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def member_kick(request, org_id, user_id):
    try:
        services.remove_member(request.user, org_id, user_id)
    except OrgNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotOrgAdminError, NotOrgMemberError) as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    except CannotRemoveCreatorError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Invite Codes
# ---------------------------------------------------------------------------

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def invite_codes(request, org_id):
    """GET: list codes (admin). POST: generate new code (admin)."""
    try:
        if request.method == 'GET':
            codes = services.list_invite_codes(request.user, org_id)
            return Response(OrgInviteCodeSerializer(codes, many=True).data)
        code = services.generate_invite_code(request.user, org_id)
        return Response(OrgInviteCodeSerializer(code).data, status=status.HTTP_201_CREATED)
    except OrgNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotOrgAdminError, NotOrgMemberError) as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def deactivate_invite_code(request, org_id, code_id):
    try:
        services.deactivate_invite_code(request.user, org_id, code_id)
    except OrgNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotOrgAdminError, NotOrgMemberError) as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    except InviteCodeNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    return Response({'deactivated': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def join_via_code(request):
    """Join an org via invite code."""
    serializer = JoinViaCodeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        services.join_via_code(request.user, serializer.validated_data['code'])
    except InvalidInviteCodeError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except AlreadyOrgMemberError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except OrgFullError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'joined': True})


# ---------------------------------------------------------------------------
# Join Requests
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_join_request(request, org_id):
    serializer = JoinRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        services.create_join_request(request.user, org_id, serializer.validated_data['message'])
    except OrgNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except AlreadyOrgMemberError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except DuplicateJoinRequestError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'requested': True}, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_join_requests(request, org_id):
    try:
        requests_qs = services.list_join_requests(request.user, org_id)
    except OrgNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotOrgAdminError, NotOrgMemberError) as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    return Response(OrgJoinRequestSerializer(requests_qs, many=True).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def accept_join_request(request, request_id):
    try:
        services.accept_join_request(request.user, request_id)
    except JoinRequestNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotOrgAdminError, NotOrgMemberError) as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    except OrgFullError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'accepted': True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def deny_join_request(request, request_id):
    try:
        services.deny_join_request(request.user, request_id)
    except JoinRequestNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotOrgAdminError, NotOrgMemberError) as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    return Response({'denied': True})


# ---------------------------------------------------------------------------
# Announcements
# ---------------------------------------------------------------------------

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def announcements(request, org_id):
    """GET: list announcements (members + public). POST: create (admin/creator)."""
    if request.method == 'GET':
        limit = min(int(request.query_params.get('limit', 20)), 100)
        before_id = request.query_params.get('before_id')
        try:
            anns, has_more = services.list_announcements(
                org_id, request.user, limit=limit, before_id=before_id
            )
        except OrgNotFoundError as e:
            return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
        except NotOrgMemberError as e:
            return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
        except AnnouncementNotFoundError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        member = OrgMember.objects.filter(org_id=org_id, user=request.user).first()
        last_read_at = member.last_announcements_read_at if member else None
        media_map = _build_media_map('announcement', anns)
        author_avatar_map = _build_avatar_map({a.author_id for a in anns})
        serializer = AnnouncementSerializer(
            anns, many=True, context={
                'request': request, 'last_read_at': last_read_at,
                'media_map': media_map, 'author_avatar_map': author_avatar_map,
            }
        )
        oldest_id = str(anns[-1].id) if anns else None
        return Response({'results': serializer.data, 'has_more': has_more, 'oldest_id': oldest_id})

    # POST — create
    serializer = CreateAnnouncementSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    d = serializer.validated_data
    try:
        ann = services.create_announcement(
            user=request.user,
            org_id=org_id,
            content=d['content'],
            media_ids=d['media_ids'],
            poll_data=d.get('poll'),
        )
    except OrgNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotOrgAdminError, NotOrgMemberError) as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    return Response(AnnouncementSerializer(ann, context={'request': request}).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_announcements_read(request, org_id):
    """Mark all announcements as read for the requesting user."""
    member = OrgMember.objects.filter(org_id=org_id, user=request.user).first()
    if not member:
        return Response({'error': 'Not a member.'}, status=status.HTTP_403_FORBIDDEN)
    member.last_announcements_read_at = timezone.now()
    member.save(update_fields=['last_announcements_read_at'])
    return Response({'ok': True})


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def announcement_delete(request, org_id, announcement_id):
    try:
        services.delete_announcement(request.user, org_id, announcement_id)
    except OrgNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except (NotOrgAdminError, NotOrgMemberError) as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    except AnnouncementNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def announcement_react(request, org_id, announcement_id):
    """Toggle an emoji reaction on an announcement."""
    serializer = ReactSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        services.toggle_announcement_reaction(
            request.user, org_id, announcement_id, serializer.validated_data['emoji']
        )
        # Return updated reaction state for the announcement
        ann = services.get_org(org_id)  # lightweight re-fetch for context
        from organizations.models import Announcement
        announcement = Announcement.objects.get(id=announcement_id)
        reactions = services.get_announcement_reactions(announcement, request.user)
    except OrgNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotOrgMemberError as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    except AnnouncementNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    return Response({'reactions': reactions})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def announcement_vote(request, org_id, announcement_id):
    """Vote on a poll attached to an announcement."""
    serializer = VoteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        services.vote_on_poll(
            request.user, org_id, announcement_id, serializer.validated_data['option_id']
        )
        from organizations.models import Announcement
        from organizations.api.serializers import AnnouncementPollSerializer
        ann = Announcement.objects.select_related('poll').prefetch_related('poll__options', 'poll__user_votes').get(id=announcement_id)
        poll_data = AnnouncementPollSerializer(ann.poll, context={'request': request}).data
    except OrgNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except NotOrgMemberError as e:
        return Response({'error': str(e)}, status=status.HTTP_403_FORBIDDEN)
    except AnnouncementNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    except PollNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except PollExpiredError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except AlreadyVotedError as e:
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except PollOptionNotFoundError as e:
        return Response({'error': str(e)}, status=status.HTTP_404_NOT_FOUND)
    return Response({'poll': poll_data})
