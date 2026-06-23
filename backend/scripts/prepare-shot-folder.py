#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
配图文件夹重命名工具

按文件修改时间从早到晚排序，重命名为 1.png、2.png … 101.png …
修改时间相同时：优先按文件名中的时间戳，再按文件名中的数字，最后按文件名。

用法:
  双击「准备配图文件夹.bat」或在配图页说明中运行本脚本
  python prepare-shot-folder.py              # 弹出文件夹选择框
  python prepare-shot-folder.py --dir D:/img  # 指定目录
  python prepare-shot-folder.py --dir D:/img --dry-run
"""

from __future__ import annotations

import argparse
import re
import sys
import uuid
from pathlib import Path

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
SKIP_PREFIX = ".__renaming_"
SHOT_NAME_RE = re.compile(r"^#\d+#\d+$", re.I)


def is_image(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in IMAGE_EXT


def stem_without_ext(path: Path) -> str:
    return path.stem


def extract_all_numbers(text: str) -> list[int]:
    return [int(x) for x in re.findall(r"\d+", text)]


def extract_timestamp_value(text: str) -> int | None:
    """从文件名中提取最像时间戳的数字（毫秒或秒）。"""
    best: int | None = None
    for raw in re.findall(r"\d+", text):
        if len(raw) >= 13:
            val = int(raw[:13])
            best = val if best is None else min(best, val)
            continue
        if len(raw) == 10:
            val = int(raw) * 1000
            if val > 1_000_000_000_000:
                continue
            best = val if best is None else min(best, val)
            continue
        if len(raw) == 8 and raw.startswith(("19", "20")):
            val = int(raw) * 100_000
            best = val if best is None else min(best, val)
    return best


def tiebreak_key(path: Path) -> tuple:
    stem = stem_without_ext(path)
    ts = extract_timestamp_value(stem)
    if ts is not None:
        return (0, ts, stem.lower())
    nums = extract_all_numbers(stem)
    if nums:
        return (1, min(nums), stem.lower())
    return (2, stem.lower())


def sort_key(path: Path) -> tuple:
    stat = path.stat()
    mtime_ns = getattr(stat, "st_mtime_ns", int(stat.st_mtime * 1_000_000_000))
    return (mtime_ns, *tiebreak_key(path))


def list_images(folder: Path) -> list[Path]:
    files = [
        p for p in folder.iterdir()
        if is_image(p) and not p.name.startswith(SKIP_PREFIX)
    ]
    return sorted(files, key=sort_key)


def preview_lines(files: list[Path], limit: int = 12) -> str:
    lines: list[str] = []
    total = len(files)
    show = min(total, limit)
    for i, src in enumerate(files[:show], start=1):
        mtime = src.stat().st_mtime
        lines.append(f"  {i:>3}. {src.name}  (mtime={mtime:.0f})")
    if total > show:
        lines.append(f"  … 共 {total} 张，省略 {total - show} 张 …")
        tail = files[-3:]
        start = total - len(tail) + 1
        for j, src in enumerate(tail, start=start):
            lines.append(f"  {j:>3}. {src.name}")
    return "\n".join(lines)


def rename_images(folder: Path, dry_run: bool = False) -> list[tuple[str, str]]:
    files = list_images(folder)
    if not files:
        raise SystemExit(f"目录内没有可重命名的图片：{folder}")

    plan: list[tuple[str, str]] = []
    for i, src in enumerate(files, start=1):
        target_name = f"{i}{src.suffix.lower()}"
        plan.append((src.name, target_name))

    if dry_run:
        return plan

    temp_pairs: list[tuple[Path, Path]] = []
    for src, (_, target_name) in zip(files, plan):
        tmp = folder / f"{SKIP_PREFIX}{uuid.uuid4().hex}{src.suffix.lower()}"
        src.rename(tmp)
        temp_pairs.append((tmp, folder / target_name))

    for tmp, final in temp_pairs:
        if final.exists():
            raise SystemExit(f"目标文件已存在，已中止：{final.name}")
        tmp.rename(final)

    return plan


def pick_folder_gui() -> Path | None:
    try:
        import tkinter as tk
        from tkinter import filedialog, messagebox
    except ImportError:
        print("当前环境无 tkinter，请使用 --dir 指定文件夹", file=sys.stderr)
        return None

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    folder = filedialog.askdirectory(title="选择配图文件夹（按修改时间重命名为 1、2、3…）")
    root.destroy()
    if not folder:
        return None
    return Path(folder)


def confirm_gui(folder: Path, files: list[Path]) -> bool:
    try:
        import tkinter as tk
        from tkinter import messagebox
    except ImportError:
        return True

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    text = (
        f"文件夹：{folder}\n"
        f"共 {len(files)} 张图片\n\n"
        f"排序预览（修改时间从早到晚 → 1 起编号）：\n"
        f"{preview_lines(files)}\n\n"
        f"确认重命名为 1{files[0].suffix} … {len(files)}{files[-1].suffix} ？"
    )
    ok = messagebox.askyesno("配图重命名确认", text)
    root.destroy()
    return ok


def done_gui(folder: Path, count: int) -> None:
    try:
        import tkinter as tk
        from tkinter import messagebox
    except ImportError:
        print(f"完成：{folder} 已重命名 {count} 张")
        return

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    messagebox.showinfo(
        "配图重命名完成",
        f"已重命名 {count} 张图片\n\n"
        f"1.png → 第 1 镜\n"
        f"{count}.png → 第 {count} 镜\n\n"
        f"可在火宝短剧「文件夹上传」中直接选择该文件夹。",
    )
    root.destroy()


def main() -> None:
    parser = argparse.ArgumentParser(description="按修改时间将配图重命名为 1、2、3…")
    parser.add_argument("--dir", help="图片目录（不填则弹出选择框）")
    parser.add_argument("--dry-run", action="store_true", help="仅预览，不重命名")
    parser.add_argument("-y", "--yes", action="store_true", help="跳过确认")
    args = parser.parse_args()

    folder: Path | None
    if args.dir:
        folder = Path(args.dir).expanduser().resolve()
    else:
        folder = pick_folder_gui()

    if not folder:
        raise SystemExit("未选择文件夹")

    if not folder.is_dir():
        raise SystemExit(f"不是有效目录：{folder}")

    files = list_images(folder)
    if not files:
        raise SystemExit(f"目录内没有图片：{folder}")

    if not args.yes and not args.dry_run:
        if args.dir:
            print(f"文件夹：{folder}")
            print(f"共 {len(files)} 张\n{preview_lines(files)}\n")
            ans = input("确认重命名？[y/N] ").strip().lower()
            if ans not in ("y", "yes"):
                raise SystemExit("已取消")
        else:
            if not confirm_gui(folder, files):
                raise SystemExit("已取消")

    plan = rename_images(folder, dry_run=args.dry_run)

    if args.dry_run:
        print(f"[dry-run] {folder} 共 {len(plan)} 张：")
        for old, new in plan:
            print(f"  {old} → {new}")
        return

    if args.dir:
        print(f"完成：{folder} 已重命名 {len(plan)} 张（1 … {len(plan)}）")
    else:
        done_gui(folder, len(plan))


if __name__ == "__main__":
    main()
