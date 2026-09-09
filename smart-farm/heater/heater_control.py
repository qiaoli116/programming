"""Simulated ESP32 heater controller.

Subscribes to farm/heater/cmd and prints every command it receives, as
if switching a physical relay. Publishes its actual state (retained) to
farm/heater/status so the dashboard always knows the real state, even
if it connects after a command was already sent.
"""

import paho.mqtt.client as mqtt

BROKER_HOST = "localhost"
BROKER_PORT = 1883
TOPIC_CMD = "farm/heater/cmd"
TOPIC_STATUS = "farm/heater/status"

heater_state = "OFF"


def publish_status(client):
    client.publish(TOPIC_STATUS, payload=heater_state, qos=1, retain=True)


def on_connect(client, userdata, connect_flags, reason_code, properties):
    print(f"[HEATER] Connected to broker (reason_code={reason_code})")
    client.subscribe(TOPIC_CMD)
    publish_status(client)


def on_message(client, userdata, msg):
    global heater_state
    command = msg.payload.decode().strip().upper()

    if command not in ("ON", "OFF"):
        print(f"[HEATER] Ignoring unknown command: {command!r}")
        return

    heater_state = command
    print(f"[HEATER] Received command: {command} -> heater is now {heater_state}")
    publish_status(client)


def main():
    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2, client_id="esp32-heater-control")
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(BROKER_HOST, BROKER_PORT)

    print("Heater controller running. Waiting for commands (Ctrl+C to quit)...")
    try:
        client.loop_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
