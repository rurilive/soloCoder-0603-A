import asyncio
import sys

sys.path.insert(0, ".")

from app.services.static_generator import get_static_generator


async def main():
    generator = get_static_generator()
    print("Generating static pages...")
    result = await generator.generate_pages(full_regeneration=True)
    print(f"Total: {result.total}")
    print(f"Generated: {result.generated}")
    print(f"Skipped: {result.skipped}")
    print(f"Failed: {result.failed}")
    if result.errors:
        print("Errors:")
        for err in result.errors:
            print(f"  - {err}")
    if result.generated_pages:
        print("\nGenerated pages:")
        for page in result.generated_pages[:10]:
            print(f"  - {page}")
        if len(result.generated_pages) > 10:
            print(f"  ... and {len(result.generated_pages) - 10} more")
    print("\nDone!")


if __name__ == "__main__":
    asyncio.run(main())
