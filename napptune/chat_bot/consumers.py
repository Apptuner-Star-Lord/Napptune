import json
from channels.generic.websocket import AsyncWebsocketConsumer
import os, time
import httpx
from channels.db import database_sync_to_async
import asyncio
import edge_tts
import base64
import re

LLAMA3_API_URL = os.getenv('LLAMA3_API_URL', 'http://localhost:11434/api/chat')  # Adjust as needed

class TTSService:
    def __init__(self, voice="en-US-JennyNeural"):
        self.voice = voice

    def split_into_sentences(self, text):
        # Handles abbreviations like U.S.A. and splits on sentence-ending punctuation
        pattern = r'(?<!\b[A-Z])(?<=[.!?])\s+'
        sentences = re.split(pattern, text.strip())
        return [s.strip() for s in sentences if s.strip()]

    async def text_to_speech_chunk(self, text):
        communicate = edge_tts.Communicate(text, self.voice)
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        return base64.b64encode(audio_data).decode('utf-8')

    async def stream_text_to_speech(self, text):
        sentences = self.split_into_sentences(text)
        for i, sentence in enumerate(sentences):
            if sentence:
                audio_base64 = await self.text_to_speech_chunk(sentence)
                yield {
                    "chunk_index": i,
                    "text": sentence,
                    "audio_data": audio_base64,
                    "is_final": i == len(sentences) - 1
                }
                await asyncio.sleep(0.05)

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

class VoiceChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        await self.send(text_data=json.dumps({"message": "Voice chat connected."}))

    async def disconnect(self, close_code):
        pass

    async def receive(self, text_data):
        data = json.loads(text_data)
        text = data.get("text", "")
        voice = data.get("voice", "en-US-JennyNeural")
        tts_service = TTSService(voice=voice)
        
        test_text = "Hello, I\'m Napptune, your friendly assistant at Apptunix. I\'m excited to learn more about your project idea and see if we can help bring it to life. To get started, can you tell me a bit about what\'s on your mind?"
        
        async for chunk in tts_service.stream_text_to_speech(test_text):
            await self.send(text_data=json.dumps(chunk))
