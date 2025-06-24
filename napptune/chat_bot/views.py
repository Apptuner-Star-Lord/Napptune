from django.shortcuts import render
from .models import ChatSession, Message
from django.http import JsonResponse

def chat_history(request, session_id):
    try:
        session = ChatSession.objects.get(session_id=session_id)
        messages = Message.objects.filter(session=session).order_by('timestamp')
        print(f"Retrieved {len(messages)} messages for session {session_id}")
        return JsonResponse({
            'messages': [
                {'role': m.role, 'content': m.content, 'timestamp': m.timestamp.isoformat()} for m in messages
            ]
        })
    except ChatSession.DoesNotExist:
        return JsonResponse({'messages': []})

# Create your views here.
