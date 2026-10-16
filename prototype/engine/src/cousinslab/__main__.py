import argparse
from pathlib import Path

from .server import serve
from .templates import ENGINE_DIR


def main() -> None:
    parser = argparse.ArgumentParser(prog="cousinslab", description="Cousins Lab acquisition engine prototype")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data", type=Path, default=ENGINE_DIR / "data", help="Sessions and template revisions")
    args = parser.parse_args()
    serve(args.data.resolve(), args.port)


if __name__ == "__main__":
    main()
