# 启动 GPT-SoVITS API v2（默认 http://127.0.0.1:9880）
# 用法：.\scripts\start-gpt-sovits.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DefaultDir = if ($env:GPTSOVITS_ROOT) { $env:GPTSOVITS_ROOT } elseif (Test-Path "C:\my\gpt-sovits\GPT-SoVITS") { "C:\my\gpt-sovits\GPT-SoVITS" } else { Join-Path (Split-Path -Parent $ProjectRoot) "GPT-SoVITS" }
$TargetDir = if ($env:GPT_SOVITS_DIR) { $env:GPT_SOVITS_DIR } else { $DefaultDir }
$Port = if ($env:GPT_SOVITS_PORT) { $env:GPT_SOVITS_PORT } else { "9880" }
$HostAddr = if ($env:GPT_SOVITS_HOST) { $env:GPT_SOVITS_HOST } else { "127.0.0.1" }

if (-not (Test-Path $TargetDir)) {
  Write-Host "未找到 GPT-SoVITS 目录: $TargetDir"
  Write-Host "请先运行: .\scripts\setup-gpt-sovits.ps1"
  exit 1
}

$python = Join-Path $TargetDir ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
  $python = if (Test-Path "C:\my\gpt-sovits\venv\Scripts\python.exe") { "C:\my\gpt-sovits\venv\Scripts\python.exe" } else { "python" }
}

$apiScript = Join-Path $TargetDir "api_v2.py"
if (-not (Test-Path $apiScript)) {
  throw "未找到 api_v2.py: $apiScript"
}

$refRoot = Join-Path $ProjectRoot "data\gptsovits-refs"
New-Item -ItemType Directory -Force -Path $refRoot | Out-Null
$fastLangCache = Join-Path $TargetDir "GPT_SoVITS\pretrained_models\fast_langdetect"
New-Item -ItemType Directory -Force -Path $fastLangCache | Out-Null

Write-Host "==> GPT-SoVITS API: http://${HostAddr}:${Port}"
Write-Host "==> 参考音频目录: $refRoot"
Write-Host "==> 按 Ctrl+C 停止"

Set-Location $TargetDir
$env:GPT_SOVITS_REF_ROOT = $refRoot

& $python $apiScript -a $HostAddr -p $Port
