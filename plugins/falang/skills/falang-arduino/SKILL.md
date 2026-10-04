---
description: Editing an Arduino sketch project through falang MCP tools — the mandatory setup/loop documents, pin nodes, bundled device driver actions, and the C++ target's real constraints. Use whenever editing an Arduino falang project (a project whose documents are all "function" type, opened from a packages/desktop/app-arduino project folder).
---

# Editing falang Arduino projects

Read `falang-schemes` first — this skill only adds what's Arduino-specific on top of that model.
An Arduino project's documents are all `function`-type (the same document type/tools as any
TypeScript function tree); `get_node_kinds('function')` here additionally lists the four pin node
kinds and one `driver-action::<driverId>::<actionId>` kind per installed driver action described
below — always call it rather than assuming this list is exhaustive, since the project's own
`falang/drivers/`, the user's library and `set_driver` add more drivers.

## `setup` and `loop` are mandatory

Every project has exactly two required documents, named `setup` and `loop` — the compiler requires
precisely one no-argument, no-return-value `setup` and `loop`; there is no synthesized `int
main()`. Both are protected from rename/delete in the app itself; don't attempt to rename or
delete them. You can add further `function` documents (helpers), called via `call-function` (by
document id, same as any other project — see `falang-schemes`).

## Pin nodes

Four node kinds, each a plain data shape (no children):

| kind                | `data`                                                               |
| ------------------- | -------------------------------------------------------------------- |
| `pin-write-digital` | `{ pin: number, value: boolean }` — `true` → `HIGH`, `false` → `LOW` |
| `pin-write-analog`  | `{ pin: number, value: number }` — PWM duty cycle, 0-255             |
| `pin-read-digital`  | `{ pin: number, variable: string }` — new variable name for the read |
| `pin-read-analog`   | `{ pin: number, variable: string }` — new variable name for the read |

`variable` on the two read kinds declares a brand-new identifier (like `create-var`'s `name`) —
pick a name not already in scope. A read pin node behaves like `create-var`: the variable is in
scope for everything after it in the same block.

## Driver actions

Each bundled device driver contributes one node kind per action, named
`driver-action::<driverId>::<actionId>`. `data` is a flat object of **strings** keyed by the
action's field names (every field, including numeric/select ones, is encoded as a string — this is
template substitution into C++ source, not a typed value). Call `get_node_kinds('function')` for
the exact field list/defaults of whichever driver is actually installed in the project; the five
bundled drivers as of this writing:

| driver id     | label                         | action id          | fields (all string-valued)                             | produces           |
| ------------- | ----------------------------- | ------------------ | ------------------------------------------------------ | ------------------ |
| `dht`         | DHT11 / DHT22 (Temp/Humidity) | `read-temperature` | `pin`, `sensorType` (`0`=DHT11, `1`=DHT22), `variable` | a float variable   |
| `dht`         |                               | `read-humidity`    | `pin`, `sensorType`, `variable`                        | a float variable   |
| `hc-sr04`     | Ultrasonic distance           | `read-distance`    | `trigPin`, `echoPin`, `variable`                       | a float variable   |
| `lcd1602-i2c` | LCD1602 (I2C)                 | `clear`            | `address` (I2C address, e.g. `39` = 0x27)              | no result (`void`) |
| `lcd1602-i2c` |                               | `print-text`       | `address`, `col`, `row`, `text`                        | no result (`void`) |
| `rgb-strip`   | Addressable RGB (WS2812)      | `set-pixel-color`  | `pin`, `numLeds`, `index`, `r`, `g`, `b`               | no result (`void`) |
| `rgb-strip`   |                               | `show`             | `pin`, `numLeds`                                       | no result (`void`) |
| `servo`       | Servo                         | `set-angle`        | `pin`, `angle`                                         | no result (`void`) |

A field with a `new-variable`-kind (the `variable` field on `dht`/`hc-sr04`) works exactly like a
pin-read's `variable` — declares a new in-scope identifier holding the action's result. An action
with no such field (everything void-returning above) is a bare statement, like `action`.

Example: read a DHT22 on pin 3 into `temperature`, then print it on an LCD:

```json
{ "id": "n1", "name": "driver-action::dht::read-temperature", "data": { "pin": "3", "sensorType": "1", "variable": "temperature" } },
{ "id": "n2", "name": "driver-action::lcd1602-i2c::print-text", "data": { "address": "39", "col": "0", "row": "0", "text": "temp reading" } }
```

## Writing a device driver

When the user's part is not in `list_drivers` (a sensor, display or module with its own protocol), write a driver
instead of pasting raw C++ into `action` strings — it becomes pickable icons and a `Devices` entry.

1. `list_drivers` first: reuse or extend an existing one if it fits (`get_driver` shows its bundle).
2. Wrap the library/registers in plain C functions in one `.h`/`.cpp` pair. **Give every function a prefix unique to
   the driver** (`bmp280_read_temperature`, never `read_temperature`) — names are checked against built-ins and every
   other driver. Keep state in file-scope statics; use only what the target board's core provides.
3. Describe it in `config`: `id` (kebab-case), `label`, `notes` (plain English), `includes`/`sourceFiles`, one
   `declarations` line per function (`declare function bmp280_init(address: number): void;`), and one **action per
   user-visible operation** with `fields` (`pin`, `number`, `string`, `boolean`, `select`, `new-variable`), a
   `codeTemplate` using `${field}` and, for a value-returning action, a `new-variable` field plus `resultType`
   (`int`/`float`/`bool`/`string`). Fill in `notes` on every action. If the part needs initialisation in `setup()`
   (an I2C address, a pin), add a `device` section with `fields` and a `setupTemplate` — the user then lists it in
   `Devices` (that is the only way `setup` initialises it). Exact format: `references/driver-format.md`; a complete
   working example (a BMP280 on I2C): `references/examples/bmp280.falang-driver.json`.
4. `validate_driver({ bundle, scope: 'project' })` and fix every error — it type-checks the templates, checks name
   collisions and compiles a synthetic sketch with `arduino-cli` for the project board (a missing core/library is only
   a warning). Then `set_driver` with the same bundle (scope `project`: the driver lives in the project's
   `falang/drivers/`; use `library` only if the user wants it in their personal library, and `use_library_driver` to
   copy one in). `set_driver` re-runs the whole check and writes nothing unless it passes.
5. The new `driver-action::<id>::<action>` kinds are available to `get_node_kinds`/`set_document` right away. Use them
   in `setup`/`loop`. If the driver has a `device` section, add an instance to the `Devices` document: `get_devices`
   (current `{ pins, devices }`), then `set_devices` with the full replacement — `pins: [{ pin, mode }]` and
   `devices: [{ driverId, name, params }]` (params are string values of the driver's `device.fields`; absent ones take
   the field default). It validates the driver, fields and pin numbers, names the failing path, and writes nothing on
   error; the driver's `setupTemplate` is then compiled into `setup()`.

`delete_driver` refuses a project driver that nodes or `Devices` still use (it lists the usages).

## The C++ target's real constraints

This compiles through the `logic`-constructor's cpp target, restricted for Arduino/AVR:

- **Types**: only numbers (`int8`/`int16`/`int32`/`int64`, `float32`/`float64`), `bool`, and
  `void`. **No strings, arrays, or struct types** in variable declarations/expressions — a driver
  action's `text` field is raw template substitution into generated C++, not a typed string
  variable, so it's fine as a field value but you still can't declare a `string`-typed `create-var`.
- `log`, `throw`, and a `return` carrying a value are not supported in `setup`/`loop`/their callees
  — there's no portable Arduino/AVR target for them yet. Using one isn't rejected by
  `set_document`, but it will fail to actually compile.
- Prefer pin/driver nodes over hand-written `action` strings calling `digitalWrite`/`analogWrite`/
  driver functions directly — same reasoning as `falang-schemes`' "prefer domain nodes": they're
  what the editor's own icons produce, and they keep pin numbers/variable names visible on the
  canvas.

## Compile / upload are not available from here yet

There is no `compile`/`upload` MCP tool for Arduino projects in this version — that part of the
ADR is deliberately deferred (desktop-only document editing ships first; compile/upload actions are
a later phase). After editing documents, tell the user to use **Sketch → Build & Upload…** in the
Arduino desktop app itself to compile and flash the board.
