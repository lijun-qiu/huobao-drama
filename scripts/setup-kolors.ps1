# Kolors 模型路径说明（迅雷下载后移动到此）
$ComfyRoot = "C:\my\comfyui\ComfyUI\models"

Write-Host "Kolors 模型应放置于："
Write-Host "  UNet:  $ComfyRoot\diffusers\Kolors\unet\diffusion_pytorch_model.fp16.safetensors"
Write-Host "  VAE:   $ComfyRoot\vae\kolors_vae_fp16.safetensors"
Write-Host "  LLM:   $ComfyRoot\LLM\checkpoints\chatglm3-8bit.safetensors"
Write-Host ""
Write-Host "ComfyUI 插件: C:\my\comfyui\ComfyUI\custom_nodes\ComfyUI-KwaiKolorsWrapper"
Write-Host "冒烟测试: cd backend; npx tsx scripts/test-kolors-gen.ts"
