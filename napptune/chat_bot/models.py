from django.db import models
from django.utils import timezone

class ChatSession(models.Model):
    session_id = models.CharField(max_length=128, unique=True)
    created_at = models.DateTimeField(default=timezone.now)

class Message(models.Model):
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=16)  # 'user', 'assistant', 'system'
    content = models.TextField()
    timestamp = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['timestamp']
