import base64
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, UploadFile, File
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from app.core.config import get_settings
from app.core.database import async_session
from app.middleware.auth import get_current_user
from app.models.user import User
from app.models.mastery_profile import MasteryProfile
from app.services.voice_service import transcribe_audio, text_to_speech
from app.services.nexi_engine import generate_socratic_response
from app.services.mastery_service import get_mastery_profile

router = APIRouter(prefix="/api/voice", tags=["voice"])


class TTSRequest(BaseModel):
    text: str


@router.post("/stt")
async def stt_endpoint(
    audio: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Transcribe audio to text using Deepgram. Accepts audio/webm."""
    audio_bytes = await audio.read()
    if len(audio_bytes) == 0:
        return JSONResponse({"transcript": ""})
    transcript = await transcribe_audio(audio_bytes)
    return JSONResponse({"transcript": transcript})


@router.post("/tts")
async def tts_endpoint(
    request: TTSRequest,
    user: User = Depends(get_current_user),
):
    """Convert text to speech. Returns audio/mpeg bytes."""
    try:
        audio_chunks = []
        async for chunk in text_to_speech(request.text[:2000]):
            audio_chunks.append(chunk)

        audio_bytes = b"".join(audio_chunks)
        if not audio_bytes:
            raise HTTPException(503, "Voice service returned no audio")
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline"},
        )
    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        if "401" in error_msg or "Unauthorized" in error_msg:
            raise HTTPException(503, "Voice service API key is invalid or expired")
        if "quota" in error_msg.lower() or "limit" in error_msg.lower() or "402" in error_msg:
            raise HTTPException(503, "Voice service quota exhausted — text-to-speech is temporarily unavailable")
        raise HTTPException(503, f"Voice service unavailable: {error_msg[:100]}")

settings = get_settings()

# Session mode progression based on exchange count
MODE_ORDER = ["teach", "check_understanding", "challenge", "apply", "reflect"]


def _determine_mode(exchange_count: int) -> str:
    if exchange_count <= 3:
        return "teach"
    elif exchange_count <= 5:
        return "check_understanding"
    elif exchange_count <= 8:
        return "challenge"
    elif exchange_count <= 11:
        return "apply"
    return "reflect"


async def _authenticate_ws(token: str | None) -> User | None:
    """Authenticate WebSocket connection via token query param."""
    if not token:
        return None

    # Dev auth mode
    if settings.DEV_AUTH and token.startswith("dev:"):
        auth0_sub = token[4:]
        async with async_session() as db:
            result = await db.execute(
                select(User).where(User.auth0_sub == auth0_sub)
            )
            return result.scalar_one_or_none()

    # TODO: Production JWT verification
    return None


@router.websocket("/stream")
async def voice_stream(
    websocket: WebSocket,
    token: str | None = Query(default=None),
):
    """WebSocket endpoint for voice conversations.

    Connect with: ws://host/api/voice/stream?token=dev:auth0|learner-maria

    Client sends: binary audio data (WebM)
    Server responds:
      - {type: "transcript", content: "..."} — transcribed user speech
      - {type: "response_text", content: "..."} — Nexi's text response
      - {type: "response_audio", content: "base64..."} — TTS audio
    """
    # Authenticate
    user = await _authenticate_ws(token)
    if not user:
        await websocket.close(code=4001, reason="Authentication required. Pass ?token=...")
        return

    await websocket.accept()

    # Load mastery profile for context
    profile_dict = None
    async with async_session() as db:
        profile = await get_mastery_profile(user.id, db)
        if profile:
            profile_dict = {
                "thinking_patterns": profile.thinking_patterns,
                "knowledge_graph": profile.knowledge_graph,
                "pacing_preferences": profile.pacing_preferences,
            }

    # Maintain conversation history across the session
    conversation_history: list[dict] = []

    try:
        while True:
            audio_data = await websocket.receive_bytes()

            # Transcribe with Deepgram
            try:
                transcript = await transcribe_audio(audio_data)
            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "content": f"Transcription failed: {str(e)}",
                })
                continue

            await websocket.send_json({
                "type": "transcript",
                "content": transcript,
            })

            if not transcript.strip():
                continue

            # Add to conversation history
            conversation_history.append({"role": "user", "content": transcript})

            # Determine session mode based on exchange count
            exchange_count = sum(1 for m in conversation_history if m["role"] == "user")
            session_mode = _determine_mode(exchange_count)

            # Generate Nexi response with full context
            full_response = ""
            try:
                async for token_text in generate_socratic_response(
                    conversation_history=conversation_history,
                    mastery_profile=profile_dict,
                    course_chunks=[],  # RAG optional
                    session_mode=session_mode,
                ):
                    full_response += token_text
            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "content": f"AI response failed: {str(e)}",
                })
                continue

            # Add assistant response to history
            conversation_history.append({"role": "assistant", "content": full_response})

            await websocket.send_json({
                "type": "response_text",
                "content": full_response,
            })

            # Convert to speech with ElevenLabs
            try:
                audio_chunks = []
                async for chunk in text_to_speech(full_response):
                    audio_chunks.append(chunk)

                audio_bytes = b"".join(audio_chunks)
                await websocket.send_json({
                    "type": "response_audio",
                    "content": base64.b64encode(audio_bytes).decode("utf-8"),
                })
            except Exception as e:
                await websocket.send_json({
                    "type": "error",
                    "content": f"TTS failed: {str(e)}",
                })

    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.close()
        except Exception:
            pass
