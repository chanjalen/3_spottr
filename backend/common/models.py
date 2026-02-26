from django.db import models
import uuid


def generate_uuid():
    """Generate a UUID string for use as primary key."""
    return str(uuid.uuid4())


class BaseModel(models.Model):
    """
    Abstract base model with UUID primary key and timestamps.
    All models should inherit from this.
    """
    id = models.CharField(primary_key=True, max_length=36, default=generate_uuid)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class UUIDBaseModel(models.Model):
    """
    Abstract base model with native UUID primary key and timestamps.
    Use this for models that need native UUID field.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
