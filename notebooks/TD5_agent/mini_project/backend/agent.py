"""Reason -> act -> observe agent loop — the same loop written in TD5_agent.ipynb §3,
run here over a REAL stdio MCP client (connected to the TD4 pim_server.py) instead of
the notebook's in-memory transport. Only the transport changed.
"""
import json
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from mcp import ClientSession

BASE_DIR = Path(__file__).resolve().parent
# notebooks/TD5_agent/mini_project/backend -> project root (where .env lives)
load_dotenv(BASE_DIR.parents[3] / ".env")

MODEL = "claude-haiku-4-5"

# notebooks/TD5_agent/mini_project/backend/agent.py -> notebooks/data/skills/add_product/SKILL.md
SKILL_PATH = BASE_DIR.parents[2] / "data" / "skills" / "add_product" / "SKILL.md"
SKILL = SKILL_PATH.read_text()

client = anthropic.Anthropic()


async def get_anthropic_tools(session: ClientSession) -> list:
    """Translate the MCP tool catalog into Anthropic's tools= format (the TD4/TD5 1:1 map)."""
    listed = await session.list_tools()
    return [
        {"name": t.name, "description": t.description, "input_schema": t.inputSchema}
        for t in listed.tools
    ]


async def run_agent(session: ClientSession, tools: list, goal: str, max_iters: int = 12) -> dict:
    """Run Haiku in a tool-use loop until it stops requesting tools (the agent).

    Same shape as TD5_agent.ipynb's run_agent, adapted to return the tool-call trace
    instead of printing it, so the frontend can render it.
    """
    messages = [{"role": "user", "content": goal}]
    trace = []

    for _ in range(max_iters):
        resp = client.messages.create(
            model=MODEL, max_tokens=1024, system=SKILL, tools=tools, messages=messages
        )

        if resp.stop_reason != "tool_use":
            reply = "".join(b.text for b in resp.content if b.type == "text")
            return {"reply": reply, "trace": trace}

        messages.append({"role": "assistant", "content": resp.content})

        tool_results = []
        for block in resp.content:
            if block.type != "tool_use":
                continue
            trace.append({"tool": block.name, "input": block.input})
            out = await session.call_tool(block.name, block.input)
            result_text = "\n".join(c.text for c in out.content)
            tool_results.append(
                {"type": "tool_result", "tool_use_id": block.id, "content": result_text}
            )
        messages.append({"role": "user", "content": tool_results})

    return {"reply": "Max iterations reached without a final answer.", "trace": trace}
