# 启动 IndexTTS2 WebUI（默认 http://127.0.0.1:7860）
# 用法：.\scripts\start-index-tts.ps1

$ErrorActionPreference = "Stop"
$IndexRoot = if ($env:INDEX_TTS_ROOT) { $env:INDEX_TTS_ROOT } else { "C:\my\index-tts\index-tts" }
$ModelDir = if ($env:INDEX_TTS_MODEL_DIR) { $env:INDEX_TTS_MODEL_DIR } else { Join-Path $IndexRoot "checkpoints" }
$Port = if ($env:INDEX_TTS_PORT) { $env:INDEX_TTS_PORT } else { "7860" }
$HostAddr = if ($env:INDEX_TTS_HOST) { $env:INDEX_TTS_HOST } else { "127.0.0.1" }
$Python = Join-Path $IndexRoot ".venv\Scripts\python.exe"
$Uv = if ($env:UV_EXE) { $env:UV_EXE } elseif (Test-Path "C:\project\hermes\bin\uv.exe") { "C:\project\hermes\bin\uv.exe" } else { "uv" }

if (-not (Test-Path (Join-Path $IndexRoot "webui.py"))) {
  Write-Host "未找到 IndexTTS2：$IndexRoot"
  Write-Host "请先运行: .\scripts\setup-index-tts.ps1"
  exit 1
}

$env:HF_ENDPOINT = if ($env:HF_ENDPOINT) { $env:HF_ENDPOINT } else { "https://hf-mirror.com" }
$env:HF_HUB_CACHE = Join-Path $ModelDir "hf_cache"

Write-Host "==> IndexTTS2 WebUI: http://${HostAddr}:${Port}"
Write-Host "==> 模型目录: $ModelDir"
Write-Host "==> FP16 + gui_seg_tokens=80（16GB 显存推荐）"
Write-Host "==> 按 Ctrl+C 停止"

Set-Location $IndexRoot
if (Test-Path $Python) {
  & $Python webui.py --host $HostAddr --port $Port --model_dir $ModelDir --fp16 --gui_seg_tokens 80
} else {
  & $Uv run webui.py --host $HostAddr --port $Port --model_dir $ModelDir --fp16 --gui_seg_tokens 80
}
