"""Tiny stdio MCP client — spawns pim_server.py as a real subprocess and calls each
tool over the protocol, to feel the out-of-process boundary the notebook's in-memory
transport hid. Also a quick sanity check before wiring Claude Desktop.

Run:
    python client_demo.py
"""
import asyncio
import json
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    params = StdioServerParameters(command=sys.executable, args=["pim_server.py"])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            tools = await session.list_tools()
            print("Discovered tools:", [t.name for t in tools.tools])

            print("\n-- get_category_tree --")
            res = await session.call_tool("get_category_tree", {})
            print(json.loads(res.content[0].text))

            print("\n-- search_products('noise cancelling headphones') --")
            res = await session.call_tool(
                "search_products", {"query": "noise cancelling headphones", "k": 3}
            )
            for c in res.content:
                hit = json.loads(c.text)
                print(f"  - {hit['name']} ({hit['category']}, €{hit['price']:.0f})")

            print("\n-- create_product('SKU-DEMO-001', ...) --")
            res = await session.call_tool(
                "create_product",
                {
                    "sku": "SKU-DEMO-001",
                    "name": "AquaBeat Pro",
                    "brand": "AquaBeat",
                    "category": "Bluetooth Speakers",
                    "price": 79.0,
                    "short_description": "Floating waterproof party speaker.",
                    "long_description": "Waterproof floating bluetooth pool speaker with 20-hour battery.",
                    "attributes": {"color": "Blue", "waterproof": "Yes"},
                },
            )
            print(json.loads(res.content[0].text))

            print("\n-- search_products('speaker for the pool') right after create --")
            res = await session.call_tool(
                "search_products", {"query": "speaker for the pool", "k": 3}
            )
            hits = [json.loads(c.text) for c in res.content]
            for hit in hits:
                print(f"  - {hit['name']} ({hit['category']})")
            assert any(h["sku"] == "SKU-DEMO-001" for h in hits), (
                "freshly created product should be immediately searchable"
            )
            print("\nFreshness check passed: new product findable with no reindexing.")


if __name__ == "__main__":
    asyncio.run(main())
