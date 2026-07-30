# IndexTTS2 部署检查（Windows）
# 用法：.\scripts\setup-index-tts.ps1
# 模型目录默认：C:\my\index-tts\index-tts\checkpoints

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$IndexRoot = if ($env:INDEX_TTS_ROOT) { $env:INDEX_TTS_ROOT } else { "C:\my\index-tts\index-tts" }
$ModelDir = if ($env:INDEX_TTS_MODEL_DIR) { $env:INDEX_TTS_MODEL_DIR } else { Join-Path $IndexRoot "checkpoints" }
$Uv = if ($env:UV_EXE) { $env:UV_EXE } elseif (Test-Path "C:\project\hermes\bin\uv.exe") { "C:\project\hermes\bin\uv.exe" } else { "uv" }

Write-Host "==> IndexTTS2 根目录: $IndexRoot"
Write-Host "==> 模型目录: $ModelDir"

if (-not (Test-Path (Join-Path $IndexRoot "pyproject.toml"))) {
  throw "未找到 IndexTTS2 源码：$IndexRoot。请先将 index-tts-main.zip 解压到 C:\my\index-tts\index-tts"
}

$required = @(
  "config.yaml", "bpe.model", "gpt.pth", "s2mel.pth", "wav2vec2bert_stats.pt", "feat1.pt", "feat2.pt"
)
$missing = @()
foreach ($f in $required) {
  if (-not (Test-Path (Join-Path $ModelDir $f))) { $missing += $f }
}
if (-not (Test-Path (Join-Path $ModelDir "qwen0.6bemo4-merge\model.safetensors"))) {
  $missing += "qwen0.6bemo4-merge/model.safetensors"
}
$aux = @(
  "hf_cache\w2v-bert-2.0\model.safetensors",
  "hf_cache\semantic_codec_model.safetensors",
  "hf_cache\campplus_cn_common.bin",
  "hf_cache\bigvgan\bigvgan_generator.pt",
  "hf_cache\bigvgan\config.json"
)
foreach ($f in $aux) {
  if (-not (Test-Path (Join-Path $ModelDir $f))) { $missing += $f }
}
if ($missing.Count -gt 0) {
  throw "模型文件不完整，缺少：$($missing -join ', ')"
}

Set-Location $IndexRoot
Write-Host "==> 安装 Python 依赖（uv sync --extra webui，首次会下载 PyTorch，较慢）..."
& $Uv sync --extra webui --default-index "https://mirrors.aliyun.com/pypi/simple"

Write-Host "==> 初始化 CLI 配置..."
& $Uv run python -m indextts.cli_v2 init --model-dir $ModelDir

Write-Host "==> 检查模型与 GPU..."
$Python = Join-Path $IndexRoot ".venv\Scripts\python.exe"
if (Test-Path $Python) {
  & $Python -m indextts.cli_v2 check --model-dir $ModelDir --device cuda
} else {
  & $Uv run python -m indextts.cli_v2 check --model-dir $ModelDir --device cuda
}

Write-Host ""
Write-Host "==> IndexTTS2 部署完成"
Write-Host "1. 启动 WebUI 试听: .\scripts\start-index-tts.ps1"
Write-Host "2. 火宝后端健康检查: GET /api/v1/ai-voices/indextts/health"
Write-Host "3. 配音引擎: local_tts_engine=indextts（参考音复用 data/gptsovits-refs）"
