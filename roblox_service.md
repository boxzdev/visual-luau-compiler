# Functional Roblox Studio Services & Methods Reference

This document provides a comprehensive, organized reference of all **functional Roblox Studio services, methods, properties, and signals** implemented in the **Visual Luau Compiler Online** project (`luaRunner.ts`, `App.tsx`, `physicsEngine.ts`).

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Master Services Directory](#master-services-directory)
3. [Engine Services](#engine-services)
   - [TweenService](#1-tweenservice)
   - [RunService](#2-runservice)
   - [UserInputService](#3-userinputservice)
   - [CollectionService](#4-collectionservice)
   - [Debris](#5-debris)
   - [HttpService](#6-httpservice)
   - [PathfindingService](#7-pathfindingservice)
   - [ContextActionService](#8-contextactionservice)
   - [Players](#9-players)
   - [TeleportService](#10-teleportservice)
   - [MarketplaceService](#11-marketplaceservice)
4. [Hierarchy & Tree Services (DataModel Containers)](#hierarchy--tree-services)
   - [Workspace](#1-workspace)
   - [Lighting](#2-lighting)
   - [ReplicatedStorage](#3-replicatedstorage)
   - [ServerScriptService & ServerStorage](#4-serverscriptservice--serverstorage)
   - [StarterGui & PlayerGui](#5-startergui--playergui)
   - [StarterPlayer & StarterPack](#6-starterplayer--starterpack)
   - [Additional Services (SoundService, Teams, MaterialService, etc.)](#7-additional-registered-services)
5. [The `DataModel` (`game`) Root](#the-datamodel-game-root)
6. [Cross-VM Remote Communication](#cross-vm-remote-communication)
   - [RemoteEvent](#remoteevent)
   - [RemoteFunction](#remotefunction)
7. [Universal `Instance` Methods & Properties](#universal-instance-methods--properties)
8. [Supporting Datatypes & Enums](#supporting-datatypes--enums)
   - [Vector3 & Vector2](#vector3--vector2)
   - [CFrame](#cframe)
   - [Color3 & BrickColor](#color3--brickcolor)
   - [UDim & UDim2](#udim--udim2)
   - [TweenInfo & Enums](#tweeninfo--enums)
9. [Task Scheduler & Thread Management](#task-scheduler--thread-management)

---

## Architecture Overview

All services run inside a sandboxed WebAssembly Lua runtime powered by **Wasmoon**.
- **Dual Runtime System**: When you press **Play**, the compiler spins up two independent Lua runtimes:
  - **Server Runtime**: Executes `Script` instances; has access to ServerStorage, ServerScriptService, and fires client events.
  - **Client Runtime**: Executes `LocalScript` instances; has access to `Players.LocalPlayer`, `PlayerGui`, ScreenGuis, and UserInputService.
- **Pure Lua Signal Wrap (`__WRAP_SERVICE` & `__WRAP_RBX_SIGNAL`)**: Services exposing signals (such as `RunService.Heartbeat`, `UserInputService.InputBegan`, and `CollectionService:GetInstanceAddedSignal`) support both callback subscription (`:Connect()`) and non-blocking thread yielding (`:Wait()`) via custom coroutine resumption (`coroutine.yield("RBXWAIT", channel)`).
- **Two-Way Bridge Synchronization**: Modifications made via service calls (e.g., `TweenService:Create`, `Lighting.ClockTime = ...`, `workspace.Gravity = ...`) immediately propagate to the React state tree, Three.js 3D viewport, and Monaco Properties panel.

---

## Master Services Directory

| Service Name | Access Method | Type | Primary Capabilities |
| :--- | :--- | :--- | :--- |
| **`TweenService`** | `game:GetService("TweenService")` | Engine Service | Smooth interpolation of properties (`Vector3`, numbers, colors) over time with `EasingStyle` and `EasingDirection`. |
| **`RunService`** | `game:GetService("RunService")` | Engine Service | Frame stepping signals (`Heartbeat`, `Stepped`, `RenderStepped`), environment queries (`IsServer`, `IsClient`, `IsStudio`), and `BindToRenderStep`. |
| **`UserInputService`** | `game:GetService("UserInputService")` | Engine Service | Real browser hardware event hooks (`InputBegan`, `InputEnded`), key checking (`IsKeyDown`), and input state queries. |
| **`CollectionService`** | `game:GetService("CollectionService")` | Engine Service | Tagging instances (`AddTag`, `RemoveTag`, `HasTag`, `GetTagged`), tag change signals (`GetInstanceAddedSignal`, `GetInstanceRemovedSignal`). |
| **`Debris`** | `game:GetService("Debris")` | Engine Service | Non-blocking scheduled instance destruction (`AddItem`). |
| **`HttpService`** | `game:GetService("HttpService")` | Engine Service | Pure JSON encoding/decoding (`JSONEncode`, `JSONDecode`) and GUID generation (`GenerateGUID`). |
| **`PathfindingService`**| `game:GetService("PathfindingService")` | Engine Service | Path generation (`CreatePath`), waypoint computation (`ComputeAsync`, `GetWaypoints`), and path status. |
| **`ContextActionService`** | `game:GetService("ContextActionService")`| Engine Service | Action binding to user inputs (`BindAction`, `UnbindAction`). |
| **`Players`** | `game:GetService("Players")` | Engine & Tree | Player simulation, `LocalPlayer` access on client, `PlayerGui` access, player lifecycle events. |
| **`TeleportService`** | `game:GetService("TeleportService")` | Engine Service | Safe mocked teleportation APIs (`Teleport`, `TeleportAsync`). |
| **`MarketplaceService`** | `game:GetService("MarketplaceService")`| Engine Service | Mocked monetization and asset query APIs (`PromptPurchase`, `GetProductInfo`, etc.). |
| **`Workspace`** | `workspace`, `game.Workspace`, `game:GetService("Workspace")` | Hierarchy Service | 3D physical world root, physics simulation parameters (`Gravity`), collision groups, and dynamic object tree. |
| **`Lighting`** | `game.Lighting`, `game:GetService("Lighting")` | Hierarchy Service | Skybox, day/night cycles (`ClockTime`, `TimeOfDay`), celestial directions (`GetSunDirection`, `GetMoonDirection`), atmospheric haze, and fog. |
| **`ReplicatedStorage`**| `game:GetService("ReplicatedStorage")`| Hierarchy Service | Cross-replicated container between Server and Client; ideal for `RemoteEvent`, `RemoteFunction`, and shared `ModuleScript`. |
| **`ServerScriptService`**| `game:GetService("ServerScriptService")` | Hierarchy Service | Dedicated container for server-side `Script` instances. |
| **`ServerStorage`** | `game:GetService("ServerStorage")` | Hierarchy Service | Server-only asset and script storage container. |
| **`StarterGui`** | `game:GetService("StarterGui")` | Hierarchy Service | Container for 2D ScreenGui prototypes; replicates to client `LocalPlayer.PlayerGui`. |
| **`StarterPack`** | `game:GetService("StarterPack")` | Hierarchy Service | Starter inventory container. |
| **`StarterPlayer`** | `game:GetService("StarterPlayer")` | Hierarchy Service | Player script prototypes (`StarterCharacterScripts`, `StarterPlayerScripts`). |
| **`SoundService`** | `game:GetService("SoundService")` | Hierarchy Service | Audio configuration and sound node container. |
| **`TextChatService`**| `game:GetService("TextChatService")`| Hierarchy Service | Text chat service and channel root. |
| **`MaterialService`**| `game:GetService("MaterialService")`| Hierarchy Service | Material variant overrides and shader manager. |
| **`Teams`** | `game:GetService("Teams")` | Hierarchy Service | Team organization service. |
| **`ReplicatedFirst`**| `game:GetService("ReplicatedFirst")`| Hierarchy Service | High-priority client loading container. |

---

## Engine Services

### 1. TweenService
`TweenService` smoothly interpolates instance properties over time using configurable easing curves and durations.

#### Access
```lua
local TweenService = game:GetService("TweenService")
```

#### Service Methods
- **`:Create(instance, tweenInfo, goals)`**
  - **Parameters**:
    - `instance` (`Instance`): The target object to animate (Part, GUI element, Light, etc.).
    - `tweenInfo` (`TweenInfo`): An object created via `TweenInfo.new(...)` specifying duration, easing, and repeats.
    - `goals` (`table`): A dictionary of properties to interpolate (e.g. `{ Position = Vector3.new(0, 10, 0), Transparency = 0.5 }`).
  - **Returns**: `Tween` object.
  - **Supported Interpolation Types**: `number`, `Vector3`, `Color3`.

#### Returned `Tween` Object
| Method / Property | Type | Description |
| :--- | :--- | :--- |
| `:Play()` | Function | Starts the tween interpolation loop. |
| `:Pause()` | Function | Pauses the tween at the current alpha. |
| `:Cancel()` | Function | Stops and resets the tween before completion. |
| `.Completed` | `RBXScriptSignal` | Signal fired when the tween reaches 100% alpha. Supports both `:Connect(fn)` and `:Wait()`. |

#### Example
```lua
local TweenService = game:GetService("TweenService")
local part = workspace:WaitForChild("Part")

local info = TweenInfo.new(2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
local tween = TweenService:Create(part, info, {
    Position = Vector3.new(0, 15, 0),
    Transparency = 0.5
})

tween:Play()
tween.Completed:Wait()
print("Tween completed!")
```

---

### 2. RunService
`RunService` provides hooks into the runtime's frame execution loop and inspects the current execution context.

#### Access
```lua
local RunService = game:GetService("RunService")
```

#### Service Methods
- **`:IsServer()` -> `boolean`**  
  Returns `true` if executing within a server-side `Script` context.
- **`:IsClient()` -> `boolean`**  
  Returns `true` if executing within a client-side `LocalScript` context.
- **`:IsStudio()` -> `boolean`**  
  Always returns `true` in this environment.
- **`:IsRunning()` -> `boolean`**  
  Returns `true` while the simulation is active.
- **`:IsRunMode()` -> `boolean`**  
  Returns `false` (interactive gameplay mode is running).
- **`:BindToRenderStep(name, priority, callback)`**  
  Binds a function `callback(dt)` to fire every frame on the client.
- **`:UnbindFromRenderStep(name)`**  
  Removes a previously bound callback with the specified name.

#### Service Signals (Fired at 60 FPS)
- **`.Heartbeat`** (`RBXScriptSignal`)  
  Fires every frame after physics stepping. Passes `(dt: number)`. Fully supports `:Wait()`.
- **`.Stepped`** (`RBXScriptSignal`)  
  Fires every frame prior to physics stepping. Passes `(time: number, dt: number)`. Fully supports `:Wait()`.
- **`.RenderStepped`** (`RBXScriptSignal`)  
  Fires every frame before rendering. Passes `(dt: number)`. Fully supports `:Wait()`.

#### Example
```lua
local RunService = game:GetService("RunService")

if RunService:IsClient() then
    RunService.RenderStepped:Connect(function(dt)
        -- Runs every visual frame on the client
    end)
end

-- Non-blocking yield until the next frame:
local dt = RunService.Heartbeat:Wait()
print("Next tick elapsed seconds:", dt)
```

---

### 3. UserInputService
`UserInputService` connects directly to real browser DOM events (`keydown`, `keyup`, `mousedown`, `mouseup`), translating user inputs into Roblox `InputObject` representations.

#### Access
```lua
local UserInputService = game:GetService("UserInputService")
```

#### Service Properties
| Property | Type | Description |
| :--- | :--- | :--- |
| `KeyboardEnabled` | `boolean` (Read-only) | `true` in desktop browser environment. |
| `MouseEnabled` | `boolean` (Read-only) | `true` in desktop browser environment. |
| `TouchEnabled` | `boolean` (Read-only) | `false` by default in desktop mode. |
| `GamepadEnabled` | `boolean` (Read-only) | `false` by default. |

#### Service Methods
- **`:IsKeyDown(keyCodeOrEnum)` -> `boolean`**  
  Checks if a specific key is currently depressed (accepts `Enum.KeyCode.Space` or string `"Space"`).
- **`:GetMouseLocation()` -> `Vector3`**  
  Returns current cursor coordinates.
- **`:IsMouseButtonPressed(button)` -> `boolean`**  
  Checks mouse button state.
- **`:GetLastInputType()` -> `string`**  
  Returns the type of the most recent input device (e.g. `"Keyboard"`).

#### Service Signals
- **`.InputBegan`** (`RBXScriptSignal`)  
  Fires when a key or mouse button is pressed. Passes `(input: InputObject, gameProcessed: boolean)`. Supports `:Connect(fn)` and `:Wait()`.
- **`.InputEnded`** (`RBXScriptSignal`)  
  Fires when a key or mouse button is released. Passes `(input: InputObject, gameProcessed: boolean)`. Supports `:Connect(fn)` and `:Wait()`.
- **`.InputChanged`** (`RBXScriptSignal`)  
  Fires when mouse movement or scroll changes occur.

#### `InputObject` Representation
```lua
input.KeyCode        -- EnumItem (e.g., Enum.KeyCode.W)
input.UserInputType  -- "Keyboard", "MouseButton1", "MouseButton2", "MouseButton3"
input.UserInputState -- "Begin" or "End"
input.Position       -- Vector3
input.Delta          -- Vector3
```

#### Example
```lua
local UserInputService = game:GetService("UserInputService")

UserInputService.InputBegan:Connect(function(input, gameProcessed)
    if input.KeyCode == Enum.KeyCode.Space then
        print("Jump key pressed!")
    end
end)
```

---

### 4. CollectionService
`CollectionService` enables Tag-based programming (ECS-lite architecture) to group instances across the hierarchy.

#### Access
```lua
local CollectionService = game:GetService("CollectionService")
```

#### Service Methods
- **`:AddTag(instance, tag)`**  
  Adds a string `tag` to the given `instance`.
- **`:RemoveTag(instance, tag)`**  
  Removes a string `tag` from the given `instance`.
- **`:HasTag(instance, tag)` -> `boolean`**  
  Returns whether the `instance` has the specified `tag`.
- **`:GetTagged(tag)` -> `table`**  
  Returns an array of all live `Instance` proxies that carry the specified `tag`.
- **`:GetInstanceAddedSignal(tag)` -> `RBXScriptSignal`**  
  Returns a signal that fires whenever an instance receives this tag. Supports `:Connect(fn)` and `:Wait()`.
- **`:GetInstanceRemovedSignal(tag)` -> `RBXScriptSignal`**  
  Returns a signal that fires whenever an instance loses this tag. Supports `:Connect(fn)` and `:Wait()`.

#### Example
```lua
local CS = game:GetService("CollectionService")

CS.GetInstanceAddedSignal("KillBrick"):Connect(function(part)
    part.Touched:Connect(function(hit)
        print(hit.Name .. " hit a kill brick!")
    end)
end)

for _, part in ipairs(CS:GetTagged("KillBrick")) do
    part.Color = Color3.fromRGB(255, 0, 0)
end
```

---

### 5. Debris
`Debris` safely schedules the destruction of temporary instances (projectiles, visual effects) without pausing the executing thread.

#### Access
```lua
local Debris = game:GetService("Debris")
```

#### Service Methods
- **`:AddItem(instance, lifetime)`**  
  - `instance` (`Instance`): Target object to destroy.
  - `lifetime` (`number`, default `0`): Time in seconds before `:Destroy()` is invoked.

#### Example
```lua
local Debris = game:GetService("Debris")
local bullet = Instance.new("Part", workspace)

-- Automatically destroyed after 3.5 seconds:
Debris:AddItem(bullet, 3.5)
```

---

### 6. HttpService
`HttpService` provides native JSON encoding and decoding, and GUID generation.

#### Access
```lua
local HttpService = game:GetService("HttpService")
```

#### Service Properties
| Property | Type | Description |
| :--- | :--- | :--- |
| `HttpEnabled` | `boolean` | Configured to `true`. |

#### Service Methods
- **`:JSONEncode(value)` -> `string`**  
  Serializes a Lua table, array, or primitive into a standard JSON string.
- **`:JSONDecode(jsonString)` -> `table`**  
  Parses a JSON string into a native Lua table.
- **`:GenerateGUID(wrapInCurlyBraces)` -> `string`**  
  Generates a RFC4122 version 4 UUID string.
  - `wrapInCurlyBraces` (`boolean`, default `true`): e.g. `"{D30AC51A-9A0B-48F8-9D27-E888D1612A9E}"`.

> [!NOTE]  
> External HTTP network methods (`:RequestAsync`, `:GetAsync`, `:PostAsync`) throw an explicit sandbox exception to prevent unauthenticated browser network requests.

#### Example
```lua
local HttpService = game:GetService("HttpService")

local data = { health = 100, inventory = { "Sword", "Shield" } }
local encoded = HttpService:JSONEncode(data)
print("JSON:", encoded)

local decoded = HttpService:JSONDecode(encoded)
print("Recovered Health:", decoded.health)
print("Generated GUID:", HttpService:GenerateGUID(false))
```

---

### 7. PathfindingService
`PathfindingService` calculates navigational waypoints from a start vector to a target vector.

#### Access
```lua
local PathfindingService = game:GetService("PathfindingService")
```

#### Service Methods
- **`:CreatePath(agentParameters)` -> `Path`**  
  Creates a new navigational path object.

#### Returned `Path` Object
| Method / Property | Type | Description |
| :--- | :--- | :--- |
| `:ComputeAsync(startVec3, goalVec3)` | Function | Calculates a sequence of interpolated waypoint coordinates. |
| `:GetWaypoints()` | Function | Returns an array of `PathWaypoint` objects. |
| `.Status` | `string` | Status of the path calculation (`"Success"`). |
| `.Blocked` | `RBXScriptSignal` | Signal fired if obstacles block the path. Supports `:Connect()`. |
| `:CheckOcclusionAsync()` | Function | Validates line-of-sight across waypoints. |

#### `PathWaypoint` Object
- `Position` (`Vector3`): 3D coordinate of the step.
- `Action` (`string`): `"Start"`, `"Walk"`, or `"Finish"`.

#### Example
```lua
local PFS = game:GetService("PathfindingService")
local path = PFS:CreatePath()

path:ComputeAsync(Vector3.new(0, 0, 0), Vector3.new(10, 0, 10))
for i, wp in ipairs(path:GetWaypoints()) do
    print("Waypoint " .. i .. " at " .. tostring(wp.Position) .. " [" .. wp.Action .. "]")
end
```

---

### 8. ContextActionService
`ContextActionService` allows scripts to bind and unbind named actions to user inputs with precedence management.

#### Access
```lua
local ContextActionService = game:GetService("ContextActionService")
```

#### Service Methods
- **`:BindAction(actionName, callback, createTouchButton, ...)`**  
  Registers `callback(actionName, inputState, inputObject)` to input events.
- **`:UnbindAction(actionName)`**  
  Removes the action handler registered under `actionName`.
- **`:GetBoundActionInfo()` -> `table`**  
  Returns metadata for currently bound actions.
- **`:SetTitle(actionName, title)`**  
  Sets UI label for touch buttons (mocked for compatibility).
- **`:SetImage(actionName, imageId)`**  
  Sets UI icon for touch buttons (mocked for compatibility).

#### Example
```lua
local CAS = game:GetService("ContextActionService")

local function onSprint(actionName, inputState, input)
    if inputState == "Begin" then
        print("Sprinting started")
    else
        print("Sprinting ended")
    end
end

CAS:BindAction("Sprint", onSprint, false)
```

---

### 9. Players
`Players` simulates multiplayer game sessions and exposes player identity and client GUI containers.

#### Access
```lua
local Players = game:GetService("Players")
```

#### Service Properties
| Property | Type | Description |
| :--- | :--- | :--- |
| `LocalPlayer` | `Player` \| `nil` | Returns the `Player1` instance when running on the **Client** (`LocalScript`). Returns `nil` when running on the **Server** (`Script`), preserving Roblox security rules. |

#### Service Methods
- **`:GetPlayers()` -> `table`**  
  Returns an array containing the simulated `[Player1]`.
- **`:FindFirstChild("Player1")` -> `Player`**  
  Looks up the player by name.
- **`:WaitForChild("Player1")` -> `Player`**  
  Yields/retrieves the player by name.

#### Service Signals
- **`.PlayerAdded`** (`RBXScriptSignal`): Fires when a player connects.
- **`.PlayerRemoving`** (`RBXScriptSignal`): Fires when a player leaves.

#### `Player` Object Model
- `.Name`: `"Player1"`
- `.UserId`: `1`
- `.DisplayName`: `"Player1"`
- `.Character`: `nil` / Character model proxy.
- `.PlayerGui`: Points directly to the client's live `StarterGui` proxy.
- `:WaitForChild("PlayerGui")`: Retrieves the `PlayerGui` instance.
- `:FindFirstChild("PlayerGui")`: Retrieves the `PlayerGui` instance.

#### Example
```lua
local Players = game:GetService("Players")
local player = Players.LocalPlayer

if player then
    local playerGui = player:WaitForChild("PlayerGui")
    print("Running on client as " .. player.Name .. " (UserId: " .. player.UserId .. ")")
end
```

---

### 10. TeleportService
Mocked teleportation service that logs teleport intents without disrupting browser execution.

#### Access
```lua
local TeleportService = game:GetService("TeleportService")
```

#### Service Methods
- **`:Teleport(placeId, player?)`**  
  Logs teleport request to the Output panel.
- **`:TeleportAsync(placeId)` -> `TeleportAsyncResult`**  
  Asynchronously logs teleport request.
- **`:GetPlayerPlaceInstanceAsync()` -> `(boolean, string)`**  
  Returns `(true, "placeholder-job-id")`.

---

### 11. MarketplaceService
Monetization API allowing code testing without requiring live Robux backend connectivity.

#### Access
```lua
local MarketplaceService = game:GetService("MarketplaceService")
```

#### Service Methods
- **`:PromptPurchase(player, assetId)`**  
  Logs test purchase request.
- **`:PromptGamePassPurchase(player, gamePassId)`**  
  Logs gamepass purchase prompt.
- **`:UserOwnsGamePassAsync(userId, gamePassId)` -> `boolean`**  
  Returns `false`.
- **`:PlayerOwnsAsset(player, assetId)` -> `boolean`**  
  Returns `false`.
- **`:GetProductInfo(assetId)` -> `table`**  
  Returns mock `ProductInfo` dictionary with `Name`, `Description`, `PriceInRobux`, and `ProductId`.

---

## Hierarchy & Tree Services

Hierarchy services live directly in the Explorer tree as root service nodes and are accessible either as globals or via `game:GetService("ServiceName")`.

### 1. Workspace
The 3D environment container housing parts, terrain, and the camera.

#### Access
```lua
local ws = workspace
-- OR
local ws = game.Workspace
-- OR
local ws = game:GetService("Workspace")
```

#### Specific Properties
| Property | Type | Description |
| :--- | :--- | :--- |
| `Gravity` | `number` | Controls downward gravitational acceleration in the physics simulator (default: `196.2` studs/s²). Setting this live changes part fall speeds in real-time. |
| `Name` | `string` | `"Workspace"` |
| `ClassName` | `string` | `"Workspace"` |

#### Hierarchy & Traversal
- Direct child access: `workspace.Baseplate`, `workspace.SpawnLocation`, `workspace.MyPart`.
- Inherits all universal `Instance` methods (`:FindFirstChild`, `:GetChildren`, `:GetDescendants`, etc.).

---

### 2. Lighting
Manages environment visuals, procedural day/night sky dome, sun/moon positioning, and post-processing.

#### Access
```lua
local Lighting = game:GetService("Lighting")
-- OR
local Lighting = game.Lighting
```

#### Environment & Celestial Properties
| Property | Type | Description |
| :--- | :--- | :--- |
| `ClockTime` | `number` | Time of day in hours from `0.0` to `24.0` (e.g. `14.5` = 2:30 PM). Automatically rotates sun and moon in the sky. |
| `TimeOfDay` | `string` | Time in `"HH:MM:SS"` format (e.g. `"14:30:00"`). Synchronized with `ClockTime`. |
| `GeographicLatitude`| `number` | Latitude from `-90` to `90` degrees. Tilts the celestial orbit. |
| `SunAngle` | `number` | Sun orientation angle (-50 to 50). |
| `Brightness` | `number` | Sunlight illumination intensity (0 to 10). |
| `Ambient` | `Color3` | Ambient light color in shadow. |
| `OutdoorAmbient` | `Color3` | Ambient light color under open sky. |
| `ColorShift_Top` | `Color3` | Color tint for surfaces facing the light source. |
| `ColorShift_Bottom`| `Color3` | Color tint for surfaces facing away from the light source. |
| `GlobalShadows` | `boolean` | Toggles Three.js directional shadows. |
| `ShadowSoftness` | `number` | Shadow blur radius (0 to 1). |
| `ExposureCompensation` | `number` | Tone mapping camera exposure offset (-3 to 3). |
| `EnvironmentDiffuseScale` | `number` | IBL diffuse lighting scale (0 to 1). |
| `EnvironmentSpecularScale`| `number` | IBL specular reflection scale (0 to 1). |
| `Technology` | `string` | `"ShadowMap"`, `"Future"`, `"Voxel"`, or `"Compatibility"`. |

#### Fog Properties
| Property | Type | Description |
| :--- | :--- | :--- |
| `FogEnabled` | `boolean` | Toggles viewport scene fog. |
| `FogColor` | `Color3` | Hex/RGB color of scene fog. |
| `FogStart` | `number` | Distance in studs where fog begins. |
| `FogEnd` | `number` | Distance in studs where fog reaches 100% density. |

#### Lighting Methods
- **`:SetMinutesAfterMidnight(minutes)`**  
  Sets the time of day given total minutes since midnight (`0` to `1440`).
- **`:GetMinutesAfterMidnight()` -> `number`**  
  Returns total minutes elapsed in the current `ClockTime`.
- **`:GetSunDirection()` -> `Vector3`**  
  Returns normalized 3D unit vector pointing towards the sun.
- **`:GetMoonDirection()` -> `Vector3`**  
  Returns normalized 3D unit vector pointing towards the moon.

#### Example
```lua
local Lighting = game:GetService("Lighting")

-- Smooth day-to-night cycle
task.spawn(function()
    while true do
        Lighting.ClockTime = (Lighting.ClockTime + 0.05) % 24
        task.wait(0.03)
    end
end)
```

---

### 3. ReplicatedStorage
A container that automatically replicates from the server to all clients.

#### Access
```lua
local ReplicatedStorage = game:GetService("ReplicatedStorage")
```

#### Best Practices in this Engine
- **`RemoteEvent` and `RemoteFunction` instances**: Place here so both server `Script`s and client `LocalScript`s can index them via `:WaitForChild()`.
- **Shared `ModuleScript`s**: Accessible via `require(ReplicatedStorage.MyModule)` from both Server and Client contexts.

---

### 4. ServerScriptService & ServerStorage
- **`ServerScriptService`** (`game:GetService("ServerScriptService")`):  
  The standard container for server-side `Script`s. Scripts here only run in the Server runtime.
- **`ServerStorage`** (`game:GetService("ServerStorage")`):  
  A server-only storage area invisible to client `LocalScript`s.

---

### 5. StarterGui & PlayerGui
- **`StarterGui`** (`game:GetService("StarterGui")`):  
  Holds 2D prototypes (`ScreenGui`, `Frame`, `TextButton`, etc.).
- **Client Replication**:  
  When Gameplay runs, `StarterGui` contents are made accessible on the client via `game:GetService("Players").LocalPlayer.PlayerGui`. Interactive buttons and inputs fire client signals (`Activated`, `MouseButton1Click`).

---

### 6. StarterPlayer & StarterPack
- **`StarterPlayer`** (`game:GetService("StarterPlayer")`):  
  Contains `StarterPlayerScripts` and `StarterCharacterScripts` folders.
- **`StarterPack`** (`game:GetService("StarterPack")`):  
  Standard starter item container.

---

### 7. Additional Registered Services
The following services are registered in the DataModel tree and can be fetched via `game:GetService(name)`:
- **`SoundService`**: Audio root.
- **`TextChatService`**: Modern Roblox text messaging service.
- **`MaterialService`**: Material manager.
- **`Teams`**: Game team configuration.
- **`ReplicatedFirst`**: Early client loading container.

---

## The `DataModel` (`game`) Root

The global variable `game` represents the top-level DataModel.

### Members
- **`:GetService(serviceName: string)` -> `Instance` \| `table`**  
  Retrieves an engine or hierarchy service by name (case-insensitive). Repeated calls return the identical memoized service table.
- **`.Workspace` / `.workspace`**  
  Direct reference to the Workspace hierarchy proxy.
- **`:FindFirstChild(name: string)`**  
  Finds top-level services or nodes.

---

## Cross-VM Remote Communication

The project implements a **cross-VM Remote Bridge** (`RemoteBridge`) enabling asynchronous and synchronous messaging between isolated Server and Client runtimes.

### RemoteEvent
Supports one-way, non-blocking asynchronous event signaling.

```
LocalScript (Client)   --- FireServer(...) --->   Script (Server)
Script (Server)        --- FireClient(...) --->   LocalScript (Client)
Script (Server)        --- FireAllClients() ->   LocalScript (Client)
```

#### API Methods & Signals
- **`:FireServer(...)`** (LocalScript only)  
  Sends arguments to the server. Enforces Roblox security rules (errors if called from a server Script).
- **`:FireClient(player, ...)`** (Script only)  
  Sends arguments to a specific client.
- **`:FireAllClients(...)`** (Script only)  
  Broadcasts arguments to all connected clients.
- **`.OnServerEvent`** (`RBXScriptSignal`)  
  Connected on the server. Listener signature: `function(player, ...)` — `player` is automatically injected. Supports `:Connect()` and `:Disconnect()`.
- **`.OnClientEvent`** (`RBXScriptSignal`)  
  Connected on the client. Listener signature: `function(...)`. Supports `:Connect()` and `:Disconnect()`.

#### Value Rehydration
Complex Luau values (`Vector3`, `CFrame`, `Color3`, and `Instance` references) sent across the bridge are automatically rebuilt on the receiving end with full native metatables.

---

### RemoteFunction
Supports two-way synchronous request-response calls.

#### API Methods & Callbacks
- **`:InvokeServer(...)`** (LocalScript only)  
  Invokes the server handler and yields until a return value is received.
- **`:InvokeClient(player, ...)`** (Script only)  
  Invokes the client handler and yields until a return value is received.
- **`.OnServerInvoke`** (`function(player, ...)`)  
  Callback assigned on the server. Must return the response values.
- **`.OnClientInvoke`** (`function(...)`)  
  Callback assigned on the client. Must return the response values.

#### Example
```lua
-- In ReplicatedStorage: RemoteFunction named "GetPlayerData"

-- Server (Script):
local RemoteFunction = game:GetService("ReplicatedStorage"):WaitForChild("GetPlayerData")
RemoteFunction.OnServerInvoke = function(player, queryKey)
    return { coins = 500, level = 12 }
end

-- Client (LocalScript):
local RemoteFunction = game:GetService("ReplicatedStorage"):WaitForChild("GetPlayerData")
local data = RemoteFunction:InvokeServer("stats")
print("Player Coins:", data.coins)
```

---

## Universal `Instance` Methods & Properties

Every service and instance in the Explorer tree inherits from the base `Instance` proxy:

### Properties
- **`.Name`** (`string`, read/write): The display name in the Explorer and tabs.
- **`.ClassName`** (`string`, read-only): The Roblox class name (`"Workspace"`, `"Part"`, `"Model"`, `"Frame"`, etc.).
- **`.Parent`** (`Instance`, read/write): The parent instance. Setting to `nil` removes the node; setting to another instance reparents it.
- **`.Archivable`** (`boolean`, read/write): Controls if `:Clone()` copies this object.

### Hierarchy Methods
- **`:FindFirstChild(name, recursive?)` -> `Instance` \| `nil`**  
  Searches direct children (or all descendants if `recursive = true`).
- **`:FindFirstChildWhichIsA(className, recursive?)` -> `Instance` \| `nil`**  
  Finds the first child matching or inheriting from `className`.
- **`:FindFirstChildOfClass(className)` -> `Instance` \| `nil`**  
  Finds the first child with exact `className`.
- **`:WaitForChild(name)` -> `Instance`**  
  Yields/retrieves a child by name.
- **`:GetChildren()` -> `table`**  
  Returns an array of all direct child instances.
- **`:GetDescendants()` -> `table`**  
  Returns a flattened array of all recursive descendant instances.
- **`:IsA(className)` -> `boolean`**  
  Checks class inheritance (e.g. `Texture:IsA("Decal")` -> `true`, `TextButton:IsA("GuiObject")` -> `true`).

### Lifecycle Methods
- **`:Destroy()`**  
  Removes the instance and its children from the scene.
- **`:ClearAllChildren()`**  
  Removes all child instances while keeping the parent intact.
- **`:Clone()` -> `Instance`**  
  Deep copies the instance and its descendants, generating unique IDs.

### Model & Pivot Methods (for `Model` and `Part`)
- **`.PrimaryPart`** (`Part`, read/write)
- **`:SetPrimaryPartCFrame(cframe)`**
- **`:GetPrimaryPartCFrame()` -> `CFrame`**
- **`:PivotTo(cframe)`**
- **`:GetPivot()` -> `CFrame`**
- **`:MoveTo(vector3)`**

### Physics & 3D Properties (for `Part` and physical instances)
- **`.Position`** (`Vector3`): 3D world position.
- **`.CFrame`** (`CFrame`): 3D position and orientation matrix.
- **`.Rotation`** / **`.Orientation`** (`Vector3`): Rotation in radians or Euler degrees.
- **`.Size`** (`Vector3`): Extents in studs.
- **`.Velocity`** / **`.AssemblyLinearVelocity`** (`Vector3`): Linear momentum vector.
- **`.RotVelocity`** / **`.AssemblyAngularVelocity`** (`Vector3`): Angular momentum vector.
- **`.Anchored`** (`boolean`): Toggles physics body simulation.
- **`.CanCollide`** (`boolean`): Toggles collision detection against other parts.
- **`.CanTouch`** (`boolean`): Enables `.Touched` event firing.
- **`.Color`** / **`.Color3`** (`Color3`): Part surface tint.
- **`.BrickColor`** (`BrickColor`): Palette preset.
- **`.Material`** (`string` / `Enum.Material`): Visual surface material (`Plastic`, `Neon`, `Metal`, etc.).
- **`.Transparency`** (`number`): `0.0` (opaque) to `1.0` (invisible).

### Universal Signals
- **`.Touched`** (`RBXScriptSignal`): Fires when a dynamic physics body intersects. Passes `(otherPart)`.
- **`.TouchEnded`** (`RBXScriptSignal`): Fires when contact separates.
- **UI Signals** (on `TextButton`, `ImageButton`, `TextBox`):
  - `.MouseButton1Click`, `.MouseButton1Down`, `.MouseButton1Up`
  - `.Activated`
  - `.MouseEnter`, `.MouseLeave`
  - `.FocusLost` (passes `enterPressed: boolean`)

---

## Supporting Datatypes & Enums

### Vector3 & Vector2
Native Luau metatables with complete arithmetic:
- **`Vector3.new(x, y, z)`**, `Vector3.zero`, `Vector3.one`, `Vector3.xAxis`, `Vector3.yAxis`, `Vector3.zAxis`
- **`Vector2.new(x, y)`**, `Vector2.zero`, `Vector2.one`, `Vector2.xAxis`, `Vector2.yAxis`
- Arithmetic operators: `+`, `-`, `*`, `/`, unary `-`, `==`
- Methods: `:Dot(other)`, `:Cross(other)`, `:Lerp(target, alpha)`
- Properties: `.Magnitude`, `.Unit`, `.X`, `.Y`, `.Z`

### CFrame
Full 4x4 transformation matrix metatable:
- **`CFrame.new(x, y, z)`**
- **`CFrame.new(pos, lookAt)`**
- **`CFrame.Angles(rx, ry, rz)`** / `CFrame.fromEulerAnglesXYZ`
- **`CFrame.fromEulerAnglesYXZ(rx, ry, rz)`** / `CFrame.fromOrientation`
- **`CFrame.fromAxisAngle(vector3, radians)`**
- **`CFrame.lookAt(eye, target, [up])`**
- **`CFrame.identity`**
- Methods:
  - `:Inverse()`
  - `:ToEulerAnglesXYZ()` / `:ToOrientation()`
  - `:ToEulerAnglesYXZ()`
  - `:PointToWorldSpace(v3)` (`cf * v3`)
  - `:VectorToWorldSpace(v3)`
  - `:PointToObjectSpace(v3)`
  - `:VectorToObjectSpace(v3)`
  - `:GetComponents()`
- Properties: `.Position`, `.p`, `.LookVector`, `.RightVector`, `.UpVector`, `.Rotation`

### Color3 & BrickColor
- **`Color3.new(r, g, b)`** (0 to 1 float range)
- **`Color3.fromRGB(r, g, b)`** (0 to 255 range)
- **`Color3.fromHSV(h, s, v)`**
- **`Color3.fromHex(hexString)`**
- `:Lerp(target, alpha)`
- **`BrickColor.new(nameOrColor3)`**, `BrickColor.random()`, `BrickColor.Red()`, `BrickColor.Blue()`, `BrickColor.White()`, etc.

### UDim & UDim2
- **`UDim.new(scale, offset)`** (`.Scale`, `.Offset`)
- **`UDim2.new(xScale, xOffset, yScale, yOffset)`**
- **`UDim2.fromScale(xScale, yScale)`**
- **`UDim2.fromOffset(xOffset, yOffset)`**
- Arithmetic (`+`, `-`, `==`), `:Lerp(target, alpha)`

### TweenInfo & Enums
- **`TweenInfo.new(time, easingStyle?, easingDirection?, repeatCount?, reverses?, delayTime?)`**
- **`Enum.EasingStyle`**: `Linear`, `Quad`, `Sine`, `Back`, `Bounce`, `Elastic`, `Exponential`, `Circular`, `Cubic`, `Quart`, `Quint`
- **`Enum.EasingDirection`**: `In`, `Out`, `InOut`
- **`Enum.PlaybackState`**: `Begin`, `Delayed`, `Playing`, `Paused`, `Completed`, `Canceled`
- **`Enum.Material`**: `Plastic`, `SmoothPlastic`, `Neon`, `Wood`, `Metal`, `Glass`, `Brick`, `Concrete`
- **`Enum.NormalId`**: `Top`, `Bottom`, `Front`, `Back`, `Left`, `Right`
- **`Enum.Technology`**: `ShadowMap`, `Future`, `Voxel`, `Compatibility`
- **`Enum.KeyCode`**: Comprehensive enumeration covering all standard keyboard keys (`Space`, `Return`, `W`, `A`, `S`, `D`, `LeftShift`, `Escape`, etc.)

---

## Task Scheduler & Thread Management

The runtime replaces blocking execution with a non-preemptive coroutine task scheduler:

| Function | Signature | Description |
| :--- | :--- | :--- |
| `task.wait(sec?)` | `(sec?: number) -> number` | Yields the calling coroutine without blocking the UI thread. Resumes on frame tick and returns the delta time `dt`. |
| `task.spawn(fn, ...)` | `(fn: function, ...) -> thread` | Spawns and executes a new thread immediately. |
| `task.delay(sec, fn, ...)`| `(sec: number, fn: function, ...) -> thread` | Schedules execution of `fn` after the specified delay. |
| `task.defer(fn, ...)` | `(fn: function, ...) -> thread` | Defers execution to the end of the current scheduler cycle. |
| `task.cancel(thread)` | `(co: thread) -> void` | Cancels a pending or suspended thread. |
| `wait(sec?)` | `(sec?: number) -> number` | Legacy alias for `task.wait`. |
| `spawn(fn)` | `(fn: function) -> thread` | Legacy alias for `task.spawn`. |
| `delay(sec, fn)` | `(sec: number, fn: function) -> thread` | Legacy alias for `task.delay`. |
| `tick()` | `() -> number` | Returns the current UNIX epoch timestamp in fractional seconds. |
| `time()` | `() -> number` | Returns runtime duration in seconds. |
| `typeof(value)` | `(v: any) -> string` | Returns Roblox-specific datatype name (e.g. `"Vector3"`, `"CFrame"`, `"Instance"`). |
| `require(moduleScript)` | `(m: Instance) -> any` | Executes and memoizes a `ModuleScript`, returning its exported table. |
| `Instance.new(className, parent?)` | `(c: string, p?: Instance) -> Instance` | Instantiates real 3D parts, GUI elements, lights, effects, and remote objects. |
