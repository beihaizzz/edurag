# Windows: psycopg async requires SelectorEventLoop, not ProactorEventLoop
import sys as _sys
if _sys.platform == "win32":
    import asyncio as _asyncio
    _asyncio.set_event_loop_policy(_asyncio.WindowsSelectorEventLoopPolicy())
