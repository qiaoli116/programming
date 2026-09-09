"""Simulated ESP32 temperature sensor.

Publishes a temperature reading to farm/temperature every few seconds.
Type a number and press Enter at any time to change the simulated
temperature (as if the real-world temperature changed) -- readings
then drift with small random noise around that value.
"""

import random
import threading
import time

import paho.mqtt.client as mqtt

BROKER_HOST = "localhost"
BROKER_PORT = 1883
TOPIC_TEMPERATURE = "farm/temperature"
PUBLISH_INTERVAL_SECONDS = 2

state_lock = threading.Lock()
base_temperature = 22.0


def on_connect(client, userdata, connect_flags, reason_code, properties):
    print(f"[SENSOR] Connected to broker (reason_code={reason_code})")


def publish_loop(client):
    while True:
        with state_lock:
            reading = round(base_temperature + random.uniform(-0.3, 0.3), 1)

        client.publish(TOPIC_TEMPERATURE, payload=str(reading), qos=0)
        print(f"[SENSOR] Published temperature: {reading}C")
        time.sleep(PUBLISH_INTERVAL_SECONDS)


def input_loop():
    global base_temperature
    print("Type a number and press Enter to change the simulated temperature (Ctrl+C to quit).")
    while True:
        try:
            line = input().strip()
        except EOFError:
            break

        if not line:
            continue

        try:
            value = float(line)
        except ValueError:
            print(f"[SENSOR] Not a number: {line!r}")
            continue

        with state_lock:
            base_temperature = value
        print(f"[SENSOR] Base temperature set to {value}C")


def main():
    client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2, client_id="esp32-temperature-sensor")
    client.on_connect = on_connect
    client.connect(BROKER_HOST, BROKER_PORT)
    client.loop_start()

    publisher = threading.Thread(target=publish_loop, args=(client,), daemon=True)
    publisher.start()

    try:
        input_loop()
    except KeyboardInterrupt:
        pass
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
