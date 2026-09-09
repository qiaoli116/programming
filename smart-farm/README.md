# Smart Farm MQTT Simulation

Four processes, real MQTT protocol, manual control only (no automatic
reaction to temperature yet).

```
broker/     amqtt broker on localhost:1883
sensor/     simulated ESP32 temperature sensor (publishes)
heater/     simulated ESP32 heater controller (subscribes, echoes state)
dashboard/  MQTT client + FastAPI web server (browser dashboard)
```

## Topics

| Topic                | Published by | Payload        |
|-----------------------|---------------|----------------|
| `farm/temperature`    | sensor        | e.g. `22.4`    |
| `farm/heater/cmd`     | dashboard     | `ON` / `OFF`   |
| `farm/heater/status`  | heater        | `ON` / `OFF` (retained) |

## Running it

Open four terminals, in this order:

```
pip install -r requirements.txt

# terminal 1
python broker/broker.py

# terminal 2
python heater/heater_control.py

# terminal 3
python sensor/temperature_sensor.py

# terminal 4
python dashboard/server.py
```

Then open http://localhost:8000 in a browser.

- Type a number + Enter in the sensor's terminal to change the simulated
  temperature -- the dashboard updates live.
- Click "Turn Heater ON/OFF" on the dashboard -- watch the command appear
  in the heater's terminal, and the dashboard's status update once the
  heater confirms it.
