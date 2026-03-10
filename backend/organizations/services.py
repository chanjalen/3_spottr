from django.db.models import F, Q, Count, Prefetch

from .models import (
    Organization, OrgMember, OrgInviteCode, OrgJoinRequest,
    Announcement, AnnouncementPoll, AnnouncementPollOption,
    AnnouncementPollVote, AnnouncementReaction,
)
from .exceptions import (
    OrgNotFoundError, NotOrgMemberError, NotOrgAdminError,
    AlreadyOrgMemberError, JoinRequestNotFoundError, DuplicateJoinRequestError,
    InvalidInviteCodeError, CannotRemoveCreatorError, InviteCodeNotFoundError,
    OrgFullError, AnnouncementNotFoundError, PollNotFoundError,
    PollOptionNotFoundError, AlreadyVotedError, PollExpiredError,
)

ORG_MEMBER_CAP = 250


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_org(org_id):
    try:
        return Organization.objects.get(id=org_id)
    except Organization.DoesNotExist:
        raise OrgNotFoundError("Organization not found.")


def _get_membership(org, user):
    try:
        return OrgMember.objects.get(org=org, user=user)
    except OrgMember.DoesNotExist:
        raise NotOrgMemberError("You are not a member of this organization.")


def _require_admin(org, user):
    membership = _get_membership(org, user)
    if membership.role not in (OrgMember.Role.ADMIN, OrgMember.Role.CREATOR):
        raise NotOrgAdminError("You do not have admin permissions for this organization.")
    return membership


def _check_capacity(org):
    if OrgMember.objects.filter(org=org).count() >= ORG_MEMBER_CAP:
        raise OrgFullError(f"This organization has reached the maximum of {ORG_MEMBER_CAP} members.")


def _attach_media(asset_ids, destination_type, destination_id, owner):
    """Create MediaLink rows for each valid asset owned by owner."""
    if not asset_ids:
        return
    from media.models import MediaAsset, MediaLink
    for position, asset_id in enumerate(asset_ids):
        try:
            asset = MediaAsset.objects.get(id=asset_id, user=owner)
        except MediaAsset.DoesNotExist:
            continue
        MediaLink.objects.get_or_create(
            asset=asset,
            destination_type=destination_type,
            destination_id=str(destination_id),
            type='inline',
            defaults={'position': position},
        )


# ---------------------------------------------------------------------------
# Organization CRUD
# ---------------------------------------------------------------------------

def create_org(user, name, description='', privacy=Organization.Privacy.PUBLIC, avatar=None):
    """Create an organization and add the creator as CREATOR. Auto-generates an invite code."""
    org = Organization.objects.create(
        created_by=user,
        name=name,
        description=description,
        privacy=privacy,
        avatar=avatar,
    )
    OrgMember.objects.create(org=org, user=user, role=OrgMember.Role.CREATOR)
    OrgInviteCode.objects.create(org=org, created_by=user)
    return org


def update_org(user, org_id, **fields):
    """Update org details. Admin/creator only."""
    org = _get_org(org_id)
    _require_admin(org, user)

    allowed = {'name', 'description', 'privacy'}
    update_fields = []
    for key, value in fields.items():
        if key in allowed:
            setattr(org, key, value)
            update_fields.append(key)

    if update_fields:
        update_fields.append('updated_at')
        org.save(update_fields=update_fields)

    return org


def update_org_avatar(user, org_id, avatar_file):
    """Replace the org avatar. Admin/creator only."""
    from media.utils import create_media_asset
    from media.models import MediaLink

    org = _get_org(org_id)
    _require_admin(org, user)

    old_links = MediaLink.objects.filter(
        destination_type='organization',
        destination_id=str(org.pk),
        type='avatar',
    ).select_related('asset')
    for ml in old_links:
        ml.asset.delete()

    org.avatar = avatar_file
    org.save(update_fields=['avatar', 'updated_at'])

    asset = create_media_asset(user, avatar_file, org.avatar.name, 'image', already_saved=True)
    MediaLink.objects.create(
        asset=asset,
        destination_type='organization',
        destination_id=str(org.pk),
        type='avatar',
    )
    return org


def delete_org(user, org_id):
    """Delete an org. Creator only."""
    org = _get_org(org_id)
    membership = _get_membership(org, user)
    if membership.role != OrgMember.Role.CREATOR:
        raise NotOrgAdminError("Only the organization creator can delete it.")
    org.delete()


def get_org(org_id):
    return _get_org(org_id)


def search_orgs(user=None, query=None, limit=50, offset=0):
    if query:
        # Search mode: all orgs (public + private)
        qs = Organization.objects.filter(name__icontains=query)
    else:
        # Browse mode: public orgs the user isn't already in
        qs = Organization.objects.filter(privacy=Organization.Privacy.PUBLIC)
        if user and user.is_authenticated:
            joined_ids = OrgMember.objects.filter(user=user).values_list('org_id', flat=True)
            qs = qs.exclude(id__in=joined_ids)
    return qs[offset:offset + limit]


def list_user_orgs(user):
    org_ids = OrgMember.objects.filter(user=user).values_list('org_id', flat=True)
    return Organization.objects.filter(id__in=org_ids)


# ---------------------------------------------------------------------------
# Membership
# ---------------------------------------------------------------------------

def join_public_org(user, org_id):
    org = _get_org(org_id)

    if org.privacy != Organization.Privacy.PUBLIC:
        raise NotOrgAdminError("This organization is private. Use an invite code or request to join.")

    if OrgMember.objects.filter(org=org, user=user).exists():
        raise AlreadyOrgMemberError("You are already a member of this organization.")

    _check_capacity(org)
    return OrgMember.objects.create(org=org, user=user, role=OrgMember.Role.MEMBER)


def leave_org(user, org_id):
    org = _get_org(org_id)
    membership = _get_membership(org, user)

    if membership.role == OrgMember.Role.CREATOR:
        raise CannotRemoveCreatorError(
            "The creator cannot leave. Delete the organization or transfer ownership first."
        )
    membership.delete()


def add_member(admin_user, org_id, user_id):
    from accounts.models import User

    org = _get_org(org_id)
    _require_admin(org, admin_user)

    try:
        target = User.objects.get(id=user_id)
    except User.DoesNotExist:
        raise OrgNotFoundError("User not found.")

    if OrgMember.objects.filter(org=org, user=target).exists():
        raise AlreadyOrgMemberError("User is already a member of this organization.")

    _check_capacity(org)
    return OrgMember.objects.create(org=org, user=target, role=OrgMember.Role.MEMBER)


def remove_member(admin_user, org_id, user_id):
    org = _get_org(org_id)
    _require_admin(org, admin_user)

    try:
        target = OrgMember.objects.get(org=org, user_id=user_id)
    except OrgMember.DoesNotExist:
        raise NotOrgMemberError("User is not a member of this organization.")

    if target.role == OrgMember.Role.CREATOR:
        raise CannotRemoveCreatorError("The organization creator cannot be removed.")

    target.delete()


def promote_member(admin_user, org_id, user_id):
    org = _get_org(org_id)
    _require_admin(org, admin_user)

    try:
        target = OrgMember.objects.get(org=org, user_id=user_id)
    except OrgMember.DoesNotExist:
        raise NotOrgMemberError("User is not a member of this organization.")

    if target.role == OrgMember.Role.CREATOR:
        raise CannotRemoveCreatorError("Cannot change the creator's role.")

    target.role = OrgMember.Role.ADMIN
    target.save(update_fields=['role', 'updated_at'])
    return target


def demote_member(admin_user, org_id, user_id):
    org = _get_org(org_id)
    _require_admin(org, admin_user)

    try:
        target = OrgMember.objects.get(org=org, user_id=user_id)
    except OrgMember.DoesNotExist:
        raise NotOrgMemberError("User is not a member of this organization.")

    if target.role == OrgMember.Role.CREATOR:
        raise CannotRemoveCreatorError("Cannot demote the creator.")

    target.role = OrgMember.Role.MEMBER
    target.save(update_fields=['role', 'updated_at'])
    return target


def list_members(org_id, requesting_user=None):
    org = _get_org(org_id)

    if org.privacy == Organization.Privacy.PRIVATE:
        if requesting_user is None or not OrgMember.objects.filter(org=org, user=requesting_user).exists():
            raise NotOrgMemberError("You must be a member to view this organization's members.")

    return OrgMember.objects.filter(org=org)


# ---------------------------------------------------------------------------
# Invite Codes
# ---------------------------------------------------------------------------

def generate_invite_code(user, org_id):
    org = _get_org(org_id)
    _require_admin(org, user)
    return OrgInviteCode.objects.create(org=org, created_by=user)


def list_invite_codes(user, org_id):
    org = _get_org(org_id)
    _require_admin(org, user)
    return OrgInviteCode.objects.filter(org=org)


def deactivate_invite_code(user, org_id, code_id):
    org = _get_org(org_id)
    _require_admin(org, user)

    try:
        invite_code = OrgInviteCode.objects.get(id=code_id, org=org)
    except OrgInviteCode.DoesNotExist:
        raise InviteCodeNotFoundError("Invite code not found.")

    invite_code.is_active = False
    invite_code.save(update_fields=['is_active', 'updated_at'])
    return invite_code


def join_via_code(user, code):
    try:
        invite_code = OrgInviteCode.objects.select_related('org').get(
            code=code, is_active=True
        )
    except OrgInviteCode.DoesNotExist:
        raise InvalidInviteCodeError("Invalid or inactive invite code.")

    org = invite_code.org

    if OrgMember.objects.filter(org=org, user=user).exists():
        raise AlreadyOrgMemberError("You are already a member of this organization.")

    _check_capacity(org)
    return OrgMember.objects.create(org=org, user=user, role=OrgMember.Role.MEMBER)


# ---------------------------------------------------------------------------
# Join Requests
# ---------------------------------------------------------------------------

def create_join_request(user, org_id, message=''):
    org = _get_org(org_id)

    if OrgMember.objects.filter(org=org, user=user).exists():
        raise AlreadyOrgMemberError("You are already a member of this organization.")

    if OrgJoinRequest.objects.filter(
        org=org, user=user, status=OrgJoinRequest.Status.PENDING
    ).exists():
        raise DuplicateJoinRequestError("You already have a pending join request for this organization.")

    join_request = OrgJoinRequest.objects.create(org=org, user=user, message=message)

    # WS push + cache bust for all admins/creators
    _push_pending_requests_update(org)

    # Push notification (fire-and-forget)
    try:
        from accounts.push import send_push_to_user
        admins = OrgMember.objects.filter(
            org=org,
            role__in=(OrgMember.Role.ADMIN, OrgMember.Role.CREATOR),
        ).select_related('user').exclude(user=user)
        for admin_membership in admins:
            send_push_to_user(
                admin_membership.user,
                title=org.name,
                body=f'@{user.username} wants to join',
                data={
                    'type': 'org_join_request',
                    'org_id': str(org.id),
                    'org_name': org.name,
                    'org_avatar': org.avatar_url or '',
                },
            )
    except Exception:
        pass

    return join_request


def _push_pending_requests_update(org):
    """After any join-request status change, WS-push the new count to all admins/creators and bust their caches."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        from django.core.cache import cache

        pending_count = OrgJoinRequest.objects.filter(
            org=org, status=OrgJoinRequest.Status.PENDING
        ).count()

        channel_layer = get_channel_layer()
        admins = OrgMember.objects.filter(
            org=org,
            role__in=(OrgMember.Role.ADMIN, OrgMember.Role.CREATOR),
        ).select_related('user')

        for admin_membership in admins:
            cache.delete(f'org:list:{admin_membership.user.id}')
            if channel_layer:
                dm_group = f"dm_{str(admin_membership.user.id).replace('-', '')}"
                async_to_sync(channel_layer.group_send)(dm_group, {
                    'type': 'org_join_request',
                    'org_id': str(org.id),
                    'org_name': org.name,
                    'pending_requests_count': pending_count,
                })
    except Exception:
        pass


def list_join_requests(admin_user, org_id):
    org = _get_org(org_id)
    _require_admin(org, admin_user)
    return OrgJoinRequest.objects.filter(org=org, status=OrgJoinRequest.Status.PENDING)


def accept_join_request(admin_user, request_id):
    try:
        join_request = OrgJoinRequest.objects.select_related('org').get(id=request_id)
    except OrgJoinRequest.DoesNotExist:
        raise JoinRequestNotFoundError("Join request not found.")

    _require_admin(join_request.org, admin_user)
    _check_capacity(join_request.org)

    join_request.status = OrgJoinRequest.Status.ACCEPTED
    join_request.save(update_fields=['status', 'updated_at'])

    OrgMember.objects.get_or_create(
        org=join_request.org,
        user=join_request.user,
        defaults={'role': OrgMember.Role.MEMBER},
    )
    _push_pending_requests_update(join_request.org)
    return join_request


def deny_join_request(admin_user, request_id):
    try:
        join_request = OrgJoinRequest.objects.select_related('org').get(id=request_id)
    except OrgJoinRequest.DoesNotExist:
        raise JoinRequestNotFoundError("Join request not found.")

    _require_admin(join_request.org, admin_user)
    join_request.status = OrgJoinRequest.Status.DENIED
    join_request.save(update_fields=['status', 'updated_at'])
    _push_pending_requests_update(join_request.org)
    return join_request


# ---------------------------------------------------------------------------
# Announcements
# ---------------------------------------------------------------------------

def _ws_serialize_announcement(announcement):
    """Build a JSON-safe dict matching AnnouncementSerializer output for WS push."""
    from media.models import MediaLink
    from django.conf import settings

    links = (
        MediaLink.objects
        .filter(destination_type='announcement', destination_id=str(announcement.id), type='inline')
        .select_related('asset')
        .order_by('position')
    )
    media = []
    for link in links:
        asset = link.asset
        thumbnail_url = (
            f"{settings.MEDIA_URL}{asset.thumbnail_key}" if asset.thumbnail_key else None
        )
        media.append({
            'url': asset.url,
            'kind': asset.kind,
            'thumbnail_url': thumbnail_url,
            'width': asset.width,
            'height': asset.height,
        })

    poll = None
    try:
        p = announcement.poll
        if p:
            options = [
                {
                    'id': str(o.id),
                    'text': o.text,
                    'votes': o.votes,
                    'order': o.order,
                    'user_voted': False,
                }
                for o in p.options.all()
            ]
            poll = {
                'id': str(p.id),
                'question': p.question,
                'is_active': p.is_active,
                'ends_at': p.ends_at.isoformat() if p.ends_at else None,
                'total_votes': 0,
                'user_voted_option_id': None,
                'options': options,
            }
    except Exception:
        pass

    return {
        'id': str(announcement.id),
        'org': str(announcement.org_id),
        'author_id': str(announcement.author_id),
        'author_username': announcement.author.username,
        'author_display_name': announcement.author.display_name or announcement.author.username,
        'author_avatar_url': announcement.author.avatar_url or None,
        'content': announcement.content,
        'media': media,
        'poll': poll,
        'reactions': [],
        'created_at': announcement.created_at.isoformat(),
    }


def _push_new_announcement(org_id, announcement):
    """Push a new_announcement event to all connected org members via the channel layer."""
    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer:
            payload = _ws_serialize_announcement(announcement)
            async_to_sync(channel_layer.group_send)(
                f"org_{str(org_id).replace('-', '')}",
                {'type': 'new_announcement', 'announcement': payload},
            )
    except Exception:
        pass  # WS push is best-effort; never fail the API response


def create_announcement(user, org_id, content='', media_ids=None, poll_data=None):
    """
    Create an announcement. Admin/creator only.
    - media_ids: list of MediaAsset IDs (user must own each asset)
    - poll_data: {'question': str, 'duration_hours': int, 'options': [str, ...]}
    """
    org = _get_org(org_id)
    _require_admin(org, user)

    announcement = Announcement.objects.create(org=org, author=user, content=content)

    _attach_media(media_ids, 'announcement', announcement.id, owner=user)

    if poll_data:
        from django.utils import timezone
        from datetime import timedelta
        duration_hours = poll_data.get('duration_hours', 24)
        poll = AnnouncementPoll.objects.create(
            announcement=announcement,
            question=poll_data['question'],
            duration_hours=duration_hours,
            ends_at=timezone.now() + timedelta(hours=duration_hours),
        )
        for i, option_text in enumerate(poll_data.get('options', [])):
            AnnouncementPollOption.objects.create(poll=poll, text=option_text, order=i)

    # Refresh to pick up poll/media for WS serialization
    announcement.refresh_from_db()
    _push_new_announcement(org.id, announcement)

    # Push notification to all org members except the author
    try:
        from accounts.push import send_push_to_user
        preview = (content or '')[:80] or '📎 Attachment'
        members = OrgMember.objects.filter(org=org).exclude(user=user).select_related('user')
        for membership in members:
            send_push_to_user(
                membership.user,
                title=f'{org.name} (Announcement): @{user.username}',
                body=preview,
                data={
                    'type': 'org_announcement',
                    'org_id': str(org.id),
                    'org_name': org.name,
                    'org_avatar': org.avatar_url or '',
                },
            )
    except Exception:
        pass

    return announcement


def list_announcements(org_id, requesting_user, limit=20, before_id=None):
    """
    Cursor-paged announcements for an org, newest-first.
    Members (and anyone for public orgs) can read.
    Returns: (announcements list, has_more bool)
    """
    org = _get_org(org_id)

    if org.privacy == Organization.Privacy.PRIVATE:
        if not OrgMember.objects.filter(org=org, user=requesting_user).exists():
            raise NotOrgMemberError("You must be a member to view announcements.")

    qs = (
        Announcement.objects
        .filter(org=org)
        .select_related('author', 'poll')
        .prefetch_related(
            'poll__options',
            Prefetch(
                'poll__user_votes',
                queryset=AnnouncementPollVote.objects.filter(user=requesting_user),
                to_attr='requesting_user_votes',
            ),
            Prefetch(
                'reactions',
                queryset=AnnouncementReaction.objects.select_related('user'),
                to_attr='prefetched_reactions',
            ),
        )
    )

    if before_id:
        try:
            cursor = Announcement.objects.values('created_at', 'id').get(id=before_id)
        except Announcement.DoesNotExist:
            raise AnnouncementNotFoundError("Cursor announcement not found.")
        qs = qs.filter(
            Q(created_at__lt=cursor['created_at'])
            | Q(created_at=cursor['created_at'], id__lt=cursor['id'])
        )

    chunk = list(qs.order_by('-created_at', '-id')[:limit + 1])
    has_more = len(chunk) > limit
    return chunk[:limit], has_more


def delete_announcement(user, org_id, announcement_id):
    """Delete an announcement. Admin/creator only."""
    org = _get_org(org_id)
    _require_admin(org, user)

    try:
        announcement = Announcement.objects.get(id=announcement_id, org=org)
    except Announcement.DoesNotExist:
        raise AnnouncementNotFoundError("Announcement not found.")

    announcement.delete()


# ---------------------------------------------------------------------------
# Reactions
# ---------------------------------------------------------------------------

def toggle_announcement_reaction(user, org_id, announcement_id, emoji):
    """
    Toggle an emoji reaction on an announcement.
    Returns (reaction_or_None, created: bool).
    Any org member can react.
    """
    org = _get_org(org_id)

    if not OrgMember.objects.filter(org=org, user=user).exists():
        raise NotOrgMemberError("You must be a member to react to announcements.")

    try:
        announcement = Announcement.objects.get(id=announcement_id, org=org)
    except Announcement.DoesNotExist:
        raise AnnouncementNotFoundError("Announcement not found.")

    reaction, created = AnnouncementReaction.objects.get_or_create(
        announcement=announcement, user=user, emoji=emoji,
    )
    if not created:
        reaction.delete()
        return None, False

    return reaction, True


def get_announcement_reactions(announcement, user):
    """Return grouped reaction summary for an announcement."""
    rows = (
        AnnouncementReaction.objects
        .filter(announcement=announcement)
        .values('emoji')
        .annotate(count=Count('id'))
        .order_by('-count', 'emoji')
    )
    user_emojis = set(
        AnnouncementReaction.objects
        .filter(announcement=announcement, user=user)
        .values_list('emoji', flat=True)
    )
    return [
        {'emoji': r['emoji'], 'count': r['count'], 'user_reacted': r['emoji'] in user_emojis}
        for r in rows
    ]


def broadcast_announcement_reaction_update(announcement):
    """
    Broadcast updated reaction state for an announcement to all org members.
    Payload includes reactor_ids so each client computes its own user_reacted flag.
    Sent to the org channel (org_{org_id_no_hyphens}).
    """
    import logging
    from collections import defaultdict

    logger = logging.getLogger(__name__)

    reactor_map = defaultdict(list)
    for r in AnnouncementReaction.objects.filter(announcement=announcement).values('emoji', 'user_id'):
        reactor_map[r['emoji']].append(str(r['user_id']))

    rows = (
        AnnouncementReaction.objects
        .filter(announcement=announcement)
        .values('emoji')
        .annotate(count=Count('id'))
        .order_by('-count', 'emoji')
    )
    reactions = [
        {'emoji': r['emoji'], 'count': r['count'], 'reactor_ids': reactor_map[r['emoji']]}
        for r in rows
    ]

    payload = {
        'type': 'announcement_reaction_update',
        'announcement_id': str(announcement.id),
        'org_id': str(announcement.org_id),
        'reactions': reactions,
    }

    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        channel_layer = get_channel_layer()
        if channel_layer:
            org_id_clean = str(announcement.org_id).replace('-', '')
            async_to_sync(channel_layer.group_send)(f"org_{org_id_clean}", payload)
    except Exception as exc:
        logger.warning("WS announcement reaction broadcast for %s failed: %s", announcement.id, exc)


# ---------------------------------------------------------------------------
# Poll Voting
# ---------------------------------------------------------------------------

def vote_on_poll(user, org_id, announcement_id, option_id):
    """
    Cast or change a vote on a poll. One vote per user per poll; users may
    change their vote to a different option. Returns the selected option.
    """
    org = _get_org(org_id)

    if not OrgMember.objects.filter(org=org, user=user).exists():
        raise NotOrgMemberError("You must be a member to vote.")

    try:
        announcement = Announcement.objects.select_related('poll').get(id=announcement_id, org=org)
    except Announcement.DoesNotExist:
        raise AnnouncementNotFoundError("Announcement not found.")

    if not hasattr(announcement, 'poll') or announcement.poll is None:
        raise PollNotFoundError("This announcement has no poll.")

    poll = announcement.poll

    if not poll.is_active:
        raise PollExpiredError("This poll has ended.")

    try:
        option = AnnouncementPollOption.objects.get(id=option_id, poll=poll)
    except AnnouncementPollOption.DoesNotExist:
        raise PollOptionNotFoundError("Poll option not found.")

    existing_vote = AnnouncementPollVote.objects.filter(poll=poll, user=user).select_related('option').first()

    if existing_vote:
        if str(existing_vote.option_id) == str(option.id):
            # Same option — nothing to do
            option.refresh_from_db()
            return option
        # Changing vote: decrement old option, update the vote record
        AnnouncementPollOption.objects.filter(id=existing_vote.option_id).update(votes=F('votes') - 1)
        existing_vote.option = option
        existing_vote.save(update_fields=['option'])
    else:
        AnnouncementPollVote.objects.create(poll=poll, user=user, option=option)

    AnnouncementPollOption.objects.filter(id=option.id).update(votes=F('votes') + 1)
    option.refresh_from_db()
    return option
