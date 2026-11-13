from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "sectless-temple": Path(r"C:\Users\Chamar\.codex\generated_images\01a1794f-8895-7883-8ac4-695ca2486778\exec-23558798-0c5d-44c1-be20-d7baffde2337.png"),
    "nightfold-crypt": Path(r"C:\Users\Chamar\.codex\generated_images\01a1794f-8895-7883-8ac4-695ca2486778\exec-ceb48e08-b9a5-4aaf-a617-940c6eab4d62.png"),
    "foxfire-shrine": Path(r"C:\Users\Chamar\.codex\generated_images\01a1794f-8895-7883-8ac4-695ca2486778\exec-0f7e9d6f-92ec-4731-bb61-a70893ccb199.png"),
}


def alpha_bounds(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").getbbox()


def normalize_cell(cell: Image.Image, size: int = 256) -> Image.Image:
    bounds = alpha_bounds(cell)
    output = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if bounds is None:
        return output
    subject = cell.crop(bounds)
    max_subject = int(size * 0.86)
    scale = min(max_subject / subject.width, max_subject / subject.height)
    resized = subject.resize(
        (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
        Image.Resampling.LANCZOS,
    )
    output.alpha_composite(resized, ((size - resized.width) // 2, size - resized.height - 12))
    return output


for theme, source_path in SOURCES.items():
    source = Image.open(source_path).convert("RGBA")
    sheet = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    for index, (column, row) in enumerate(((0, 0), (1, 0), (0, 1), (1, 1))):
        left = round(column * source.width / 2)
        top = round(row * source.height / 2)
        right = round((column + 1) * source.width / 2)
        bottom = round((row + 1) * source.height / 2)
        normalized = normalize_cell(source.crop((left, top, right, bottom)))
        sheet.alpha_composite(normalized, ((index % 2) * 256, (index // 2) * 256))
    destination = ROOT / "public" / "assets" / "dungeons" / theme / "enemies-v1.png"
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, optimize=True)
    print(f"{theme}: {source.size} -> {destination} {sheet.size}")
