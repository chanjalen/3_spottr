from django.db import models
from common.models import BaseModel


class PersonalRecord(BaseModel):
    """
    Represents a user's personal record.
    """
    user = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='personal_records'
    )

    exercise_name = models.CharField(max_length=100)
    value = models.CharField(max_length=50)
    unit = models.CharField(max_length=20)
    achieved_date = models.DateField()

    class Meta:
        ordering = ['-achieved_date']

    def __str__(self):
        return f"{self.user.username} - {self.exercise_name}: {self.value}{self.unit}"
