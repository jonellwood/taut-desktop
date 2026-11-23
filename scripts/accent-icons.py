"""Regenerate accent variants from the existing TAUT icon (requires Pillow)."""
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
source=Image.open(root/'public/icon.png').convert('RGBA').resize((256,256),Image.Resampling.LANCZOS)
colors={'amber':(239,187,112),'teal':(99,212,193),'violet':(179,160,255),'blue':(133,184,255),'rose':(245,157,189)}
for name,color in colors.items():
    target=source.copy()
    pixels=[]
    for r,g,b,a in source.getdata():
        # Recolor warm brand strokes, retaining antialiasing, shading and alpha.
        strength=max(0,min(1,(r-b)/127))
        pixels.append(tuple(round(v+(c-o)*strength) for v,c,o in zip((r,g,b),color,colors['amber']))+(a,))
    target.putdata(pixels)
    target.save(root/f'public/icons/{name}.png')
    (root/f'src-tauri/icons/accents/{name}.rgba').write_bytes(target.tobytes())
