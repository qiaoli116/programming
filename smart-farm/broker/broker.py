"""MQTT broker process.

Runs a real MQTT broker (amqtt) on 0.0.0.0:1883 with anonymous auth allowed.
This is the only process that all other processes connect *to* -- the
sensor, the heater, and the dashboard never talk to each other directly.
"""

import asyncio
import logging

from amqtt.broker import Broker

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [broker] %(levelname)s: %(message)s",
)


async def main():
    broker = Broker()
    await broker.start()
    print("MQTT broker listening on 0.0.0.0:1883 (Ctrl+C to stop)")

    try:
        await asyncio.Event().wait()
    finally:
        await broker.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
