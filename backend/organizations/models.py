import string
import secrets

from django.db import models
from django.db.models import Case, When, IntegerField, Q
from django.utils import timezone
from common.models import BaseModel


def generate_invite_code():
    """Generate a random 8-character alphanumeric invite code."""
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(8))


# ---------------------------------------------------------------------------
# Organization
# ---------------------------------------------------------------------------

class Organization(BaseModel):
    """
    A large community (up to 250 members). Admins/creator post announcements;
    members can only react to them.
    """

    class Privacy(models.TextChoices):
        PUBLIC = 'public', 'Public'
        PRIVATE = 'private', 'Private'

    created_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='created_organizations',
    )
    name = models.CharField(max_length=100)
    description = models.TextField(max_length=500, blank=True)
    avatar = models.ImageField(upload_to='org_avatars/', null=True, blank=True)
    privacy = models.CharField(
        max_length=10,
        choices=Privacy.choices,
        default=Privacy.PUBLIC,
    )

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def avatar_url(self):
        from media.utils import get_media_url, build_media_url
        url = get_media_url('organization', self.pk, 'avatar')
        if url:
            return url
        if self.avatar:
            return build_media_url(self.avatar.name)
        return None

    @property
    def member_count(self):
        return self.members.count()


# ---------------------------------------------------------------------------
# Membership
# ---------------------------------------------------------------------------

class OrgMemberManager(models.Manager):
    """Orders members by role: creator → admin → member, then most-recent first."""

    def get_queryset(self):
        return super().get_queryset().annotate(
            role_order=Case(
                When(role='creator', then=0),
                When(role='admin', then=1),
                When(role='member', then=2),
                output_field=IntegerField(),
            )
        ).order_by('role_order', '-joined_at')


class OrgMember(BaseModel):
    """A user's membership in an organization."""

    class Role(models.TextChoices):
        CREATOR = 'creator', 'Creator'
        ADMIN = 'admin', 'Admin'
        MEMBER = 'member', 'Member'

    org = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='members',
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='org_memberships',
    )
    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.MEMBER,
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    objects = OrgMemberManager()

    class Meta:
        ordering = []
        constraints = [
            models.UniqueConstraint(
                fields=['org', 'user'],
                name='unique_org_membership',
            )
        ]

    def __str__(self):
        return f"{self.user.username} in {self.org.name} ({self.role})"


# ---------------------------------------------------------------------------
# Invite Codes
# ---------------------------------------------------------------------------

class OrgInviteCode(BaseModel):
    """A shareable code that lets users join an organization."""
    org = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='invite_codes',
    )
    code = models.CharField(max_length=8, unique=True, default=generate_invite_code)
    created_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='created_org_invite_codes',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.org.name} - {self.code}"


# ---------------------------------------------------------------------------
# Join Requests
# ---------------------------------------------------------------------------

class OrgJoinRequest(BaseModel):
    """A request from a user to join a private organization."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        ACCEPTED = 'accepted', 'Accepted'
        DENIED = 'denied', 'Denied'

    org = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='join_requests',
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='org_join_requests',
    )
    message = models.TextField(max_length=500, blank=True)
    status = models.CharField(
        max_length=10,
        choices=Status.choices,
        default=Status.PENDING,
    )

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['org', 'user'],
                condition=Q(status='pending'),
                name='unique_pending_org_join_request',
            )
        ]

    def __str__(self):
        return f"{self.user.username} -> {self.org.name} ({self.status})"


# ---------------------------------------------------------------------------
# Announcements
# ---------------------------------------------------------------------------

class Announcement(BaseModel):
    """
    A post made by an admin or creator in an organization's announcement channel.
    Members can only react; only admins/creator can create.
    Media is attached via MediaLink(destination_type='announcement').
    """
    org = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='announcements',
    )
    author = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='org_announcements',
    )
    # Optional text caption — can be empty if the announcement is media/poll only
    content = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['org', '-created_at'], name='idx_announcement_org_time'),
        ]

    def __str__(self):
        return f"Announcement by {self.author.username} in {self.org.name}"


# ---------------------------------------------------------------------------
# Polls (attached to an Announcement)
# ---------------------------------------------------------------------------

class AnnouncementPoll(BaseModel):
    """
    An optional poll attached to an Announcement (one poll per announcement).
    Mirrors the social.Poll model but scoped to org announcements.
    """
    announcement = models.OneToOneField(
        Announcement,
        on_delete=models.CASCADE,
        related_name='poll',
    )
    question = models.CharField(max_length=280)
    duration_hours = models.PositiveIntegerField(default=24)
    ends_at = models.DateTimeField()

    def __str__(self):
        return f"Poll: {self.question[:50]}"

    @property
    def is_active(self):
        return timezone.now() < self.ends_at

    def get_total_votes(self):
        return sum(option.votes for option in self.options.all())


class AnnouncementPollOption(BaseModel):
    """A single option in an AnnouncementPoll."""
    poll = models.ForeignKey(
        AnnouncementPoll,
        on_delete=models.CASCADE,
        related_name='options',
    )
    text = models.CharField(max_length=100)
    votes = models.PositiveIntegerField(default=0)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.text} ({self.votes} votes)"


class AnnouncementPollVote(BaseModel):
    """
    Records which option a member voted for.
    Each member can only vote once per poll (unique_together on poll + user).
    """
    poll = models.ForeignKey(
        AnnouncementPoll,
        on_delete=models.CASCADE,
        related_name='user_votes',
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='org_poll_votes',
    )
    option = models.ForeignKey(
        AnnouncementPollOption,
        on_delete=models.CASCADE,
        related_name='user_votes',
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['poll', 'user'],
                name='unique_org_poll_vote',
            )
        ]

    def __str__(self):
        return f"{self.user.username} voted '{self.option.text}'"


# ---------------------------------------------------------------------------
# Announcement Reactions
# ---------------------------------------------------------------------------

class AnnouncementReaction(BaseModel):
    """
    An emoji reaction from a user on an announcement.
    Same multi-emoji-per-user design as MessageReaction:
    a user can react with 👍 AND ❤️ but not 👍 twice.
    """
    announcement = models.ForeignKey(
        Announcement,
        on_delete=models.CASCADE,
        related_name='reactions',
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='announcement_reactions',
    )
    emoji = models.CharField(max_length=16)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['announcement', 'user', 'emoji'],
                name='unique_announcement_reaction',
            )
        ]

    def __str__(self):
        return f"{self.user.username} reacted {self.emoji} to announcement {self.announcement_id}"
