# SDXL InstantID 权重（cubiq/ComfyUI_InstantID 自定义节点 + InsightFace）
# 用法：在项目根目录 PowerShell 执行
#   .\scripts\setup-instantid.ps1
# 前置：ComfyUI 已安装 custom node
#   git clone https://github.com/cubiq/ComfyUI_InstantID ComfyUI/custom_nodes/ComfyUI_InstantID
#   pip install insightface onnxruntime
# 可选环境变量：
#   $env:COMFYUI_MODELS_BASE = "C:\my\comfyui\models"

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ModelsBase = if ($env:COMFYUI_MODELS_BASE) { $env:COMFYUI_MODELS_BASE } else { "C:\my\comfyui\models" }

$InstantIdDir = Join-Path $ModelsBase "instantid"
$ControlNetDir = Join-Path $ModelsBase "controlnet\instantid"
$InsightDir = Join-Path $ModelsBase "insightface\models\antelopev2"
New-Item -ItemType Directory -Force -Path $InstantIdDir, $ControlNetDir, $InsightDir | Out-Null

$IpAdapterUrl = "https://huggingface.co/InstantX/InstantID/resolve/main/ip-adapter.bin"
$ControlNetUrl = "https://huggingface.co/InstantX/InstantID/resolve/main/ControlNetModel/diffusion_pytorch_model.safetensors"
$IpAdapterDest = Join-Path $InstantIdDir "ip-adapter.bin"
$ControlNetDest = Join-Path $ControlNetDir "diffusion_pytorch_model.safetensors"

# InsightFace antelopev2（InstantIDFaceAnalysis 默认模型）
$InsightFiles = @{
  "1k3d68.onnx" = "https://huggingface.co/MonsterMMORPG/tools/resolve/main/1k3d68.onnx"
  "2d106det.onnx" = "https://huggingface.co/MonsterMMORPG/tools/resolve/main/2d106det.onnx"
  "genderage.onnx" = "https://huggingface.co/MonsterMMORPG/tools/resolve/main/genderage.onnx"
  "glintr100.onnx" = "https://huggingface.co/MonsterMMORPG/tools/resolve/main/glintr100.onnx"
  "scrfd_10g_bnkps.onnx" = "https://huggingface.co/MonsterMMORPG/tools/resolve/main/scrfd_10g_bnkps.onnx"
}

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
Download-IfMissing $IpAdapterUrl $IpAdapterDest
Download-IfMissing $ControlNetUrl $ControlNetDest
foreach ($name in $InsightFiles.Keys) {
  Download-IfMissing $InsightFiles[$name] (Join-Path $InsightDir $name)
}

# ComfyUI_InstantID 节点硬编码读取 ComfyUI/models/insightface，须同步一份
$ComfyUiModels = if ($env:COMFYUI_DIR) { Join-Path $env:COMFYUI_DIR "models" } else { "C:\my\comfyui\ComfyUI\models" }
$ComfyInsightDir = Join-Path $ComfyUiModels "insightface"
if (-not (Test-Path (Join-Path $ComfyInsightDir "models\antelopev2\glintr100.onnx"))) {
  Write-Host "==> 同步 InsightFace 到 ComfyUI 默认目录: $ComfyInsightDir"
  New-Item -ItemType Directory -Force -Path $ComfyInsightDir | Out-Null
  robocopy (Join-Path $ModelsBase "insightface") $ComfyInsightDir /E /NFL /NDL /NJH /NJS | Out-Null
}
Write-Host ""
Write-Host "Done. Restart ComfyUI with ComfyUI_InstantID installed."
Write-Host "Ensure ComfyUI extra_model_paths.yaml maps controlnet + instantid to COMFYUI_MODELS_BASE:"
Write-Host "  controlnet: models/controlnet/"
Write-Host "  instantid: models/instantid/"
Write-Host "InsightFace antelopev2 must also exist under ComfyUI/models/insightface (script syncs automatically)."
Write-Host "Storyboard images with sdxl_instantid will lock face from character portrait refs."
