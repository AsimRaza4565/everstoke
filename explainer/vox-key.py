# Border flood-fill background removal for the Vox collage cutouts.
# Removes only near-white pixels CONNECTED to the image border (keeps interior whites),
# crops the pollinations.ai watermark strip at the bottom, feathers the edge 1px.
# Usage: python vox-key.py in.png out.png
import sys
from collections import deque

from PIL import Image, ImageFilter
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("L").convert("RGB")  # lock the palette to B&W
w, h = im.size
im = im.crop((0, 0, w, h - 28))  # watermark strip
a = np.array(im).astype(int)
H, W = a.shape[:2]

near_white = a.min(axis=2) > 210

bg = np.zeros((H, W), bool)
dq = deque()
for x in range(W):
    for y in (0, H - 1):
        if near_white[y, x] and not bg[y, x]:
            bg[y, x] = True
            dq.append((y, x))
for y in range(H):
    for x in (0, W - 1):
        if near_white[y, x] and not bg[y, x]:
            bg[y, x] = True
            dq.append((y, x))
while dq:
    y, x = dq.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < H and 0 <= nx < W and near_white[ny, nx] and not bg[ny, nx]:
            bg[ny, nx] = True
            dq.append((ny, nx))

alpha = np.where(bg, 0, 255).astype(np.uint8)
alpha_im = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(1.1))
out = np.dstack([np.array(im), np.array(alpha_im)])
Image.fromarray(out, "RGBA").save(dst)
print(f"[key] {dst}  bg={bg.mean() * 100:.0f}% removed")
