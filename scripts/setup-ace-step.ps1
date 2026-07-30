# ACE-Step 1.5 部署检查（Windows）
# 用法：.\scripts\setup-ace-step.ps1
# 默认根目录：C:\my\ace-step\ACE-Step-1.5

$ErrorActionPreference = "Stop"
$AceRoot = if ($env:ACE_STEP_ROOT) { $env:ACE_STEP_ROOT } else { "C:\my\ace-step\ACE-Step-1.5" }
$Ck = Join-Path $AceRoot "checkpoints"
$Uv = if ($env:UV_EXE) { $env:UV_EXE } elseif (Test-Path "C:\project\hermes\bin\uv.exe") { "C:\project\hermes\bin\uv.exe" } else { "uv" }
$Ms = "https://www.modelscope.cn/models/ACE-Step/Ace-Step1.5/resolve/master"

Write-Host "==> ACE-Step 根目录: $AceRoot"
Write-Host "==> checkpoints: $Ck"

if (-not (Test-Path (Join-Path $AceRoot "pyproject.toml"))) {
  throw "未找到 ACE-Step 源码：$AceRoot。请将 Ace-Step1.5 解压/克隆到该目录"
}

$required = @(
  "acestep-v15-turbo\model.safetensors",
  "acestep-v15-turbo\silence_latent.pt",
  "acestep-5Hz-lm-1.7B\model.safetensors",
  "acestep-5Hz-lm-1.7B\config.json",
  "vae\config.json",
  "vae\diffusion_pytorch_model.safetensors",
  "Qwen3-Embedding-0.6B\config.json",
  "Qwen3-Embedding-0.6B\model.safetensors"
)

function Ensure-File([string]$rel, [long]$minBytes = 1) {
  $dest = Join-Path $Ck $rel
  if ((Test-Path -LiteralPath $dest) -and ((Get-Item -LiteralPath $dest).Length -ge $minBytes)) {
    Write-Host ("OK  {0} ({1:N1} MB)" -f $rel, ((Get-Item $dest).Length / 1MB))
    return
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
  $url = "$Ms/$($rel.Replace('\', '/'))"
  Write-Host "GET $rel ..."
  Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -TimeoutSec 1800
  Write-Host ("OK  {0} ({1:N1} MB)" -f $rel, ((Get-Item $dest).Length / 1MB))
}

foreach ($rel in $required) {
  $min = if ($rel -match 'model\.safetensors|diffusion_pytorch') { 1MB } else { 1 }
  Ensure-File $rel $min
}

# tokenizer 等小文件（缺失时补齐）
$extras = @(
  "acestep-5Hz-lm-1.7B\tokenizer.json",
  "acestep-5Hz-lm-1.7B\tokenizer_config.json",
  "Qwen3-Embedding-0.6B\tokenizer.json",
  "Qwen3-Embedding-0.6B\tokenizer_config.json"
)
foreach ($rel in $extras) {
  try { Ensure-File $rel 1 } catch { Write-Host "WARN skip $rel :: $($_.Exception.Message)" }
}

Set-Location $AceRoot
Write-Host "==> 安装 Python 依赖（uv sync，首次会下 torch/CUDA，较慢）..."
# 勿强制 --default-index 镜像：torch 需走 pyproject 里的 pytorch-cu128 源
& $Uv sync


Write-Host ""
Write-Host "==> ACE-Step 部署检查完成"
Write-Host "1. 启动 API: .\scripts\start-ace-step.ps1"
Write-Host "2. 健康检查: GET http://127.0.0.1:8001/health"
Write-Host "3. 工作室制作页 BGM 模型选「ACE-Step 本地」"
Write-Host "注意：与 ComfyUI / Ollama 同卡互斥，生成 BGM 前请切到 idle / 卸显存"
