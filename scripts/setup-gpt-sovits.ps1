# GPT-SoVITS 一键部署（Windows）
# 用法：在项目根目录 PowerShell 执行
#   .\scripts\setup-gpt-sovits.ps1
# 可选环境变量：
#   $env:GPT_SOVITS_DIR = "C:\tools\GPT-SoVITS"

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$TargetDir = if ($env:GPT_SOVITS_DIR) { $env:GPT_SOVITS_DIR } else { Join-Path (Split-Path -Parent $ProjectRoot) "GPT-SoVITS" }

Write-Host "==> 项目目录: $ProjectRoot"
Write-Host "==> GPT-SoVITS 安装目录: $TargetDir"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "未找到 git，请先安装 Git"
}

if (-not (Test-Path $TargetDir)) {
  Write-Host "==> 克隆 GPT-SoVITS ..."
  git clone --depth 1 https://github.com/RVC-Boss/GPT-SoVITS.git $TargetDir
} else {
  Write-Host "==> 目录已存在，跳过克隆: $TargetDir"
}

Set-Location $TargetDir

$venv = Join-Path $TargetDir ".venv"
if (-not (Test-Path $venv)) {
  Write-Host "==> 创建 Python 虚拟环境 ..."
  python -m venv $venv
}

$python = Join-Path $venv "Scripts\python.exe"
$pip = Join-Path $venv "Scripts\pip.exe"

$fastLangCache = Join-Path $TargetDir "GPT_SoVITS\pretrained_models\fast_langdetect"
New-Item -ItemType Directory -Force -Path $fastLangCache | Out-Null
Write-Host "==> 已准备 fast_langdetect 缓存目录: $fastLangCache"

Write-Host "==> 安装依赖（首次较慢）..."
& $pip install --upgrade pip
if (Test-Path "requirements.txt") {
  & $pip install -r requirements.txt
} else {
  & $pip install torch torchaudio fastapi uvicorn soundfile numpy pydantic starlette
}

Write-Host ""
Write-Host "==> 部署完成"
Write-Host "1. 按 GPT-SoVITS 官方文档下载预训练模型到 $TargetDir\GPT_SoVITS\pretrained_models"
Write-Host "2. 将参考音频放入: $ProjectRoot\data\gptsovits-refs"
Write-Host "3. 编辑音色库: $ProjectRoot\data\gptsovits\voices.json （可参考 configs\gpt-sovits-voices.example.json）"
Write-Host "4. 启动 API: .\scripts\start-gpt-sovits.ps1"
Write-Host "5. 火宝工作台 → 配音 → 引擎选「GPT-SoVITS」"
