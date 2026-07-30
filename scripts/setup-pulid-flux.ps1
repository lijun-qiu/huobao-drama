# FLUX PuLID 锁脸（ComfyUI_PuLID_Flux_ll 自定义节点 + 模型权重）
# 用法：在项目根目录 PowerShell 执行
#   .\scripts\setup-pulid-flux.ps1
# 前置：已安装 flux1-dev-fp8.safetensors（与 setup-flux-redux 共用）
# 可选环境变量：
#   $env:COMFYUI_MODELS_BASE = "C:\my\comfyui\models"
#   $env:COMFYUI_DIR = "C:\my\comfyui\ComfyUI"

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ModelsBase = if ($env:COMFYUI_MODELS_BASE) { $env:COMFYUI_MODELS_BASE } else { "C:\my\comfyui\models" }
$ComfyDir = if ($env:COMFYUI_DIR) { $env:COMFYUI_DIR } else { "C:\my\comfyui\ComfyUI" }

$PulidDir = Join-Path $ModelsBase "pulid"
$ClipDir = Join-Path $ModelsBase "clip"
$FaceXDir = Join-Path $ModelsBase "facexlib"
$InsightDir = Join-Path $ModelsBase "insightface\models\antelopev2"
New-Item -ItemType Directory -Force -Path $PulidDir, $ClipDir, $FaceXDir, $InsightDir | Out-Null

# ── 迅雷可粘贴的直链（HuggingFace resolve）────────────────────────────
$Downloads = @{
  "pulid_flux_v0.9.1.safetensors" = @{
    Url = "https://huggingface.co/guozinan/PuLID/resolve/main/pulid_flux_v0.9.1.safetensors"
    Dest = Join-Path $PulidDir "pulid_flux_v0.9.1.safetensors"
    Size = "~1.1GB"
  }
  "EVA02_CLIP_L_336_psz14_s6B.pt" = @{
    Url = "https://huggingface.co/QuanSun/EVA-CLIP/resolve/main/EVA02_CLIP_L_336_psz14_s6B.pt"
    Dest = Join-Path $ClipDir "EVA02_CLIP_L_336_psz14_s6B.pt"
    Size = "~4.2GB"
  }
  "detection_Resnet50_Final.pth" = @{
    Url = "https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth"
    Dest = Join-Path $FaceXDir "detection_Resnet50_Final.pth"
    Size = "~104MB"
  }
  "parsing_bisenet.pth" = @{
    Url = "https://github.com/xinntao/facexlib/releases/download/v0.2.0/parsing_bisenet.pth"
    Dest = Join-Path $FaceXDir "parsing_bisenet.pth"
    Size = "~50MB"
  }
  "parsing_parsenet.pth" = @{
    Url = "https://github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth"
    Dest = Join-Path $FaceXDir "parsing_parsenet.pth"
    Size = "~85MB"
  }
}

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

Write-Host "========================================"
Write-Host " FLUX PuLID 方案 A — 模型下载清单"
Write-Host " 可用迅雷「新建任务」粘贴下方 URL"
Write-Host "========================================"
Write-Host ""
foreach ($name in $Downloads.Keys) {
  $d = $Downloads[$name]
  Write-Host "[$($d.Size)] $name"
  Write-Host "  URL:  $($d.Url)"
  Write-Host "  保存: $($d.Dest)"
  Write-Host ""
}
Write-Host "[InsightFace antelopev2] 若已运行 setup-instantid.ps1 可跳过"
foreach ($name in $InsightFiles.Keys) {
  Write-Host "  URL:  $($InsightFiles[$name])"
  Write-Host "  保存: $(Join-Path $InsightDir $name)"
}
Write-Host ""
Write-Host "========================================"
Write-Host ""

Write-Host "==> 项目目录: $ProjectRoot"
Write-Host "==> ComfyUI 模型根: $ModelsBase"
foreach ($name in $Downloads.Keys) {
  $d = $Downloads[$name]
  Download-IfMissing $d.Url $d.Dest
}
foreach ($name in $InsightFiles.Keys) {
  Download-IfMissing $InsightFiles[$name] (Join-Path $InsightDir $name)
}

# ComfyUI 节点也读 ComfyUI/models/insightface
$ComfyInsightDir = Join-Path $ComfyDir "models\insightface"
if (-not (Test-Path (Join-Path $ComfyInsightDir "models\antelopev2\glintr100.onnx"))) {
  if (Test-Path (Join-Path $InsightDir "glintr100.onnx")) {
    Write-Host "==> 同步 InsightFace 到 ComfyUI: $ComfyInsightDir"
    New-Item -ItemType Directory -Force -Path $ComfyInsightDir | Out-Null
    robocopy (Join-Path $ModelsBase "insightface") $ComfyInsightDir /E /NFL /NDL /NJH /NJS | Out-Null
  }
}

# 自定义节点
$NodeDir = Join-Path $ComfyDir "custom_nodes\ComfyUI_PuLID_Flux_ll"
$LegacyNode = Join-Path $ComfyDir "custom_nodes\ComfyUI-PuLID-Flux"
if (Test-Path $LegacyNode) {
  Write-Host "==> 警告: 检测到旧版 ComfyUI-PuLID-Flux，请禁用/卸载后再装 ComfyUI_PuLID_Flux_ll"
}
if (-not (Test-Path $NodeDir)) {
  Write-Host "==> 安装自定义节点 ComfyUI_PuLID_Flux_ll ..."
  if (Get-Command git -ErrorAction SilentlyContinue) {
    Push-Location (Join-Path $ComfyDir "custom_nodes")
    git clone https://github.com/lldacing/ComfyUI_PuLID_Flux_ll.git
    Pop-Location
    $Py = Join-Path $ComfyDir "python_embeded\python.exe"
    if (-not (Test-Path $Py)) { $Py = "python" }
    Push-Location $NodeDir
    & $Py -m pip install -r requirements.txt
    & $Py -m pip install facenet-pytorch --no-deps
    Pop-Location
    Write-Host "==> 节点依赖已安装（若 insightface 编译失败，见 README 用预编译 wheel）"
  } else {
    Write-Host "==> 未找到 git，请手动克隆:"
    Write-Host "    cd $ComfyDir\custom_nodes"
    Write-Host "    git clone https://github.com/lldacing/ComfyUI_PuLID_Flux_ll.git"
    Write-Host "    pip install -r ComfyUI_PuLID_Flux_ll\requirements.txt"
    Write-Host "    pip install facenet-pytorch --no-deps"
  }
} else {
  Write-Host "==> 自定义节点已存在: $NodeDir"
}

Write-Host ""
Write-Host "Done."
Write-Host "1) 重启 ComfyUI（ComfyUI 版本需 >= 0.3.7）"
Write-Host "2) extra_model_paths.yaml 建议包含:"
Write-Host "     pulid: models/pulid/"
Write-Host "     clip: models/clip/"
Write-Host "     facexlib: models/facexlib/"
Write-Host "3) 分镜选 flux_dev_fp8，有定妆图时自动走 PuLID 锁脸（LOCAL_FLUX_STORYBOARD_USE_PULID 默认开）"
Write-Host "4) 分镜 PuLID 默认: STORYBOARD_WEIGHT=0.55 STORYBOARD_END_AT=0.32（仅前1/3步锁脸，后段留给场景）"
Write-Host "5) 调参: LOCAL_FLUX_PULID_STORYBOARD_WEIGHT=0.45~0.6  LOCAL_FLUX_PULID_STORYBOARD_END_AT=0.25~0.4"
Write-Host "6) 分镜默认 faceOnly 裁脸: LOCAL_FLUX_PULID_STORYBOARD_FACE_ONLY=false 可关闭"
