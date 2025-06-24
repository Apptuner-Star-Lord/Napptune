import json
from channels.generic.websocket import AsyncWebsocketConsumer
import os, time
import httpx
from channels.db import database_sync_to_async

LLAMA3_API_URL = os.getenv('LLAMA3_API_URL', 'http://localhost:11434/api/chat')  # Adjust as needed

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        time.sleep(1)
        welcome_message = "Hello, I\'m Napptune, your friendly assistant at Apptunix. I\'m excited to learn more about your project idea and see if we can help bring it to life. To get started, can you tell me a bit about what\'s on your mind?"
        await self.send(text_data=json.dumps({
                'message': welcome_message
            }))

    async def disconnect(self, close_code):
        pass

    @database_sync_to_async
    def get_or_create_session(self, session_id):
        from .models import ChatSession
        return ChatSession.objects.get_or_create(session_id=session_id)

    @database_sync_to_async
    def save_message(self, session, role, content):
        from .models import Message
        return Message.objects.create(session=session, role=role, content=content)

    @database_sync_to_async
    def get_context_msgs(self, session):
        from .models import Message
        # Get last 10 messages in correct order
        prev_msgs = Message.objects.filter(session=session).order_by('-timestamp')[:10]
        return [{"role": m.role, "content": m.content} for m in reversed(prev_msgs)]

    async def receive(self, text_data):
        data = json.loads(text_data)
        user_message = data.get('message', '')
        session_id = data.get('session_id')
        if not session_id:
            import uuid
            session_id = str(uuid.uuid4())
        session, _ = await self.get_or_create_session(session_id)
        await self.save_message(session, 'user', user_message)
        context_msgs = await self.get_context_msgs(session)
        payload = {
            "model": "llama3",
            "stream": True,
            "messages": [
                {"role": "system", "content": "You are Napptune, a helpful assistant for Apptunix. Greet the user and help them with their project ideas."}
            ] + context_msgs
        }
        headers = {
            'Content-Type': 'application/json'
        }
        try:
            full_message = ""
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", LLAMA3_API_URL, headers=headers, json=payload) as response:
                    async for chunk in response.aiter_text():
                        for line in chunk.splitlines():
                            if not line.strip():
                                continue
                            try:
                                data = json.loads(line)
                                msg = data.get("message", {})
                                part = msg.get("content", "")
                                if part:
                                    full_message += part
                            except Exception:
                                continue
            # Save assistant message
            await self.save_message(session, 'assistant', full_message)
            await self.send(text_data=json.dumps({
                'message': full_message,
                'session_id': session_id
            }))
        except Exception as e:
            await self.send(text_data=json.dumps({
                'message': f'Error: {str(e)}',
                'session_id': session_id
            }))


