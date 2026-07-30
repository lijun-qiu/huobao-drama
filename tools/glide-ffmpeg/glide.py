"""
glide.py — smooth, sub-pixel camera moves (pan / zoom) over still images.
================================================================================
Vendored from https://github.com/Loomos-hub/glide-ffmpeg (MIT).
A small, correct replacement for FFmpeg's `zoompan` filter for animating a still
image with a moving camera — the pan/zoom effect often called "Ken Burns".

Requirements: torch (CUDA recommended), pillow, numpy, ffmpeg on PATH
(or set GLIDE_FFMPEG to the ffmpeg binary).
"""
from __future__ import annotations
import argparse
import glob
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

__version__ = "1.0.0"

def resolve_ffmpeg() -> str:
    """Find the ffmpeg binary: PATH -> $GLIDE_FFMPEG -> Windows WinGet fallback."""
    p = shutil.which("ffmpeg")
    if p:
        return p
    env = os.environ.get("GLIDE_FFMPEG")
    if env and Path(env).exists():
        return env
    hits = sorted(glob.glob(str(
        Path.home() / "AppData/Local/Microsoft/WinGet/Packages"
        / "Gyan.FFmpeg*" / "ffmpeg-*-full_build" / "bin" / "ffmpeg.exe")))
    if hits:
        return hits[-1]
    raise FileNotFoundError(
        "ffmpeg not found. Install it and add it to PATH, or set the "
        "GLIDE_FFMPEG environment variable to the ffmpeg binary path.")


DEFAULT_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def ease_linear(t):
    return t


def ease_in_out_cubic(t):
    return np.where(t < 0.5, 4 * t ** 3, 1 - (-2 * t + 2) ** 3 / 2)


def ease_in_out_sine(t):
    return -(np.cos(np.pi * t) - 1) / 2


EASINGS = {
    "linear": ease_linear,
    "cubic": ease_in_out_cubic,
    "sine": ease_in_out_sine,
}


@dataclass
class GlideMove:
    start_zoom: float
    end_zoom: float
    start_center: tuple[float, float]
    end_center: tuple[float, float]
    duration_s: float
    fps: int = 30
    easing: str = "cubic"

    @property
    def n_frames(self) -> int:
        return max(1, round(self.duration_s * self.fps))


def build_grids(move: GlideMove, out_h: int, out_w: int,
                device: str = DEFAULT_DEVICE,
                i0: int = 0, count: int | None = None) -> torch.Tensor:
    n = move.n_frames
    t_full = np.linspace(0.0, 1.0, n)
    t = t_full if count is None else t_full[i0:i0 + count]
    m = len(t)
    e = EASINGS[move.easing](t)

    zoom = move.start_zoom + (move.end_zoom - move.start_zoom) * e
    cx = move.start_center[0] + (move.end_center[0] - move.start_center[0]) * e
    cy = move.start_center[1] + (move.end_center[1] - move.start_center[1]) * e

    half = 0.5 / zoom
    cx = np.clip(cx, half, 1.0 - half)
    cy = np.clip(cy, half, 1.0 - half)

    ys, xs = torch.meshgrid(
        torch.linspace(-1, 1, out_h, device=device),
        torch.linspace(-1, 1, out_w, device=device),
        indexing="ij",
    )
    base = torch.stack((xs, ys), dim=-1)
    base = base.unsqueeze(0).expand(m, -1, -1, -1)

    cx_g = torch.tensor(cx * 2 - 1, device=device, dtype=torch.float32)
    cy_g = torch.tensor(cy * 2 - 1, device=device, dtype=torch.float32)
    half_g = torch.tensor(half * 2, device=device, dtype=torch.float32)

    grid = torch.empty_like(base)
    grid[..., 0] = cx_g[:, None, None] + base[..., 0] * half_g[:, None, None]
    grid[..., 1] = cy_g[:, None, None] + base[..., 1] * half_g[:, None, None]
    return grid


def render(image_path: str,
           move: GlideMove,
           out_path: str,
           out_size: tuple[int, int] = (1920, 1080),
           supersample: float = 1.5,
           batch: int = 16,
           crf: int = 18,
           preset: str = "slow",
           device: str = DEFAULT_DEVICE):
    ffmpeg = resolve_ffmpeg()
    out_w, out_h = out_size
    ss_w, ss_h = round(out_w * supersample), round(out_h * supersample)

    img = Image.open(image_path).convert("RGB")
    src = torch.from_numpy(np.array(img)).permute(2, 0, 1).float().div_(255.0)
    src = src.unsqueeze(0).to(device)

    n = move.n_frames

    proc = subprocess.Popen(
        [ffmpeg, "-y",
         "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{out_w}x{out_h}", "-r", str(move.fps),
         "-i", "pipe:0",
         "-c:v", "libx264", "-preset", preset, "-crf", str(crf),
         "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         out_path],
        stdin=subprocess.PIPE,
    )
    try:
        for i in range(0, n, batch):
            b = min(batch, n - i)
            g = build_grids(move, ss_h, ss_w, device=device, i0=i, count=b)
            src_b = src.expand(b, -1, -1, -1)
            frames = F.grid_sample(src_b, g, mode="bicubic",
                                   padding_mode="border", align_corners=True)
            if supersample != 1.0:
                frames = F.interpolate(frames, size=(out_h, out_w), mode="area")
            out = (frames.clamp_(0, 1) * 255).round().byte()
            out = out.permute(0, 2, 3, 1).contiguous().cpu().numpy()
            proc.stdin.write(out.tobytes())
    finally:
        proc.stdin.close()
        proc.wait()
    return out_path


def preset_move(name: str, duration_s: float, fps: int, easing: str,
                amount: float = 0.20) -> GlideMove:
    z = 1.0 + amount
    pan_zoom = 1.0 + amount * 0.6
    half = 0.5 / pan_zoom
    lo, hi = half, 1.0 - half
    c = (0.5, 0.5)
    presets = {
        "push-in": GlideMove(1.0, z, c, c, duration_s, fps, easing),
        "push-out": GlideMove(z, 1.0, c, c, duration_s, fps, easing),
        "pan-right": GlideMove(pan_zoom, pan_zoom, (lo, 0.5), (hi, 0.5), duration_s, fps, easing),
        "pan-left": GlideMove(pan_zoom, pan_zoom, (hi, 0.5), (lo, 0.5), duration_s, fps, easing),
        "pan-up": GlideMove(pan_zoom, pan_zoom, (0.5, hi), (0.5, lo), duration_s, fps, easing),
        "pan-down": GlideMove(pan_zoom, pan_zoom, (0.5, lo), (0.5, hi), duration_s, fps, easing),
    }
    if name not in presets:
        raise ValueError(f"unknown preset '{name}'. Options: {', '.join(presets)}")
    return presets[name]


def _cli(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Glide — smooth sub-pixel pan/zoom (Ken Burns) over a still image.")
    ap.add_argument("image", help="input still image")
    ap.add_argument("out", help="output .mp4")
    ap.add_argument("--preset", choices=["push-in", "push-out", "pan-left", "pan-right",
                                         "pan-up", "pan-down"],
                    help="convenient in-bounds move; overridden by explicit --zoom/--center-*")
    ap.add_argument("--amount", type=float, default=0.20, help="preset strength (default 0.20)")
    ap.add_argument("--zoom", type=float, nargs=2, metavar=("START", "END"),
                    help="explicit start/end zoom, e.g. --zoom 1.0 1.35")
    ap.add_argument("--center-start", type=float, nargs=2, metavar=("X", "Y"), default=(0.5, 0.5))
    ap.add_argument("--center-end", type=float, nargs=2, metavar=("X", "Y"), default=(0.5, 0.5))
    ap.add_argument("--duration", type=float, default=6.0)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--easing", choices=list(EASINGS), default="sine")
    ap.add_argument("--size", type=int, nargs=2, metavar=("W", "H"), default=(1920, 1080))
    ap.add_argument("--supersample", type=float, default=1.5)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--encode-preset", default="slow")
    ap.add_argument("--device", default=DEFAULT_DEVICE)
    a = ap.parse_args(argv)

    if a.zoom or not a.preset:
        z0, z1 = (a.zoom if a.zoom else (1.0, 1.0 + a.amount))
        move = GlideMove(z0, z1, tuple(a.center_start), tuple(a.center_end),
                         a.duration, a.fps, a.easing)
    else:
        move = preset_move(a.preset, a.duration, a.fps, a.easing, a.amount)

    print(f"[glide] device={a.device} frames={move.n_frames} -> {a.out}", flush=True)
    render(a.image, move, a.out, out_size=tuple(a.size),
           supersample=a.supersample, batch=a.batch, crf=a.crf,
           preset=a.encode_preset, device=a.device)
    print("[glide] done", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(_cli())