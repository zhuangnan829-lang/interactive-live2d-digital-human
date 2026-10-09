import asyncio
import json
import logging
import os
import time
import uuid
from collections import OrderedDict

import edge_tts
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

app = FastAPI(title='Digital Human TTS')
logger = logging.getLogger('digital-human.tts')
logger.setLevel(logging.INFO)
active_syntheses: dict[str, asyncio.Task] = {}
active_stream_cancels: dict[str, asyncio.Event] = {}
audio_cache: OrderedDict[str, bytes] = OrderedDict()
CACHE_MAX_ENTRIES = int(os.getenv('TTS_CACHE_MAX_ENTRIES', '64'))

MAX_LENGTH = int(os.getenv('TTS_MAX_LENGTH', '500'))
TTS_PROVIDER = os.getenv('TTS_PROVIDER', 'auto').lower()
EDGE_VOICE = os.getenv('TTS_VOICE', 'zh-CN-XiaoyiNeural')
ALIYUN_MODEL = os.getenv('ALIYUN_TTS_MODEL', 'cosyvoice-v3-flash')
ALIYUN_VOICE = os.getenv('ALIYUN_TTS_VOICE', 'longanqin_v3')
ALIYUN_RATE = float(os.getenv('ALIYUN_TTS_RATE', '1.0'))
ALIYUN_PITCH = float(os.getenv('ALIYUN_TTS_PITCH', '1.03'))


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_LENGTH)


class TTSCancelRequest(BaseModel):
    client_id: str = Field(min_length=8, max_length=80)


def cache_key(text: str, provider: str) -> str:
    voice = ALIYUN_VOICE if provider == 'aliyun-cosyvoice' else EDGE_VOICE
    return f'{provider}\0{voice}\0{text}'


def get_cached_audio(text: str, provider: str) -> bytes | None:
    key = cache_key(text, provider)
    audio = audio_cache.get(key)
    if audio is not None:
        audio_cache.move_to_end(key)
    return audio


def store_cached_audio(text: str, provider: str, audio: bytes) -> None:
    key = cache_key(text, provider)
    audio_cache[key] = audio
    audio_cache.move_to_end(key)
    while len(audio_cache) > CACHE_MAX_ENTRIES:
        audio_cache.popitem(last=False)


def resolved_provider() -> str:
    if TTS_PROVIDER == 'auto':
        return 'aliyun-cosyvoice' if os.getenv('DASHSCOPE_API_KEY') else 'edge-tts'
    return 'aliyun-cosyvoice' if TTS_PROVIDER in {'aliyun', 'dashscope', 'cosyvoice'} else 'edge-tts'


@app.get('/health')
async def health():
    provider = resolved_provider()
    return {
        'status': 'ok',
        'provider': provider,
        'voice': ALIYUN_VOICE if provider == 'aliyun-cosyvoice' else EDGE_VOICE,
        'model': ALIYUN_MODEL if provider == 'aliyun-cosyvoice' else 'edge-neural',
        'activeSyntheses': (
            sum(1 for task in active_syntheses.values() if not task.done())
            + len(active_stream_cancels)
        ),
        'cachedUtterances': len(audio_cache),
    }


async def synthesize_with_aliyun(text: str, on_first_audio=None) -> bytes:
    api_key = os.getenv('DASHSCOPE_API_KEY')
    if not api_key:
        raise RuntimeError('DASHSCOPE_API_KEY 未配置')

    import dashscope
    from dashscope.audio.tts_v2 import AudioFormat, SpeechSynthesizer

    dashscope.api_key = api_key
    websocket_url = os.getenv('DASHSCOPE_WEBSOCKET_URL')
    if websocket_url:
        dashscope.base_websocket_api_url = websocket_url

    def call() -> bytes:
        synthesizer = SpeechSynthesizer(
            model=ALIYUN_MODEL,
            voice=ALIYUN_VOICE,
            format=AudioFormat.MP3_22050HZ_MONO_256KBPS,
            speech_rate=ALIYUN_RATE,
            pitch_rate=ALIYUN_PITCH,
        )
        audio = synthesizer.call(text)
        if not audio:
            raise RuntimeError('阿里云未返回音频数据')
        return audio

    audio = await asyncio.to_thread(call)
    if on_first_audio:
        on_first_audio()
    return audio


async def synthesize_with_edge(text: str, on_first_audio=None) -> bytes:
    chunks = bytearray()
    async for chunk in edge_tts.Communicate(text, EDGE_VOICE, rate='+0%', pitch='+2Hz').stream():
        if chunk['type'] == 'audio':
            if not chunks and on_first_audio:
                on_first_audio()
            chunks.extend(chunk['data'])
    if not chunks:
        raise RuntimeError('备用语音服务未返回音频数据')
    return bytes(chunks)


async def synthesize_text(text: str, provider: str, on_first_audio=None) -> bytes:
    cached = get_cached_audio(text, provider)
    if cached is not None:
        if on_first_audio:
            on_first_audio()
        return cached
    audio = await (
        synthesize_with_aliyun(text, on_first_audio)
        if provider == 'aliyun-cosyvoice'
        else synthesize_with_edge(text, on_first_audio)
    )
    store_cached_audio(text, provider, audio)
    return audio


@app.post('/tts/prewarm')
async def prewarm_tts(req: TTSRequest, x_tts_client_id: str | None = Header(default=None)):
    text = req.text.strip()
    if not text:
        raise HTTPException(400, '文字不能为空')
    provider = resolved_provider()
    cached = get_cached_audio(text, provider)
    if cached is not None:
        return {'cached': True, 'bytes': len(cached), 'provider': provider}
    key = cache_key(text, provider)
    previous = active_syntheses.get(x_tts_client_id) if x_tts_client_id else None
    if previous and not previous.done() and previous.get_name() == key:
        return {'cached': False, 'accepted': True, 'alreadyGenerating': True, 'provider': provider}
    if previous and not previous.done():
        previous.cancel()

    synthesis = asyncio.create_task(synthesize_text(text, provider))
    synthesis.set_name(key)
    if x_tts_client_id:
        active_syntheses[x_tts_client_id] = synthesis

    def finish(task: asyncio.Task) -> None:
        if x_tts_client_id and active_syntheses.get(x_tts_client_id) is task:
            active_syntheses.pop(x_tts_client_id, None)
        if task.cancelled():
            return
        try:
            task.result()
        except Exception as error:
            logger.warning(
                'tts_prewarm_error provider=%s error=%s',
                provider,
                type(error).__name__,
            )

    synthesis.add_done_callback(finish)
    return {'cached': False, 'accepted': True, 'alreadyGenerating': False, 'provider': provider}


@app.post('/tts/cancel')
async def cancel_tts(req: TTSCancelRequest):
    task = active_syntheses.pop(req.client_id, None)
    stream_cancel = active_stream_cancels.pop(req.client_id, None)
    if stream_cancel:
        stream_cancel.set()
    if task and not task.done():
        task.cancel()
        return {'cancelled': True}
    return {'cancelled': stream_cancel is not None}


@app.get('/tts/stream')
async def tts_stream(text: str, client_id: str):
    text = text.strip()
    if not text:
        raise HTTPException(400, '文字不能为空')
    if len(text) > MAX_LENGTH:
        raise HTTPException(400, f'文字不能超过 {MAX_LENGTH} 个字符')

    provider = resolved_provider()
    request_id = uuid.uuid4().hex[:12]
    started = time.perf_counter()
    previous_task = active_syntheses.get(client_id)
    previous_stream = active_stream_cancels.pop(client_id, None)
    if previous_stream:
        previous_stream.set()
    cancel_event = asyncio.Event()
    active_stream_cancels[client_id] = cancel_event

    prewarmed_audio = None
    if previous_task and not previous_task.done():
        if previous_task.get_name() == cache_key(text, provider):
            try:
                prewarmed_audio = await previous_task
            except (asyncio.CancelledError, Exception):
                prewarmed_audio = None
            finally:
                if active_syntheses.get(client_id) is previous_task:
                    active_syntheses.pop(client_id, None)
        else:
            previous_task.cancel()
            active_syntheses.pop(client_id, None)

    async def stream_audio():
        first_audio_at = None
        total_bytes = 0
        try:
            if cancel_event.is_set():
                return
            cached = get_cached_audio(text, provider) or prewarmed_audio
            if cached is not None:
                first_audio_at = time.perf_counter()
                total_bytes = len(cached)
                yield cached
            elif provider == 'aliyun-cosyvoice':
                audio = await synthesize_with_aliyun(text)
                if not cancel_event.is_set():
                    first_audio_at = time.perf_counter()
                    total_bytes = len(audio)
                    store_cached_audio(text, provider, audio)
                    yield audio
            else:
                collected = bytearray()
                async for chunk in edge_tts.Communicate(
                    text, EDGE_VOICE, rate='+0%', pitch='+2Hz'
                ).stream():
                    if cancel_event.is_set():
                        break
                    if chunk['type'] == 'audio':
                        if first_audio_at is None:
                            first_audio_at = time.perf_counter()
                        data = chunk['data']
                        collected.extend(data)
                        total_bytes += len(data)
                        yield data
                if collected and not cancel_event.is_set():
                    store_cached_audio(text, provider, bytes(collected))
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.warning('tts_stream_error request=%s provider=%s error=%s', request_id, provider, type(error).__name__)
            return
        finally:
            if active_stream_cancels.get(client_id) is cancel_event:
                active_stream_cancels.pop(client_id, None)
            completed = time.perf_counter()
            logger.info('tts_stream_timing %s', json.dumps({
                'requestId': request_id,
                'provider': provider,
                'firstAudioMs': round(((first_audio_at or completed) - started) * 1000, 3),
                'completeMs': round((completed - started) * 1000, 3),
                'bytes': total_bytes,
                'cancelled': cancel_event.is_set(),
            }, ensure_ascii=False))

    return StreamingResponse(
        stream_audio(),
        media_type='audio/mpeg',
        headers={
            'Cache-Control': 'no-store',
            'X-TTS-Provider': provider,
            'X-TTS-Request-Id': request_id,
            'X-Content-Type-Options': 'nosniff',
        },
    )


@app.post('/tts')
async def tts(req: TTSRequest, x_tts_client_id: str | None = Header(default=None)):
    received_at = time.time()
    started = time.perf_counter()
    text = req.text.strip()
    if not text:
        raise HTTPException(400, '文字不能为空')

    provider = resolved_provider()
    request_id = uuid.uuid4().hex[:12]
    synth_started = time.perf_counter()
    first_audio_at = None

    def mark_first_audio():
        nonlocal first_audio_at
        if first_audio_at is None:
            first_audio_at = time.perf_counter()

    try:
        synthesis = asyncio.create_task(synthesize_text(text, provider, mark_first_audio))
        if x_tts_client_id:
            previous_stream = active_stream_cancels.pop(x_tts_client_id, None)
            if previous_stream:
                previous_stream.set()
            previous = active_syntheses.get(x_tts_client_id)
            if previous and not previous.done():
                previous.cancel()
            active_syntheses[x_tts_client_id] = synthesis
        try:
            audio = await synthesis
        finally:
            if x_tts_client_id and active_syntheses.get(x_tts_client_id) is synthesis:
                active_syntheses.pop(x_tts_client_id, None)
        completed = time.perf_counter()
        first_audio_at = first_audio_at or completed
        timing = {
            'requestId': request_id,
            'receivedEpochMs': round(received_at * 1000, 3),
            'backendStartMs': 0.0,
            'synthesisStartMs': round((synth_started - started) * 1000, 3),
            'firstAudioMs': round((first_audio_at - started) * 1000, 3),
            'completeMs': round((completed - started) * 1000, 3),
            'bytes': len(audio),
            'provider': provider,
        }
        logger.info('tts_timing %s', json.dumps(timing, ensure_ascii=False))
        return Response(
            content=audio,
            media_type='audio/mpeg',
            headers={
                'Content-Disposition': 'inline; filename="speech.mp3"',
                'X-TTS-Provider': provider,
                'X-TTS-Voice': ALIYUN_VOICE if provider == 'aliyun-cosyvoice' else EDGE_VOICE,
                'X-TTS-Request-Id': request_id,
                'X-TTS-Received-Epoch-Ms': str(timing['receivedEpochMs']),
                'X-TTS-First-Audio-Ms': str(timing['firstAudioMs']),
                'X-TTS-Complete-Ms': str(timing['completeMs']),
                'Server-Timing': (
                    f"tts_first;dur={timing['firstAudioMs']}, "
                    f"tts_complete;dur={timing['completeMs']}"
                ),
            },
        )
    except asyncio.CancelledError as error:
        raise HTTPException(499, 'TTS 请求已取消') from error
    except Exception as error:
        raise HTTPException(503, f'中文 TTS 服务不可用（{provider}）：{type(error).__name__}') from error
