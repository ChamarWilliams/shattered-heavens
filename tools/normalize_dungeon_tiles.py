from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
THEMES = ("sectless-temple", "nightfold-crypt", "foxfire-shrine")
CELL = 256


for theme in THEMES:
    source_path = ROOT / "public" / "assets" / "dungeons" / theme / "source-kit-v1.png"
    source = Image.open(source_path).convert("RGBA")
    output = Image.new("RGBA", (CELL * 4, CELL * 4), (0, 0, 0, 0))
    for row in range(4):
        for column in range(4):
            box = (
                round(column * source.width / 4),
                round(row * source.height / 4),
                round((column + 1) * source.width / 4),
                round((row + 1) * source.height / 4),
            )
            source_cell = source.crop(box)
            bounds = source_cell.getchannel("A").getbbox()
            normalized = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            if bounds:
                subject = source_cell.crop(bounds)
                scale = min((CELL - 8) / subject.width, (CELL - 8) / subject.height)
                subject = subject.resize((round(subject.width * scale), round(subject.height * scale)), Image.Resampling.LANCZOS)
                normalized.alpha_composite(subject, ((CELL - subject.width) // 2, CELL - subject.height - 4))
            output.alpha_composite(normalized, (column * CELL, row * CELL))
    destination = source_path.with_name("tiles-v1.png")
    output.save(destination, optimize=True)
    print(f"{theme}: {source.size} -> {destination.name} {output.size}")
