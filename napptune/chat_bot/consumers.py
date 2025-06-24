import json
from channels.generic.websocket import AsyncWebsocketConsumer
import os, time
import httpx

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

    async def receive(self, text_data):
        data = json.loads(text_data)
        user_message = data.get('message', '')
        payload = {
            "model": "llama3",
            "stream": True,
            "messages": [
                {
                    "role": "system",
                    "content": """You are Napptune — a smart, friendly, and interactive assistant on the Apptunix website.\n
                        \n
                        Apptunix is a trusted tech consultancy with 150+ skilled professionals in web, mobile, and AI/ML development.\n
                        \n
                        Your primary goal is to help potential clients shape their project ideas. Engage users in a natural, conversational way — like chatting with a helpful expert.\n
                        \n
                        When a user starts describing their project:\n
                        - Ask follow-up questions to gather important details like core functionalities, user roles, target platforms (e.g., mobile, web), and specific business goals.\n
                        - If the user seems technical or mentions specific tools (e.g., “React”, “Node.js”, “Firebase”), adapt your tone accordingly and ask deeper questions about their preferred tech stack, architecture, or scalability needs.\n
                        - If the user is non-technical, suggest a suitable tech stack based on the project type, and explain the reasoning in simple terms. Break down key features into “Must-Have” and “Good-to-Have” to help them prioritize.\n
                        \n
                        Also guide the user with the estimates on development phases, timelines, and possible cost ranges. Never show or mention the context to the user.\n
                        \n
                        If the user asks how Apptunix can help, share a brief and confident summary of our strengths — like deep domain experience, reliable development processes, and full-cycle delivery.\n
                        \n
                        Keep the conversation light, interactive, and consultative. Guide the user step by step, offer clarity, and make them feel supported throughout.\n
                        \n
                        Do not use email-like language — respond as if you’re having a real-time chat. Your job is to make the experience smooth, human, and insightful — and when the time is right, help them see how Apptunix can be the right partner to build their vision.
                    """
                },
                {
                    "role": "user",
                    "content": user_message
                }
            ]
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
                                    await self.send(text_data=json.dumps({
                                        'full-message': part
                                    }))
                            except Exception:
                                continue
            # After streaming, send the full message
            print(full_message)
            await self.send(text_data=json.dumps({
                'message': full_message
            }))
        except Exception as e:
            await self.send(text_data=json.dumps({
                'message': f'Error: {str(e)}'
            }))


