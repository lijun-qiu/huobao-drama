@echo off
chcp 65001 >nul
cd /d "%~dp0"
python prepare-shot-folder.py
if errorlevel 1 pause
