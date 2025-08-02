from PIL import Image
import os

# 1) Configuration
INPUT_FILE  = "suika-game/public/spritesheet.png"   # your sheet, already tightly cropped
OUTPUT_DIR  = "output_sprites"
COLS, ROWS  = 4, 3                 # grid dimensions
CELL_W, CELL_H = 256, 256          # cell size in pixels

# 2) Prepare output folder
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 3) Load the sheet as RGBA
sheet = Image.open(INPUT_FILE).convert("RGBA")

# 4) Loop over each grid cell
counter = 0
for row in range(ROWS):
    for col in range(COLS):
        # compute cell bounds
        left   = col * CELL_W
        upper  = row * CELL_H
        right  = left + CELL_W
        lower  = upper + CELL_H

        # crop the cell
        cell = sheet.crop((left, upper, right, lower))
        
        # find non-transparent bbox inside that cell
        bbox = cell.getbbox()
        if not bbox:
            # completely empty cell → skip
            continue
        
        # crop to that bbox for a tight sprite
        sprite = cell.crop(bbox)
        
        # save out
        fname = f"sprite_{counter:02d}.png"
        sprite.save(os.path.join(OUTPUT_DIR, fname))
        counter += 1

print(f"✅ Extracted {counter} tight sprites into ./{OUTPUT_DIR}/")
