"""FastAPI backend for the PIM Copilot: one /chat endpoint wrapping the TD5 agent loop.

Reuses the TD4 mini-project's pim_server.py AS-IS over stdio — this backend never
imports its tool code, it only spawns it as a subprocess by file path (the exact
launch line you'd put in claude_desktop_config.json). Only the transport changed
from the notebook's in-memory one.

Run:
    uvicorn app:app --reload --port 8001
"""
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from pydantic import BaseModel

from agent import get_anthropic_tools, run_agent

BASE_DIR = Path(__file__).resolve().parent
# notebooks/TD5_agent/mini_project/backend -> project root (where .env lives)
load_dotenv(BASE_DIR.parents[3] / ".env")
if not os.getenv("ANTHROPIC_API_KEY"):
    raise RuntimeError(
        "ANTHROPIC_API_KEY not found. Create a .env file at the project root with "
        "ANTHROPIC_API_KEY=sk-ant-..."
    )

# notebooks/TD5_agent/mini_project/backend -> notebooks/TD4_mcp/mini_project/pim_server.py
TD4_SERVER_PATH = BASE_DIR.parents[2] / "TD4_mcp" / "mini_project" / "pim_server.py"
FRONTEND_DIR = BASE_DIR.parent / "frontend"

if not TD4_SERVER_PATH.exists():
    raise RuntimeError(f"TD4 server not found at {TD4_SERVER_PATH}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    params = StdioServerParameters(command=sys.executable, args=[str(TD4_SERVER_PATH)])
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            app.state.session = session
            app.state.tools = await get_anthropic_tools(session)
            print(f"Connected to TD4 server; {len(app.state.tools)} tools available.")
            yield


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


class ChatRequest(BaseModel):
    message: str


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.post("/chat")
async def chat(req: ChatRequest):
    return await run_agent(app.state.session, app.state.tools, req.message)
