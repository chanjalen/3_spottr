from django.db import models
import uuid


class BaseModel(models.Model):
    """
    Abstract base model with UUID primary key and timestamps.
    All models should inherit from this.
    """
    id = models.CharField(primary_key=True, max_length=36, default=lambda: str(uuid.uuid4()))
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
