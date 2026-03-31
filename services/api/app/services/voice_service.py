"""
Voice service — ElevenLabs TTS + Deepgram STT integration.
"""

import httpx
from typing import AsyncGenerator
from app.core.config import get_settings

settings = get_settings()

DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"
ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech"
import os
# "Alice — Clear, Engaging Educator" — works on free tier, perfect for Nexi's warm teaching voice
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "Xb7hH8MSUJpSbSDYk0k2")


async def transcribe_audio(audio_bytes: bytes) -> str:
    """Transcribe audio bytes to text using Deepgram."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            DEEPGRAM_URL,
            headers={
                "Authorization": f"Token {settings.DEEPGRAM_API_KEY}",
                "Content-Type": "audio/webm",
            },
            content=audio_bytes,
            params={"model": "nova-2", "smart_format": "true"},
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()
        transcript = (
            data.get("results", {})
            .get("channels", [{}])[0]
            .get("alternatives", [{}])[0]
            .get("transcript", "")
        )
        return transcript


async def text_to_speech(text: str) -> AsyncGenerator[bytes, None]:
    """Convert text to speech audio using ElevenLabs streaming."""
    async with httpx.AsyncClient() as client:
        async with client.stream(
            "POST",
            f"{ELEVENLABS_URL}/{ELEVENLABS_VOICE_ID}/stream",
            headers={
                "xi-api-key": settings.ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "model_id": "eleven_turbo_v2_5",
                "voice_settings": {
                    "stability": 0.6,
                    "similarity_boost": 0.8,
                    "style": 0.3,
                    "use_speaker_boost": True,
                },
            },
            timeout=30.0,
        ) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes(1024):
                yield chunk


async def conversational_session(websocket) -> None:
    """Manage a full voice conversation loop over WebSocket."""
    from app.services.nexi_engine import generate_socratic_response
    import base64

    try:
        while True:
            data = await websocket.receive_bytes()

            # Transcribe audio
            transcript = await transcribe_audio(data)
            if not transcript.strip():
                await websocket.send_json({
                    "type": "transcript",
                    "content": "",
                })
                continue

            await websocket.send_json({
                "type": "transcript",
                "content": transcript,
            })

            # Generate Nexi response
            full_response = ""
            async for token in generate_socratic_response(
                conversation_history=[{"role": "user", "content": transcript}],
                mastery_profile=None,
                course_chunks=[],
                session_mode="clarify",
            ):
                full_response += token

            await websocket.send_json({
                "type": "response_text",
                "content": full_response,
            })

            # Convert to speech and send audio
            audio_chunks = []
            async for chunk in text_to_speech(full_response):
                audio_chunks.append(chunk)

            audio_data = b"".join(audio_chunks)
            await websocket.send_json({
                "type": "response_audio",
                "content": base64.b64encode(audio_data).decode("utf-8"),
            })

    except Exception:
        pass
