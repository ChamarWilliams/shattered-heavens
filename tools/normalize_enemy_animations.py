from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CELL = 192
SOURCES = {
    "sectless-temple": Path(r"C:\Users\Chamar\.codex\generated_images\01a1794f-8895-7883-8ac4-695ca2486778\exec-a1147e71-64c6-4a2f-b727-8d070a766b0d.png"),
    "nightfold-crypt": Path(r"C:\Users\Chamar\.codex\generated_images\01a1794f-8895-7883-8ac4-695ca2486778\exec-7cf78b8a-9871-4c99-a6cb-6d398de2df04.png"),
    "foxfire-shrine": Path(r"C:\Users\Chamar\.codex\generated_images\01a1794f-8895-7883-8ac4-695ca2486778\exec-5fc7051e-f34d-4222-9e7a-bba48d7c4833.png"),
}


def normalize(cell: Image.Image) -> Image.Image:
    output = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    bounds = cell.getchannel("A").getbbox()
    if bounds is None:
        return output
    subject = cell.crop(bounds)
    scale = min((CELL - 10) / subject.width, (CELL - 10) / subject.height)
    subject = subject.resize((max(1, round(subject.width * scale)), max(1, round(subject.height * scale))), Image.Resampling.LANCZOS)
    output.alpha_composite(subject, ((CELL - subject.width) // 2, CELL - subject.height - 5))
    return output


for theme, source_path in SOURCES.items():
    source = Image.open(source_path).convert("RGBA")
    output = Image.new("RGBA", (CELL * 4, CELL * 4), (0, 0, 0, 0))
    for row in range(4):
        for column in range(4):
            box = (
                round(column * source.width / 4), round(row * source.height / 4),
                round((column + 1) * source.width / 4), round((row + 1) * source.height / 4),
            )
            output.alpha_composite(normalize(source.crop(box)), (column * CELL, row * CELL))
    destination = ROOT / "public" / "assets" / "dungeons" / theme / "enemies-animated-v2.png"
    output.save(destination, optimize=True)
    print(f"{theme}: {source.size} -> {destination.name} {output.size}")
