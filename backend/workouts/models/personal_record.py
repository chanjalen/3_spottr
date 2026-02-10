from django.db import models
from common.models import BaseModel


class PersonalRecord(BaseModel):
    """
    Represents a user's personal record for an exercise.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='personal_records',
    )
    post = models.ForeignKey(
        'social.Post',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='personal_records',
    )
    exercise = models.ForeignKey(
        'workouts.Exercise',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='personal_records',
    )

    exercise_name = models.CharField(max_length=100)
    value = models.CharField(max_length=50)
    unit = models.CharField(max_length=20)
    achieved_date = models.DateField()
    video = models.FileField(upload_to='pr_videos/', blank=True, null=True)

    class Meta:
        ordering = ['-achieved_date']
        indexes = [
            models.Index(fields=['user', '-achieved_date'], name='idx_pr_user'),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.exercise_name}: {self.value}{self.unit}"
