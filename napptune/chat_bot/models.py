from django.db import models
from django.utils import timezone

class ChatSession(models.Model):
    session_id = models.CharField(max_length=128, unique=True)
    created_at = models.DateTimeField(default=timezone.now)
    memory_buffer = models.BinaryField(null=True, blank=True)  # For conversation memory persistence

class Message(models.Model):
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=16)  # 'user', 'assistant', 'system'
    content = models.TextField()
    timestamp = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['timestamp']

class ProjectInfo(models.Model):
    session = models.OneToOneField(ChatSession, on_delete=models.CASCADE, related_name='project_info')
    num_developers = models.IntegerField(null=True, blank=True)
    time_estimate = models.CharField(max_length=64, null=True, blank=True)
    cost_estimate = models.CharField(max_length=64, null=True, blank=True)
    services = models.CharField(max_length=256, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
