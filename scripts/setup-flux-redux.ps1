# FLUX Redux + SigLIP 参考图模型（ComfyUI 内置 StyleModelApply，无需 custom node）
# 用法：在项目根目录 PowerShell 执行
#   .\scripts\setup-flux-redux.ps1
# 可选环境变量：
#   $env:COMFYUI_MODELS_BASE = "C:\my\comfyui\models"

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ModelsBase = if ($env:COMFYUI_MODELS_BASE) { $env:COMFYUI_MODELS_BASE } else { "C:\my\comfyui\models" }

$StyleDir = Join-Path $ModelsBase "style_models"
$ClipDir = Join-Path $ModelsBase "clip_vision"
New-Item -ItemType Directory -Force -Path $StyleDir, $ClipDir | Out-Null

$ReduxUrl = "https://huggingface.co/Comfy-Org/flux1-redux-dev/resolve/main/flux1-redux-dev.safetensors"
$SigClipUrl = "https://huggingface.co/Comfy-Org/sigclip_vision_384/resolve/main/sigclip_vision_patch14_384.safetensors"
$ReduxDest = Join-Path $StyleDir "flux1-redux-dev.safetensors"
$SigClipDest = Join-Path $ClipDir "sigclip_vision_patch14_384.safetensors"

function Download-IfMissing($Url, $Dest) {
  if (Test-Path $Dest) {
    Write-Host "==> 已存在，跳过: $Dest"
    return
  }
  Write-Host "==> 下载: $Url"
  Write-Host "    -> $Dest"
  Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
}

Write-Host "==> 项目目录: $ProjectRoot"
Write-Host "==> ComfyUI 模型根: $ModelsBase"
Download-IfMissing $ReduxUrl $ReduxDest
Download-IfMissing $SigClipUrl $SigClipDest
Write-Host ""
Write-Host "Done. Restart ComfyUI, then storyboard images with flux_dev_fp8 will use Redux when character refs exist."
