from django.db import models
from common.models import BaseModel


class WorkoutTemplate(BaseModel):
    """
    A reusable workout blueprint that users can create and share.
    """

    class Visibility(models.TextChoices):
        PRIVATE = 'private', 'Private'
        FRIENDS = 'friends', 'Friends'
        PUBLIC = 'public', 'Public'

    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='workout_templates',
    )

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    visibility = models.CharField(
        max_length=10,
        choices=Visibility.choices,
        default=Visibility.PRIVATE,
    )

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} by {self.user.username}"


class TemplateExercise(BaseModel):
    """
    An exercise slot within a workout template.
    Defines the blueprint; actual values are logged in Exercise.
    """
    template = models.ForeignKey(
        WorkoutTemplate,
        on_delete=models.CASCADE,
        related_name='exercises',
    )

    name = models.CharField(max_length=100)
    category = models.CharField(max_length=50)
    sets = models.PositiveIntegerField()
    reps = models.PositiveIntegerField()
    weight = models.DecimalField(max_digits=6, decimal_places=2)
    unit = models.CharField(max_length=10)
    order_index = models.PositiveIntegerField()

    class Meta:
        ordering = ['order_index']

    def __str__(self):
        return f"{self.name} (template: {self.template.name})"
