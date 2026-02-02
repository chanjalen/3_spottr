from django.db import models
from django.utils import timezone
import uuid

# MODEL 1 USER.
class User(models.Model):
    """
    Represents an extended user profile for Spottr users.
    Stores fitness-related metadata beyond authentication.
    """

    id = models.CharField(primary_key=True, max_length=36)
    email = models.EmailField(unique=True)
    phone_number = models.CharField(max_length=20, unique=True)
    password = models.CharField(max_length=128)

    username = models.CharField(max_length=30, unique=True)
    display_name = models.CharField(max_length=50)
    birthday = models.DateField(null=True, blank=True)

    avatar = models.CharField(max_length=255, null=True, blank=True)
    bio = models.TextField(blank=True)

    workout_frequency = models.IntegerField(default=0)

    member_since = models.DateTimeField(default=timezone.now)

    current_streak = models.IntegerField(default=0)
    longest_streak = models.IntegerField(default=0)
    total_workouts = models.IntegerField(default=0)

    status = models.CharField(max_length=50, blank=True)
    current_activity = models.CharField(max_length=100, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["username"]

    def __str__(self):
        return self.username

########################################################################

# Model 2: Gym
class Gym(models.Model):
    """
    Represents a physical gym location where users can work out.
    Gyms are used to associate workouts and track activity by location.

    """
    id = models.CharField(primary_key=True, max_length=36)
    name = models.CharField(max_length=100)
    address = models.CharField(max_length=255)

    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)

    max_capacity = models.IntegerField()
    current_activity = models.IntegerField(default=0)

    phone_number = models.CharField(max_length=20, blank=True)
    hours = models.JSONField(default=dict)
    amenities = models.JSONField(default=dict)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

########################################################################
#Model 3: Workout
class Workout(models.Model):
    """
    Represents a logged workout session completed by a user.
    Each workout belongs to one user and may optionally occur at a gym.
    """

    id = models.CharField(primary_key=True, max_length=36)

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="workouts"
    )

    gym = models.ForeignKey(
        Gym,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    name = models.CharField(max_length=100)
    type = models.CharField(max_length=50)

    duration = models.IntegerField()
    total_exercises = models.IntegerField()
    total_sets = models.IntegerField()

    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    date = models.DateField()

    is_template = models.BooleanField(default=False)
    template_name = models.CharField(max_length=100, blank=True)

    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "date"],
                name="unique_workout_per_user_per_day"
            )
        ]

    def __str__(self):
        return f"{self.user.username} - {self.date}"

########################################################################
# Model 4: Exercise
class Exercise(models.Model):
    """
    Represents an exercise performed as part of a workout.
    Multiple exercises can belong to a single workout.
    """

    id = models.CharField(primary_key=True, max_length=36)

    workout = models.ForeignKey(
        Workout,
        on_delete=models.CASCADE,
        related_name="exercises"
    )

    name = models.CharField(max_length=100)
    category = models.CharField(max_length=50)

    sets = models.IntegerField()
    reps = models.IntegerField()
    weight = models.DecimalField(max_digits=6, decimal_places=2)

    unit = models.CharField(max_length=10)

    duration = models.IntegerField(null=True, blank=True)
    distance = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)

    order = models.IntegerField()
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.name} ({self.workout.id})"

########################################################################
#Model 5: Post
class Post(models.Model):
    """
    Represents a feed post (workout, check-in, PR, streak).
    Is the tracking feature/social aspect of the app.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    workout = models.ForeignKey(Workout, on_delete=models.SET_NULL, null=True, blank=True)
    location = models.ForeignKey(Gym, on_delete=models.SET_NULL, null=True, blank=True)

    type = models.CharField(max_length=50)
    content = models.TextField()

    pr_exercise = models.CharField(max_length=100, blank=True)
    pr_weight = models.CharField(max_length=20, blank=True)
    streak_days = models.IntegerField(null=True, blank=True)

    visibility = models.CharField(max_length=20)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Post by {self.user.username}"
