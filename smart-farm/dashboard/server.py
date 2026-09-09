"""Smart farm dashboard.

This process is both an MQTT client (subscribes to temperature and heater
status, publishes heater commands) and a web server (FastAPI), so a browser
can view live data and send manual heater control commands.

MQTT runs on paho's own background thread (client.loop_start()). Its
callbacks hop onto the FastAPI event loop via run_coroutine_threadsafe so
they can safely broadcast updates to connected WebSocket clients.
"""

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

import paho.mqtt.client as mqtt
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

BROKER_HOST = "localhost"
BROKER_PORT = 1883
TOPIC_TEMPERATURE = "farm/temperature"
TOPIC_HEATER_CMD = "farm/heater/cmd"
TOPIC_HEATER_STATUS = "farm/heater/status"

@asynccontextmanager
async def lifespan(app: FastAPI):
    global main_loop
    main_loop = asyncio.get_running_loop()
    mqtt_client.connect(BROKER_HOST, BROKER_PORT)
    mqtt_client.loop_start()

    yield

    mqtt_client.loop_stop()
    mqtt_client.disconnect()


app = FastAPI(lifespan=lifespan)
templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))

latest_state = {"temperature": None, "heater": "UNKNOWN"}
connected_websockets: set[WebSocket] = set()
main_loop: asyncio.AbstractEventLoop | None = None


async def broadcast_state():
    dead = set()
    for ws in connected_websockets:
        try:
            await ws.send_json(latest_state)
        except Exception:
            dead.add(ws)
    connected_websockets.difference_update(dead)


def on_connect(client, userdata, connect_flags, reason_code, properties):
    print(f"[DASHBOARD] Connected to broker (reason_code={reason_code})")
    client.subscribe(TOPIC_TEMPERATURE)
    client.subscribe(TOPIC_HEATER_STATUS)


def on_message(client, userdata, msg):
    if msg.topic == TOPIC_TEMPERATURE:
        latest_state["temperature"] = float(msg.payload.decode())
    elif msg.topic == TOPIC_HEATER_STATUS:
        latest_state["heater"] = msg.payload.decode()

    print(f"[DASHBOARD] {msg.topic} -> {msg.payload.decode()}")

    if main_loop is not None:
        asyncio.run_coroutine_threadsafe(broadcast_state(), main_loop)


mqtt_client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2, client_id="dashboard")
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/api/heater/{state}")
async def set_heater(state: str):
    state = state.upper()
    if state not in ("ON", "OFF"):
        return {"ok": False, "error": "state must be ON or OFF"}

    mqtt_client.publish(TOPIC_HEATER_CMD, payload=state, qos=1)
    return {"ok": True, "sent": state}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.add(websocket)
    await websocket.send_json(latest_state)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_websockets.discard(websocket)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
