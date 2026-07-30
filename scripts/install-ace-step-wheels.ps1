# 用迅雷下好的 wheel 安装 ACE-Step 依赖
# 1) 把 torch/torchvision/torchaudio 下到 C:\迅雷下载\ace-step-wheels（或 C:\my\ace-step\wheels）
# 2) 运行: .\scripts\install-ace-step-wheels.ps1

$ErrorActionPreference = "Stop"
$AceRoot = if ($env:ACE_STEP_ROOT) { $env:ACE_STEP_ROOT } else { "C:\my\ace-step\ACE-Step-1.5" }
$WheelDir = if ($env:ACE_STEP_WHEEL_DIR) { $env:ACE_STEP_WHEEL_DIR } else { "C:\迅雷下载\ace-step-wheels" }
$AsciiWheels = "C:\my\ace-step\wheels"
$Uv = if ($env:UV_EXE) { $env:UV_EXE } elseif (Test-Path "C:\project\hermes\bin\uv.exe") { "C:\project\hermes\bin\uv.exe" } else { "uv" }
$Flash = "C:\my\ace-step\flash_attn-2.8.2+cu128torch2.7.1cxx11abiFALSEfullbackward-cp311-cp311-win_amd64.whl"

Write-Host "==> ACE-Step: $AceRoot"
Write-Host "==> Wheel 目录: $WheelDir"

if (-not (Test-Path (Join-Path $AceRoot "pyproject.toml"))) {
  throw "未找到 ACE-Step：$AceRoot"
}

# 确保 ASCII 路径有拷贝（中文路径 find-links 偶发不好使）
New-Item -ItemType Directory -Force -Path $AsciiWheels | Out-Null
$srcDir = if ((Test-Path $WheelDir) -and @(Get-ChildItem $WheelDir -Filter "torch-*.whl" -EA SilentlyContinue).Count -gt 0) {
  $WheelDir
} elseif (@(Get-ChildItem $AsciiWheels -Filter "torch-*.whl" -EA SilentlyContinue).Count -gt 0) {
  $AsciiWheels
} else {
  throw "缺少 torch wheel。请下载到 C:\迅雷下载\ace-step-wheels 或设置 ACE_STEP_WHEEL_DIR"
}
if ((Resolve-Path $srcDir).Path -ne (Resolve-Path $AsciiWheels).Path) {
  Get-ChildItem $srcDir -Filter "*.whl" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $AsciiWheels $_.Name) -Force
  }
}

$torch = Get-ChildItem $AsciiWheels -Filter "torch-2.7.1*cp311*win*.whl" | Select-Object -First 1
$vision = Get-ChildItem $AsciiWheels -Filter "torchvision-0.22.1*cp311*win*.whl" | Select-Object -First 1
$audio = Get-ChildItem $AsciiWheels -Filter "torchaudio-2.7.1*cp311*win*.whl" | Select-Object -First 1
if (-not $torch -or -not $vision -or -not $audio) {
  throw "缺少 torch/torchvision/torchaudio wheel，请先用迅雷下载到 $WheelDir"
}
Write-Host "OK $($torch.Name) ($([math]::Round($torch.Length/1MB,1)) MB)"
Write-Host "OK $($vision.Name) ($([math]::Round($vision.Length/1MB,1)) MB)"
Write-Host "OK $($audio.Name) ($([math]::Round($audio.Length/1MB,1)) MB)"

Set-Location $AceRoot
if (-not (Test-Path ".venv\Scripts\python.exe")) { & $Uv venv }
$py = (Resolve-Path ".venv\Scripts\python.exe").Path

Write-Host "==> 从本地 wheel 安装 torch 三件套（小依赖走网络）..."
& $Uv pip install --python $py $torch.FullName $vision.FullName $audio.FullName
& $py -c "import torch; print('torch', torch.__version__, 'cuda', torch.cuda.is_available())"

Write-Host "==> uv sync（跳过 torch 重下）..."
& $Uv sync `
  --find-links $AsciiWheels `
  --find-links "C:\my\ace-step" `
  --no-install-package torch `
  --no-install-package torchvision `
  --no-install-package torchaudio `
  --inexact

& $py -c "import torch,fastapi; print('OK torch', torch.__version__, 'cuda', torch.cuda.is_available())"
Write-Host "==> 完成。启动: .\scripts\start-ace-step.ps1"
