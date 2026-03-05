from django.db import models
from common.models import BaseModel


class Post(BaseModel):
    """
    Represents a feed post (workout share, check-in, etc.).
    """

    class Visibility(models.TextChoices):
        MAIN = 'main', 'Main'
        FRIENDS = 'friends', 'Friends'

    class ReplyRestriction(models.TextChoices):
        EVERYONE = 'everyone', 'Everyone can reply'
        FRIENDS = 'friends', 'Only friends can reply'
        MENTIONS = 'mentions', 'Only people you mention can reply'

    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='posts',
    )
    workout = models.ForeignKey(
        'workouts.Workout',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='posts',
    )
    location = models.ForeignKey(
        'gyms.Gym',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='posts',
    )

    description = models.TextField(blank=True)
    photo = models.ImageField(
        upload_to='posts/',
        null=True,
        blank=True,
    )
    video = models.FileField(
        upload_to='posts/videos/',
        null=True,
        blank=True,
    )
    link_url = models.URLField(
        max_length=500,
        blank=True,
        null=True,
    )
    visibility = models.CharField(
        max_length=10,
        choices=Visibility.choices,
        default=Visibility.MAIN,
    )
    reply_restriction = models.CharField(
        max_length=10,
        choices=ReplyRestriction.choices,
        default=ReplyRestriction.EVERYONE,
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at'], name='idx_post_user'),
            models.Index(fields=['visibility', '-created_at'], name='idx_post_visibility'),
        ]

    def __str__(self):
        return f"Post by {self.user.username}"

    def get_hashtags(self):
        """Extract hashtags from the description."""
        import re
        if not self.description:
            return []
        return re.findall(r'#(\w+)', self.description)


class PostPhoto(BaseModel):
    """
    Additional photos attached to a post (index 1+).
    The primary photo lives on Post.photo; extras go here ordered by `order`.
    """
    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name='extra_photos',
    )
    photo = models.ImageField(upload_to='posts/photos/')
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"Photo {self.order} for post {self.post_id}"


class Poll(BaseModel):
    """
    A poll attached to a post.
    """
    post = models.OneToOneField(
        Post,
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
        from django.utils import timezone
        return timezone.now() < self.ends_at

    def get_total_votes(self):
        return sum(option.votes for option in self.options.all())


class PollOption(BaseModel):
    """
    An option in a poll.
    """
    poll = models.ForeignKey(
        Poll,
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


class PollVote(BaseModel):
    """
    Tracks which users voted for which options.
    """
    poll = models.ForeignKey(
        Poll,
        on_delete=models.CASCADE,
        related_name='user_votes',
    )
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='poll_votes',
    )
    option = models.ForeignKey(
        PollOption,
        on_delete=models.CASCADE,
        related_name='user_votes',
    )

    class Meta:
        unique_together = ['poll', 'user']

    def __str__(self):
        return f"{self.user.username} voted for {self.option.text}"
