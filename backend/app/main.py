import os, tempfile
from pathlib import Path
import edge_tts
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

app = FastAPI(title='Digital Human TTS')
VOICE = os.getenv('TTS_VOICE','zh-CN-XiaoxiaoNeural')
MAX_LENGTH = int(os.getenv('TTS_MAX_LENGTH','500'))
class TTSRequest(BaseModel): text: str = Field(min_length=1,max_length=500)
@app.get('/health')
async def health(): return {'status':'ok','provider':'edge-tts','voice':VOICE}
@app.post('/tts')
async def tts(req:TTSRequest):
    text=req.text.strip()
    if not text: raise HTTPException(400,'文字不能为空')
    try:
        f=Path(tempfile.mkstemp(suffix='.mp3')[1]); await edge_tts.Communicate(text, VOICE).save(str(f))
        return FileResponse(str(f),media_type='audio/mpeg',filename='speech.mp3',background=None)
    except Exception as e: raise HTTPException(503,f'中文 TTS 服务不可用：{type(e).__name__}')
