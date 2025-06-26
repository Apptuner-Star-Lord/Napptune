import json
from channels.generic.websocket import AsyncWebsocketConsumer
import os, time
import httpx
from channels.db import database_sync_to_async
import asyncio
import edge_tts
import base64
import re
from langchain.memory import ConversationBufferMemory
import pickle

LLAMA3_API_URL = os.getenv('LLAMA3_API_URL', 'http://localhost:11434/api/chat')  # Adjust as needed

class TTSService:
    def __init__(self, voice="en-AU-WilliamNeural"):
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

class ProjectInfoExtractorMixin:
    def extract_project_info(self, text):
        """
        Extract project info from the LLM response. This is a simple example and should be improved
        for production (e.g., use regex, LLM function calling, or structured output).
        """
        import re
        info = {}
        # Example: extract number of developers
        devs = re.search(r'(\d+)\s+developer', text, re.I)
        if devs:
            info['num_developers'] = int(devs.group(1))
        # Example: extract time estimate
        time = re.search(r'(\d+)\s+(week|month|day|hour)', text, re.I)
        if time:
            info['time_estimate'] = f"{time.group(1)} {time.group(2)}"
        # Example: extract cost estimate
        cost = re.search(r'\$([\d,]+)', text)
        if cost:
            info['cost_estimate'] = cost.group(1)
        # Example: extract cloud/3rd party services
        services = re.findall(r'(AWS|Azure|GCP|Firebase|Stripe|Twilio)', text, re.I)
        if services:
            info['services'] = ', '.join(set([s.upper() for s in services]))
        return info if info else None

class ChatConsumer(ProjectInfoExtractorMixin, AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        time.sleep(1)
        welcome_message = "Hello, I\'m Mr. Developer, your friendly assistant at Apptunix. I\'m excited to learn more about your project idea and see if we can help bring it to life. To get started, can you tell me a bit about what\'s on your mind?"
        await self.send(text_data=json.dumps({
                'message': welcome_message
            }))

    async def disconnect(self, close_code):
        pass

    @database_sync_to_async
    def get_or_create_session(self, session_id):
        from .models import ChatSession
        session, created = ChatSession.objects.get_or_create(session_id=session_id)
        # Load or initialize memory
        memory = None
        if hasattr(session, 'memory_buffer') and session.memory_buffer:
            try:
                memory = pickle.loads(session.memory_buffer)
                print(f"[DEBUG] Loaded memory for session {session_id}: {memory}")
            except Exception as e:
                print(f"[DEBUG] Failed to load memory for session {session_id}: {e}")
                memory = ConversationBufferMemory(return_messages=True)
        else:
            print(f"[DEBUG] No memory found for session {session_id}, initializing new memory.")
            memory = ConversationBufferMemory(return_messages=True)
        return session, memory

    @database_sync_to_async
    def save_memory(self, session, memory):
        import pickle
        session.memory_buffer = pickle.dumps(memory)
        session.save()
        print(f"[DEBUG] Saved memory for session {session.session_id}")

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

    @database_sync_to_async
    def save_project_info(self, session, info_dict):
        from .models import ProjectInfo
        # Save or update project info for this session
        obj, _ = ProjectInfo.objects.update_or_create(
            session=session,
            defaults=info_dict
        )
        return obj

    def langchain_history_to_openai(self, history):
        # Converts LangChain message objects to OpenAI-style dicts
        from langchain.schema import HumanMessage, AIMessage, SystemMessage
        result = []
        for msg in history:
            if isinstance(msg, HumanMessage):
                result.append({"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                result.append({"role": "assistant", "content": msg.content})
            elif isinstance(msg, SystemMessage):
                result.append({"role": "system", "content": msg.content})
        return result

    async def receive(self, text_data):
        data = json.loads(text_data)
        user_message = data.get('message', '')
        session_id = data.get('session_id')
        if not session_id:
            import uuid
            session_id = str(uuid.uuid4())
        session, memory = await self.get_or_create_session(session_id)
        # Use LangChain memory for context
        history = memory.load_memory_variables({})['history']
        context_msgs = self.langchain_history_to_openai(history)
        # Updated system prompt for Expo AI Assistant
        system_prompt = (
            "You are Mr. Developer, an AI assistant for the Apptunix (IT consultancy) website, currently showcased at an Expo. Booth"
            "Begin each conversation with a warm, friendly greeting and a brief introduction about yourself and Apptunix. "
            "Do not start by asking questions immediately. Wait for the user to share their thoughts or project idea first. "
            "Once the user responds, act as a business person and technical analyst: interact with potential leads, gather all necessary details about their project ideas, and provide a clear outline for project kickoff. Questions should be asked step by step, and only one question should be asked at a time. Keep your responses concise and focused."
            "Ask questions to understand the client's vision, business goals, and technical requirements only after the initial greeting and user response. "
            "After gathering enough information, provide an outline of required resources (number of developers, 3rd party services, cloud services, etc.), time and cost estimations, and a summary of the next steps. "
            "Be friendly, professional, and proactive in helping the client shape their project."
        )
        # Only send system prompt if this is the first message
        print("------------------------------------------------>", context_msgs)
        if not context_msgs:
            print("================================> No context messages found, sending system prompt")
            messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_message}]
        else:
            messages =  context_msgs + [{"role": "user", "content": user_message + " Keep Your response Short and Crisp. (not more than 50 words)"}]
        payload = {
            "model": "llama3",
            "stream": True,
            "messages": messages,
            "max_tokens": 200,  # Limit the number of tokens in the response
            "temperature": 0.7,  # Optional: make responses more focused
        }
        headers = {
            'Content-Type': 'application/json'
        }
        try:
            # Now add user message to memory and DB (after context check)
            memory.chat_memory.add_user_message(user_message)
            await self.save_message(session, 'user', user_message)
            # Stream LLM response as soon as each part arrives
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
                                    # Stream each part to the frontend as it arrives
                                    await self.send(text_data=json.dumps({
                                        'message': full_message,
                                        'session_id': session_id,
                                        'streaming': True
                                    }))
                            except Exception:
                                continue
            # Save assistant message
            await self.save_message(session, 'assistant', full_message)
            # Try to extract and save project info from the LLM response
            project_info = self.extract_project_info(full_message)
            if project_info:
                await self.save_project_info(session, project_info)
            # Send final message (with streaming: False)
            memory.chat_memory.add_ai_message(full_message)
            await self.save_memory(session, memory)
            await self.send(text_data=json.dumps({
                'full_message': full_message,
                'session_id': session_id,
                'streaming': False
            }))
        except Exception as e:
            await self.send(text_data=json.dumps({
                'message': f'Error: {str(e)}',
                'session_id': session_id,
                'streaming': False
            }))

class VoiceChatConsumer(ProjectInfoExtractorMixin, AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        # # Send greeting as soon as connection is established (as audio)
        # greeting_text = (
        #     "Hello, I'm Mr. Developer, your friendly assistant at Apptunix. "
        #     "I'm excited to learn more about your project idea and see if we can help bring it to life. "
        #     "To get started, can you tell me a bit about what's on your mind?"
        # )
        # tts_service = TTSService()
        # async for chunk in tts_service.stream_text_to_speech(greeting_text):
        #     await self.send(text_data=json.dumps(chunk))

    async def disconnect(self, close_code):
        pass

    @database_sync_to_async
    def get_or_create_session(self, session_id):
        from .models import ChatSession
        session, created = ChatSession.objects.get_or_create(session_id=session_id)
        # Load or initialize memory
        memory = None
        if hasattr(session, 'memory_buffer') and session.memory_buffer:
            try:
                memory = pickle.loads(session.memory_buffer)
                print(f"[DEBUG] Loaded memory for session {session_id}: {memory}")
            except Exception as e:
                print(f"[DEBUG] Failed to load memory for session {session_id}: {e}")
                memory = ConversationBufferMemory(return_messages=True)
        else:
            print(f"[DEBUG] No memory found for session {session_id}, initializing new memory.")
            memory = ConversationBufferMemory(return_messages=True)
        return session, memory

    @database_sync_to_async
    def save_memory(self, session, memory):
        import pickle
        session.memory_buffer = pickle.dumps(memory)
        session.save()
        print(f"[DEBUG] Saved memory for session {session.session_id}")

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

    @database_sync_to_async
    def save_project_info(self, session, info_dict):
        from .models import ProjectInfo
        # Save or update project info for this session
        obj, _ = ProjectInfo.objects.update_or_create(
            session=session,
            defaults=info_dict
        )
        return obj

    def langchain_history_to_openai(self, history):
        # Converts LangChain message objects to OpenAI-style dicts
        from langchain.schema import HumanMessage, AIMessage, SystemMessage
        result = []
        for msg in history:
            if isinstance(msg, HumanMessage):
                result.append({"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                result.append({"role": "assistant", "content": msg.content})
            elif isinstance(msg, SystemMessage):
                result.append({"role": "system", "content": msg.content})
        return result

    async def receive(self, text_data):
        data = json.loads(text_data)
        user_text = data.get("text", "")
        voice = "en-US-GuyNeural"
        session_id = data.get("session_id")
        if not session_id:
            import uuid
            session_id = str(uuid.uuid4())
        # Get or create session
        session, memory = await self.get_or_create_session(session_id)
        # Do NOT add user message to memory yet!
        await self.save_message(session, 'user', user_text)
        # Get context messages (all previous turns)
        history = memory.load_memory_variables({})['history']
        context_msgs = self.langchain_history_to_openai(history)
        # Compose system prompt
        system_prompt = (
            "You are Mr. Developer, an AI assistant for the Apptunix website, currently showcased at an Expo. Booth"
            "Begin each conversation with a warm, friendly greeting and a brief introduction about yourself and Apptunix. "
            "Do not start by asking questions immediately. Wait for the user to share their thoughts or project idea first. "
            "Once the user responds, act as a business person and technical analyst: interact with potential leads, gather all necessary details about their project ideas, and provide a clear outline for project kickoff. Questions should be asked step by step, and only one question should be asked at a time. Keep your responses concise and focused."
            "Ask questions to understand the client's vision, business goals, and technical requirements only after the initial greeting and user response. "
            "After gathering enough information, provide an outline of required resources (number of developers, 3rd party services, cloud services, etc.), time and cost estimations, and a summary of the next steps. "
            "Be friendly, professional, and proactive in helping the client shape their project."
        )
        # Only send system prompt if this is the first message
        print("------------------------------------------------>",context_msgs)
        if not context_msgs:
            messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_text}]
        else:
            messages = context_msgs + [{"role": "user", "content": user_text + " Keep Your response Short and Crisp. (NOTE: Response shouldn't be more than 65 words)"}]
        payload = {
            "model": "llama3",
            "stream": True,
            "messages": messages,
            "max_tokens": 100,  # Limit the number of tokens in the response
            "temperature": 0.7,  # Optional: make responses more focused
        }
        headers = {
            'Content-Type': 'application/json'
        }
        try:
            tts_service = TTSService(voice=voice)
            buffer = ""
            chunk_index = 0
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
                                    buffer += part
                                    full_message += part
                                    sentences = tts_service.split_into_sentences(buffer)
                                    if sentences:
                                        if not re.search(r'[.!?]$|\"$|\'$|\)$', buffer.strip()):
                                            incomplete = sentences.pop() if sentences else ""
                                        else:
                                            incomplete = ""
                                        for i, sentence in enumerate(sentences):
                                            if sentence:
                                                sentence_clean = sentence.replace("*", "")
                                                audio_base64 = await tts_service.text_to_speech_chunk(sentence_clean)
                                                print(f"[TTS DEBUG] Sentence: {sentence}")
                                                print(f"[TTS DEBUG] Audio base64 length: {len(audio_base64) if audio_base64 else 0}")
                                                await self.send(text_data=json.dumps({
                                                    "text": sentence,
                                                    "audio_data": audio_base64,
                                                    "chunk_index": chunk_index,
                                                    "is_final": False,
                                                    "session_id": session_id,
                                                    "streaming": True
                                                }))
                                                chunk_index += 1
                                        buffer = incomplete
                            except Exception as e:
                                print(f"[TTS ERROR] {e}")
                                continue
            # After streaming ends, flush any remaining buffer as final sentence
            if buffer.strip():
                sentences = tts_service.split_into_sentences(buffer)
                for i, sentence in enumerate(sentences):
                    if sentence:
                        sentence_clean = sentence.replace("*", "")
                        audio_base64 = await tts_service.text_to_speech_chunk(sentence_clean)
                        print(f"[TTS DEBUG] FINAL Sentence: {sentence}")
                        print(f"[TTS DEBUG] FINAL Audio base64 length: {len(audio_base64) if audio_base64 else 0}")
                        await self.send(text_data=json.dumps({
                            "text": sentence,
                            "audio_data": audio_base64,
                            "chunk_index": chunk_index,
                            "is_final": i == len(sentences) - 1,
                            "session_id": session_id,
                            "streaming": False
                        }))
                        chunk_index += 1
            # Save assistant message
            await self.save_message(session, 'assistant', full_message)
            # Try to extract and save project info from the LLM response
            project_info = self.extract_project_info(full_message)
            if project_info:
                await self.save_project_info(session, project_info)
            # Now update memory with user and assistant messages
            memory.chat_memory.add_user_message(user_text)
            memory.chat_memory.add_ai_message(full_message)
            await self.save_memory(session, memory)
        except Exception as e:
            await self.send(text_data=json.dumps({
                'message': f'Error: {str(e)}',
                'session_id': session_id,
                'streaming': False
            }))

    def split_sentences_with_abbr(self, text):
        """
        Split text into sentences using punctuation, but handle common abbreviations.
        """
        # List of common abbreviations (add more as needed)
        abbrs = [
            "Mr.", "Mrs.", "Ms.", "Dr.", "Jr.", "Sr.", "vs.", "etc.", "e.g.", "i.e.", "U.S.A.", "U.A.E.","U.K.", "Inc.", "Ltd.", "Co.", "St.", "Prof.", "Ph.D.", "M.D.", "B.Sc.", "M.Sc."
        ]
        # Protect abbreviations by replacing periods with a placeholder
        abbr_map = {}
        for abbr in abbrs:
            safe = abbr.replace(".", "<DOT>")
            abbr_map[safe] = abbr
            text = text.replace(abbr, safe)
        # Split on punctuation
        import re
        sentences = re.split(r'(?<=[.!?])\s+', text)
        # Restore abbreviations
        sentences = [s.replace("<DOT>", ".") for s in sentences if s.strip()]
        return sentences
