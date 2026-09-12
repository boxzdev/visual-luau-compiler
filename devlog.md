# Devlog: Visual Luau Compiler

## Environment Setup
- Initialized a React 19 + Vite 6 + Tailwind CSS 4 project using TypeScript.
- Resolved PowerShell execution policy issues to run `npm` scripts seamlessly.
- Configured Node.js PATH internally for execution.
- Cleaned up Google AI Studio scaffolding files (`.env.example`, `metadata.json`) to keep the workspace clean.

## Core Interface & UX
- **Explorer Tree**: Built a recursive Roblox-style explorer tree with draggable scripts and folders. Includes search filtering, right-click context menus, and collapsible nodes.
- **Tab System**: Developed a functional tab interface for opening multiple scripts (ServerScript, LocalScript, ModuleScript) and navigating back to the 3D Viewport.
- **Output Panel**: Created a resizable output panel at the bottom with color-coded logs (blue for prints, yellow for warnings, red for errors, gray for system).
- **Status Bar**: Implemented a responsive editor status bar tracking the current line, column, and total line count.

## Script Editor
- **Initial Implementation**: Started with a custom `<textarea>` code editor featuring rudimentary line numbers and manual Tab/Enter indentation logic.
- **Monaco Editor Upgrade**: Completely replaced the `<textarea>` with `@monaco-editor/react`, the core engine behind VS Code. 
  - **Features gained**: Full Lua syntax highlighting, perfect line number synchronization, smooth scrolling, and advanced auto-indentation.

## Lua Engine Integration
- **Wasmoon**: Integrated the `wasmoon` WebAssembly Lua engine to execute Lua code directly in the browser.
- **Roblox Globals**: Mocked essential Roblox globals to mirror the Luau environment:
  - `print`, `warn`, `error` (redirected to the Output panel)
  - `Vector3`, `Color3`, `CFrame`, `Instance`, `BrickColor`
  - `game`, `workspace`, `script`
  - `task.wait`, `task.spawn`, `task.delay`, `task.defer`, `task.cancel`, `wait`, `tick`, `time`, `typeof`, `require`
- **Execution Flow**: Added a "Play" button in the toolbar that crawls the Explorer tree, collects all scripts, and executes them concurrently as separate coroutines in the Wasmoon VM.

## Cleanups & Polish
- Removed hardcoded dummy text ("DataModel Loading...") from the initial Output logs.
- Removed boilerplate `MainScript` and the placeholder code to give a clean slate.
- Simplified the toolbar by removing the "Run Current Script" button, emphasizing the global "Play" button that runs all scripts found in the Explorer.
- Refined the 3D Viewport placeholder text to reflect the simplified "Play" execution flow.

## 3D Environment & Workspace
- **True 3D Viewport**: Replaced the placeholder screen with a real `@react-three/fiber` canvas powered by Three.js.
- **Studio Camera Controls**: Implemented a custom `StudioControls` component allowing users to orbit (left click), pan (right click), zoom (scroll), and fly around (WASD/QE) just like Roblox Studio.
- **Explorer ↔ Viewport Sync**: The 3D scene is fully synchronized with the Explorer tree. Adding or deleting parts in the Explorer instantly updates the 3D environment, and vice versa.
- **Object Renaming**: Implemented standard "double-click to rename" logic for all items in the Explorer. Renaming a script tab also updates its tab header.

## Transform Tools
- **Tool Buttons**: Added a toolbar with four Roblox Studio-style tools next to the Play button:
  - **Select** (cursor icon) — selects a part without showing any gizmo.
  - **Move** (arrows icon) — shows a 3-axis translation gizmo to reposition parts.
  - **Scale** (maximize icon) — shows a scale gizmo to resize parts.
  - **Rotate** (rotate icon) — shows a rotation gizmo to spin parts.
- **Click-to-Select**: Clicking a part in the 3D viewport selects it and highlights it in the Explorer. Clicking empty space deselects.
- **Persistent Transforms**: Position, rotation, and scale are saved to the tree node data the instant you release the gizmo handle (via the `dragging-changed` event on Three.js `TransformControls`). Values persist across selection changes.

## Bug Fixes
- **Position Reset Bug**: Fixed a critical bug where moved parts would snap back to their original position when clicking away. Root cause: the mesh was being remounted when `TransformControls` unmounted. Fix: separated the `<mesh>` from `<TransformControls>` — the mesh now lives independently and TransformControls attaches to it via the `object` prop, so the mesh is never remounted.
- **Jumping Parts**: Fixed generic parts using `Math.random()` for Y position, which caused them to jump on every re-render. Replaced with deterministic default positions.
- **Line Numbers Stuck at 30**: Fixed by upgrading to Monaco Editor which handles line numbers natively.
- **Line Number Alignment**: Fixed cursor line and gutter numbers being out of sync by replacing the custom textarea with Monaco Editor.
- **Infinite Loop Freeze**: `while true do task.wait() end` used to freeze the browser because `await engine.doString()` never returned. Fixed by rewriting the entire Lua execution model to use a coroutine-based scheduler.

## Lua Runtime Scheduler & Task Library
- **Coroutine-Based Execution**: Completely replaced the old `await engine.doString()` approach with a custom Lua coroutine scheduler. Scripts now `coroutine.yield("WAIT", seconds)` back to JavaScript, which resumes them via `setTimeout`. This means infinite loops with `task.wait()` work perfectly without freezing the browser.
- **Delta Time Returns**: `task.wait()` and `wait()` now compute and return the actual delta time (`dt`) in seconds upon resume.
- **`task` API Suite**: Implemented `task.wait`, `task.spawn`, `task.delay`, `task.defer`, and `task.cancel`.
- **`LuaRuntime` Class**: Encapsulated all Lua engine lifecycle (start, step, stop) into a reusable class with proper cleanup.
- **Multi-Script Support**: All scripts in the Explorer are loaded as separate coroutines and run concurrently in the same VM, just like Roblox Studio.

## Full CFrame & Vector Math Engine
- **Native Lua Metatables**: Implemented comprehensive metatables inside Lua for complete arithmetic and performance fidelity.
- **CFrame Constructors & Math**:
  - `CFrame.new(...)` (all overloads: position, quaternion, 12-component matrix, `lookAt`).
  - `CFrame.Angles(rx, ry, rz)`, `CFrame.fromEulerAnglesXYZ`, `CFrame.fromEulerAnglesYXZ`, `CFrame.fromOrientation`.
  - `CFrame.fromAxisAngle(v, rad)`, `CFrame.lookAt(eye, target, up)`, `CFrame.identity`.
  - Matrix multiplication (`cf1 * cf2`), vector transformation (`cf * vec3`), translation (`cf + vec3`, `cf - vec3`).
  - CFrame methods & components: `:ToEulerAnglesXYZ()`, `:ToEulerAnglesYXZ()`, `:Inverse()`, `:Lerp()`, `:PointToWorldSpace()`, `:VectorToWorldSpace()`, `:GetComponents()`.
  - Direction vectors: `.LookVector`, `.RightVector`, `.UpVector`, `.Position` / `.p`, `.Rotation`.
- **Vector3 Math**:
  - Full arithmetic (`+`, `-`, `*`, `/`, unary `-`).
  - Vector methods: `:Dot()`, `:Cross()`, `:Lerp()`, `.Magnitude`, `.Unit`, `xAxis`, `yAxis`, `zAxis`, `zero`, `one`.
- **Color3 & BrickColor**:
  - `Color3.new`, `Color3.fromRGB`, `Color3.fromHSV`, `Color3.fromHex`, `:Lerp()`.
  - `BrickColor.new`, `BrickColor.random()`, predefined colors (`BrickColor.Red()`, `BrickColor.Blue()`, etc.).

## Live Scripting & Hierarchy Traversal
- **`script.Parent` Support**: Scripts now execute in their own isolated environment where `script` is a live Instance proxy linked to their location in the Explorer hierarchy.
- **Recursive Dot-Access**: `script.Parent.Part` and nested properties work seamlessly via JavaScript `Proxy` hooks that dynamically resolve child instances by name.
- **Live `part.CFrame`**: Getting `part.CFrame` returns an active Lua `CFrame` table. Setting `part.CFrame = ...` extracts the 3D position and Euler orientation, updating the Three.js viewport mesh in real-time.
- **Dynamic Size & Material Sync**: `part.Size = Vector3.new(...)` and `part.Color = ...` / `part.BrickColor = ...` immediately update the 3D geometry and materials in the viewport.
- **Hierarchy Manipulation**: Full support for `part.Parent = ...`, `part:Destroy()`, `part:Clone()`, `FindFirstChild`, `FindFirstChildWhichIsA`, `FindFirstChildOfClass`, `WaitForChild`, `GetChildren`, `GetDescendants`, `IsA`, and `ClearAllChildren`.

## Properties Panel
- **Roblox Studio-Style Inspector**: Added a dedicated Properties panel below the Explorer in the sidebar. Selecting any part, script, or service in the Explorer or 3D viewport instantly populates its properties.
- **Filter Properties**: Implemented property search filtering with keyboard shortcut support (`Ctrl+Shift+P`).
- **Collapsible Sections & Live Functional Editing**:
  - **Collision**: `CanCollide`, `CanTouch`.
  - **Part (Data & Transform)**: `Anchored`, `Shape` (Block, Ball, Cylinder), `Material` (Plastic, SmoothPlastic, Neon, Metal, Glass, Wood), `Color` (color picker + hex), `BrickColor` (palette presets), `Transparency`, `Position` (X, Y, Z), `Orientation` (Euler degrees X, Y, Z), `Size` (X, Y, Z).
  - **Data / Identity**: `Name` (synchronized across Explorer and tabs), `ClassName`, `Parent`, `Disabled` (for scripts).
- **Two-Way Synchronization**:
  - Changing values in the Properties panel immediately updates the 3D scene and Lua runtime state.
  - Lua scripts (e.g. `part.Anchored = false`, `part.Transparency = 0.5`, `part.Color = ...`) and 3D transform gizmos automatically update the Properties panel in real-time.
- **3D Geometry & Material Rendering**: Three.js viewport renders shapes (`sphereGeometry`, `cylinderGeometry`, `boxGeometry`), material emissiveness (Neon glow), transparency, and materials.

## Real-Time 3D Physics Engine & Gravity
- **Dynamic Physics Simulation**: Integrated a multi-substep 3D physics simulator (`PhysicsEngine`) that runs during Gameplay mode.
- **Gravity Simulation**: Unanchored parts (`Anchored = false`) accelerate downward with realistic gravity and air damping.
- **Collision Detection & Resting Contact**:
  - Parts with `CanCollide = true` collide against the Baseplate (at Y=0) and other static/dynamic parts.
  - Features resting contact resolution and slight restitution bounce.
  - Non-collidable parts (`CanCollide = false`) pass through objects.
- **Lua Script Physics Integration**:
  - `workspace.Gravity`: Lua scripts can read/write gravity in real-time.
  - `part.Velocity` / `part.AssemblyLinearVelocity`: Lua scripts can apply linear velocities to launch parts.
  - `part.Anchored`: Toggling anchored state dynamically attaches/detaches parts from physics.
- **Physics-Only Play**: Pressing Play simulates physics even when 0 scripts are in the Explorer. Stopping Play cleanly resets all transforms to their edit state.

## Server & Client Gameplay Modes
- **Dual Runtime Architecture**: Pressing Play now spins up **two independent Lua runtimes** simultaneously — one for server-side `Script` execution and one for client-side `LocalScript` execution — each operating on its own isolated copy of the scene tree.
- **Server Gameplay View**: Shows the world as the server sees it. Only changes made by `Script` nodes are visible here. LocalScript effects are invisible — exactly like Roblox Studio's server view.
- **Local Gameplay (Client) View**: Shows the world as the client sees it. `LocalScript` changes (e.g. a part rotating) are visible here but not in the server view.
- **Live Mode Switching**: A dropdown chevron on the Gameplay tab lets you switch between Server and Client views at any time during a running session. The tab icon and label update dynamically:
  - 🌐 **Server Gameplay** (Globe icon, blue)
  - 🖥️ **Local Gameplay** (Monitor icon, green)
- **ModuleScript Shared Access**: `ModuleScript` code is available to both runtimes via `require()`, each maintaining its own cached copy.
- **Independent Physics**: Each runtime tree tracks its own physics state, so unanchored parts behave independently per environment.

## Client-Server Remote Communication
- **RemoteEvent & RemoteFunction Instances**: Added as insertable object types in the Explorer's "Insert Object" menu (right-click any container, e.g. `ReplicatedStorage`) with distinct icons — a lightning bolt for `RemoteEvent`, a bidirectional arrow for `RemoteFunction` — matching how they're inserted in real Roblox Studio. Also creatable at runtime via `Instance.new("RemoteEvent", parent)` / `Instance.new("RemoteFunction", parent)`.
- **Cross-VM Bridge**: Since Server and Client scripts run in two fully separate Wasmoon Lua VMs with separate trees, a new `RemoteBridge` (`globalRemoteBridge`) acts as the out-of-band channel connecting them, keyed by the remote instance's replicated node id. It's reset at the start and end of every Play session so connections never leak between runs.
- **RemoteEvent API**: `:FireServer(...)` (LocalScript → Script), `:FireClient(player, ...)` / `:FireAllClients(...)` (Script → LocalScript), and `.OnServerEvent` / `.OnClientEvent` as connectable `RBXScriptSignal`-like objects returning a real `Disconnect()`-able connection.
- **RemoteFunction API**: `:InvokeServer(...)` / `:InvokeClient(player, ...)` with synchronous return values, driven by assignable `.OnServerInvoke` / `.OnClientInvoke` handler functions.
- **Roblox-accurate call rules enforced**: `FireServer`/`InvokeServer` throw if called from a Script (server), and `FireClient`/`FireAllClients`/`InvokeClient` throw if called from a LocalScript (client) — exactly like real Roblox.
- **Typed Value Rehydration**: Vector3, CFrame, Color3, and nested Instance references sent through a Remote are rebuilt on the receiving side using that VM's own constructors, so they arrive as fully native Luau values (correct metatables, arithmetic, `.Magnitude`, etc.) rather than inert plain tables.
- **Implicit Local Player**: Since there's no multiplayer session, `FireServer`/`InvokeServer` calls automatically pass a lightweight `Player1` placeholder as the first argument to `OnServerEvent`/`OnServerInvoke`, matching the real `(player, ...)` signature scripts expect.
- **Best Practice Placement**: Following Roblox convention, RemoteEvents/RemoteFunctions should be parented under `ReplicatedStorage` so both Server and Client scripts can see them — they replicate down to the client automatically via the existing Server→Client tree replication.

## UI Cleanup
- Removed the "Left click to orbit, Right click to pan, WASD to fly" overlay from the 3D viewport.
- Removed system log spam ("Execution stopped", "Starting physics simulation...", "Starting simulation & script execution...") from the Output panel — it now only shows actual script output and errors.

## Bug Fixes — 2026-08-24
- **Missing `fireInstanceSignal` Export**: Added the missing exported helper used by the physics touch-event path, fixing the runtime module import error.
- **Instance Vector3 Methods**: Preserved Vector3 behavior for values returned by Instance properties such as `part.Position`, `Velocity`, `Rotation`, `Orientation`, and `Size`, including `:Lerp()`.
- **Lua Instance Marshalling**: Added Lua-side Instance wrapping so JavaScript proxy values are converted into native Luau Vector3 values before arithmetic or Vector3 methods are used.
- **RunService Service Preservation**: Kept wrapped engine services intact so `RunService.Heartbeat` remains available after Instance value conversion.
- **Heartbeat Wait Channel**: Corrected the raw signal lookup used by `RunService.Heartbeat:Wait()`, allowing coroutine-based animation and Boids loops to resume every frame.
- **Color3 Marshalling**: Rehydrated colors returned by Instance properties as native Luau Color3 values, restoring `part.Color:Lerp(...)` for smooth color transitions.
- **Descendant Instance Wrapping**: Wrapped Instances returned by `GetChildren()` and `GetDescendants()` so descendant parts expose native properties and Color3 methods such as `:Lerp()`.

## Bug Fixes — 2026-08-25
- **TweenService Silently Doing Nothing**: Fixed tweens (e.g. `TweenService:Create(part, info, {Position = ...}):Play()`) running with no errors and firing `Completed`, but never actually moving/changing the part. Root cause: the Lua-side instance passed into `:Create()` is a metatable-only wrapper table (empty aside from `__index`/`__newindex`) used so Lua property access can forward to the real JS instance. Lua tables cross back into JS by raw key/value copy, which never invokes metamethods — so JS was receiving a completely empty, disconnected object and animating properties on it instead of the real part. Fix: the target's `__nodeId` is now read out on the Lua side (a real metamethod-driven read, so it still works) and passed across as a plain string; JS rebuilds a live instance proxy from that id before tweening, so `Position`, `Size`, `Color`, `CFrame`, etc. all correctly animate and persist to the scene tree.
- **Build Error from Embedded Lua Comment**: Fixed a Vite/esbuild transform failure (`Expected ")" but found "target"`) introduced by the TweenService fix above. Cause: the injected Lua runtime code lives inside a JS template literal, and an explanatory Lua comment used literal backticks, which prematurely closed the JS string. Removed the backticks from the comment.

## Bug Fixes — 2026-08-26
- **Physics Infinite Edge Balancing**: Fixed a physics engine bug where falling parts could land exactly on an edge or corner and balance indefinitely without ever tipping over into a flat resting state. Root causes:
  1. The box contact point calculation was center-weighted (`overlapMid`), meaning the upward normal force from the floor resulted in `0` torque being applied to the physics body, providing no rotational energy to tip it flat.
  2. The positional correction solver (Baumgarte stabilization) was strictly resolving penetration by translating objects directly upward out of the floor, completely bypassing rotational adjustments.
  Fix: Replaced the center-weighted contact logic with a dedicated `getSupport` directional vertex point algorithm to find the true deepest penetration corner/edge. Also upgraded the positional correction loop to compute and apply rotational impulses alongside positional movement, forcing off-balance geometries to naturally settle flat against the surface.

- **Moved Sleeping Parts Ignoring Gravity**: Fixed a bug where a stable part moved with the gameplay transform gizmo would remain still instead of falling. Root cause: the physics body could remain asleep after its position was changed in the runtime tree, so the next simulation step skipped gravity integration. Gameplay transform updates now wake the body and clear its stale linear and angular velocities before physics resumes.
- **Resized Parts Keeping Default Hitboxes**: Fixed collision detection using only the default `size` dimensions when a part was resized with the Scale tool. Physics now combines each part's configured `size` with its current `scale` every simulation step, and uses those effective dimensions for collision shapes, mass, and inertia.
- **Part Touch Signals**: Added `BasePart.Touched` and `BasePart.TouchEnded` to Lua Instance proxies. Physics contact events now invoke connected Lua callbacks with the other part as a live Instance proxy, enabling scripts that destroy parts when they touch the ground.
- **Client Gameplay Gravity**: Fixed Local Gameplay displaying the client tree while physics was still simulating and updating only the server tree. The physics simulator now steps and writes updates to the active gameplay tree, so unanchored client parts fall correctly.
- **Unsupported Stacks After Moving Support**: Fixed sleeping parts staying suspended when the lower supporting part was moved away. External transform changes now wake sleeping dynamic bodies before contact detection, allowing unsupported upper parts and stacks to fall under gravity.

## Lighting System and Property Upgrade — 2026-08-28
- Expanded `TreeNodeData` and `LIGHTING_DEFAULTS` with a complete Lighting state model:
  - Environment: `Ambient`, `OutdoorAmbient`, `Brightness`, `ColorShift_Top`, `ColorShift_Bottom`.
  - Time and celestial controls: `ClockTime`, `TimeOfDay`, `GeographicLatitude`, and `SunAngle`.
  - Fog and rendering: `FogColor`, `FogStart`, `FogEnd`, `GlobalShadows`, `ShadowSoftness`, `ExposureCompensation`, `EnvironmentDiffuseScale`, and `EnvironmentSpecularScale`.
  - Feature toggles: `SkyEnabled`, `FogEnabled`, and `AmbientIntensity`.
- Upgraded `PropertiesPanel.tsx` with a searchable, collapsible Lighting inspector. It supports color pickers and numeric controls, clamps values to valid ranges, and keeps `ClockTime` and `TimeOfDay` synchronized.
- Added live Lua Lighting properties in `luaRunner.ts` through getter/setter proxies. Supported properties include `Ambient`, `OutdoorAmbient`, `Brightness`, `ColorShift_Top`, `ColorShift_Bottom`, `ClockTime`, `TimeOfDay`, `GeographicLatitude`, `FogColor`, `FogStart`, `FogEnd`, `ShadowSoftness`, `GlobalShadows`, `ExposureCompensation`, `EnvironmentDiffuseScale`, `EnvironmentSpecularScale`, `SkyEnabled`, `FogEnabled`, `AmbientIntensity`, and `SunAngle`.
- Added Lighting methods:
  - `Lighting:SetMinutesAfterMidnight(minutes)` updates the simulated time.
  - `Lighting:GetMinutesAfterMidnight()` returns the current time in minutes.
  - `Lighting:GetSunDirection()` returns the calculated sun direction as a live `Vector3`.
  - `Lighting:GetMoonDirection()` returns the calculated moon direction as a live `Vector3`.
- Added support for child lighting objects through the same Lua property bridge:
  - `PointLight`, `SpotLight`, and `SurfaceLight`: `Range`, `Brightness`, `Color`, `Shadows`, `Angle`, `Face`, and `Enabled`.
  - `Sky`: six skybox properties, `SunAngularSize`, `MoonAngularSize`, `CelestialBodiesShown`, and `StarCount`.
  - `Atmosphere`: `Density`, `Offset`, `Decay`, `Glare`, and `Haze`.
  - Post-processing effects: `Brightness`, `Contrast`, `Saturation`, `TintColor`, `Intensity`, `Threshold`, `Spread`, `EffectSize`, `FarIntensity`, `FocusDistance`, `InFocusRadius`, and `NearIntensity` where applicable.
- `App.tsx` now renders the Lighting state through `SceneLighting` and `RobloxSkyDome`: procedural day/night sky, asset-backed `R_Assets/Sun.png` and `R_Assets/Moon.png` sprites, sun and moon direction, stars, ambient and hemisphere light, directional shadows, fog, tone-mapping exposure, atmospheric haze/decay, and color shifts update as the tree changes.
- Sun and moon are distant, camera-facing sky sprites with depth writing disabled and no physics or interaction, matching Roblox behavior where celestial bodies are visual sky elements that cannot be reached or walked on.
- `App.tsx` routes panel and Lua updates through `updateActiveTree`, so Lighting changes stay synchronized in edit mode and in the active Server or Client gameplay tree.

---

### Supported Roblox Globals
| Global | Status | Description |
|--------|--------|-------------|
| `print`, `warn`, `error` | ✅ | Color-coded logs redirected to the Output panel |
| `Vector3` | ✅ | Full metatable math (`+`, `-`, `*`, `/`, `.Magnitude`, `.Unit`, `:Dot()`, `:Cross()`, `:Lerp()`) |
| `CFrame` | ✅ | Full matrix math (`*`, `+`, `-`, `Angles`, `lookAt`, `fromAxisAngle`, `Inverse`, `Lerp`, `ToEulerAnglesXYZ`) |
| `Color3` | ✅ | `.new`, `.fromRGB`, `.fromHSV`, `.fromHex`, `:Lerp()` |
| `BrickColor` | ✅ | `.new`, `.random()`, standard color palette presets |
| `Instance.new` | ✅ | Creates real parts rendered in 3D and in Explorer |
| `part.CFrame` | ✅ | Real-time getter and setter synchronized with Three.js |
| `part.Position` / `Rotation` / `Orientation` / `Size` | ✅ | Real-time getters and setters |
| `part.Color` / `BrickColor` | ✅ | Real-time mesh color updates |
| `script.Parent` | ✅ | Full hierarchy traversal and dynamic dot-indexing |
| `workspace` / `game.Workspace` | ✅ | Live proxy with dynamic child indexing |
| `game:GetService(...)` | ✅ | Supports Workspace, Players, Lighting, ReplicatedStorage, etc. |
| `task.wait`, `wait` | ✅ | Non-blocking via coroutines, returns delta time (`dt`) |
| `task.spawn`, `task.delay`, `task.defer`, `task.cancel` | ✅ | Full thread management |
| `tick`, `time`, `typeof` | ✅ | Supported |
| `Script` & `LocalScript` | ✅ | `Script` only executes in **Server Gameplay**, `LocalScript` only executes in **Local Gameplay** (Client). Respects `.Disabled` property. |
| `ModuleScript` | ✅ | Code is fully isolated. Calling `require()` properly executes and caches the module's returned table. |
| `FindFirstChild`, `WaitForChild`, `GetChildren`, `GetDescendants` | ✅ | Supported on all instances |
| `part:Destroy()`, `part:Clone()`, `part.Parent = ...` | ✅ | Full lifecycle and reparenting |
| `Model` & `Folder` | ✅ | Container instances with full hierarchy, `IsA`, `PrimaryPart`, `:GetPivot()`, `:PivotTo()`, and `:MoveTo()` |
| `Decal` & `Texture` | ✅ | Face projection on Parts (`Front`, `Back`, `Top`, `Bottom`, `Left`, `Right`), Roblox asset ID resolution (`rbxassetid://<id>` / numeric ID / direct URL), `Color3`, `Transparency`, and repeat tiling via `StudsPerTileU`/`StudsPerTileV` |

## Skybox Celestial Rendering — 2026-08-28
- Replaced the procedural sun and moon geometry with the supplied `R_Assets/Sun.png` and `R_Assets/Moon.png` textures.
- Rendered both assets as transparent, camera-facing sprites with their size controlled by `SunAngularSize` and `MoonAngularSize`.
- Grouped the stars, sun, and moon in one camera-relative skybox layer so they move together with the sky instead of existing as reachable world objects.
- Kept celestial positioning driven by `ClockTime`, `GeographicLatitude`, and `SunAngle`; visibility still follows `CelestialBodiesShown` and day/night elevation.
- Disabled depth writing for the sprites and kept them outside physics and interaction, matching Roblox behavior where the sun, moon, and stars are unreachable sky elements.

## Viewport Tool Selection — 2026-08-28
- Set the default viewport tool to `Select`.
- Made `Select` passive in the 3D environment: clicking a part no longer changes the Workspace or Properties selection, and clicking empty space no longer clears it.
- Kept environment selection enabled for `Move`, `Scale`, and `Rotate`, allowing those tools to select the target part before transforming it.

## Lighting Element Properties — 2026-08-28
- Fixed the Lua property bridge for `PointLight`, `SpotLight`, and `SurfaceLight` instances.
- Standard Roblox properties now map to the fields used by the inspector and renderer:
  - `Light.Brightness` reads and writes `lightBrightness`.
  - `Light.Color` reads and writes `lightColor`.
- Lua changes to light brightness and color now update the Properties panel and the rendered Three.js light correctly.
- Preserved existing `Lighting.Brightness` and Part `Color` behavior by applying the light-specific mapping only to light instances.

## SpotLight / SurfaceLight Face Selection Fix — 2026-08-29
- Fixed the `Face` property dropdown for `SpotLight` and `SurfaceLight` being non-functional — changing the value had no effect on the rendered light direction.
- Created a `SpotLightWithFace` helper component that wraps a Three.js `spotLight` with a target `object3D`, positioning the target along the direction vector corresponding to the selected face.
- Face-to-direction mapping follows Roblox conventions: `Front → −Z`, `Back → +Z`, `Top → +Y`, `Bottom → −Y`, `Left → −X`, `Right → +X`.
- Changing the Face dropdown in the Properties panel now immediately re-aims the spotlight in the 3D viewport.

## Visual Luau Compiler Online, Containers & Code Editor Auto-Nesting — 2026-09-07
- **Application Rebranding**:
  - Renamed the project from default `"My Google AI Studio App"` to **Visual Luau Compiler Online** in `index.html` (title, meta description, and open graph tags).
  - Updated package name in `package.json` to `visual-luau-compiler-online`.
  - Added "Visual Luau Compiler Online" branding to the main top toolbar in `App.tsx`.
- **Model and Folder Containers**:
  - Implemented `Model` and `Folder` container elements in the Explorer tree and Luau runtime.
  - Added `Model: 'model'` and `Folder: 'folder'` support in `Instance.new()`.
  - Extended `ClassName` to return `'Model'` and `'Folder'`, and added runtime `IsA("Model")` / `IsA("Folder")` support.
  - Implemented Model manipulation methods and properties:
    - `PrimaryPart` getter and setter referencing child Part proxies.
    - `:SetPrimaryPartCFrame(cf)` and `:GetPrimaryPartCFrame()`.
    - `:PivotTo(cf)` and `:GetPivot()`.
    - `:MoveTo(vec3)` to translate all child parts relative to the model's primary part or bounding center.
  - Rendered with distinct icons in Explorer: `Boxes` (cyan) for Model and `Folder` (yellow) for Folder.
  - 3D viewport rendering and physics simulation pass transparently through container hierarchies, simulating and rendering nested parts accurately.
  - In `PropertiesPanel`, added `ClassName` display and a `PrimaryPart` selector for Model instances.
- **Unified & Scrollable "Insert Object" Context Menu**:
  - Removed conditional target restrictions (e.g. `isLightingTarget`) so all elements can be inserted on any target in the Explorer.
  - Full element catalog: `Model`, `Folder`, `Part`, `Script`, `LocalScript`, `ModuleScript`, `PointLight`, `SpotLight`, `SurfaceLight`, `RemoteEvent`, `RemoteFunction`, `Sky`, `Atmosphere`, `ColorCorrectionEffect`, `BloomEffect`, `SunRaysEffect`, and `BlurEffect`.
  - Compacted menu height to `max-h-[300px]` with a sticky `"Insert Object"` header and clean `custom-scrollbar` scrolling.
  - Added viewport coordinate clamping to guarantee the menu stays on-screen when right-clicking near bottom or right edges.
- **Roblox Studio-Style Code Editor Auto-Nesting**:
  - Configured Monaco editor Lua language rules (`indentationRules`, `brackets`, `autoClosingPairs`, `onEnterRules`).
  - Implemented Enter key interception to mirror Roblox Studio's code editor behavior:
    - Automatically indents next line (+4 spaces).
    - Automatically checks for unclosed blocks on `if ... then`, `while ... do`, `for ... do`, `function ...()`, `local function ...()`, `repeat`, and `...Connect(function()`.
    - Automatically appends the matching `end`, `end)`, or `until ` on the line below at the base indentation level, positioning the cursor inside the block.
    - Continuation statements (`else`, `elseif ... then`) indent properly without appending extra `end` statements.
    - Outdents lines when typing `end`, `until`, `else`, `elseif`.
  - Enabled Monaco options: `autoIndent: 'full'`, `formatOnType: true`, `autoClosingBrackets: 'always'`, `autoClosingQuotes: 'always'`.

## Decal and Texture Elements with Roblox Asset ID Resolution — 2026-09-07
- **Roblox Asset ID Resolution & Proxy Integration**:
  - Configured Vite development server proxy at `/api/roblox-thumbnail` pointing to `https://thumbnails.roblox.com` with `changeOrigin: true` to bypass browser CORS limitations.
  - Implemented asynchronous asset resolver `resolveRobloxAssetUrl(input)` supporting:
    - `rbxassetid://<id>` (e.g., `rbxassetid://1818`)
    - Roblox asset URLs (e.g., `http://www.roblox.com/asset/?id=1818`)
    - Raw numeric IDs (e.g., `"1818"`)
    - Standard web URLs (`https://...`, `http://...`, `data:image/...`, `blob:...`)
  - Integrated in-memory resolution cache `assetUrlCache` to prevent redundant network requests and avoid visual flickering.
- **3D Surface Projection & Three.js Rendering**:
  - Created `<PartDecalOrTexture>` component rendering planes precisely aligned with Part faces:
    - `Front`: Normal faces `-Z`
    - `Back`: Normal faces `+Z`
    - `Top`: Normal faces `+Y`
    - `Bottom`: Normal faces `-Y`
    - `Left`: Normal faces `-X`
    - `Right`: Normal faces `+X`
  - Applied `polygonOffset` (`polygonOffset: true`, `polygonOffsetFactor: -1`, `polygonOffsetUnits: -1`) to completely eliminate z-fighting depth flicker against the part's surface.
  - **Decal vs Texture Behavior**:
    - `Decal`: Uses `THREE.ClampToEdgeWrapping` and stretches across the entire face geometry.
    - `Texture`: Uses `THREE.RepeatWrapping` with dynamic repeat calculation `faceWidth / StudsPerTileU` and `faceHeight / StudsPerTileV`, plus offset positioning `OffsetStudsU / StudsPerTileU` and `OffsetStudsV / StudsPerTileV`.
  - Supports `Color3` tinting (`#ffffff` default) and alpha `Transparency` (`0.0` - `1.0`).
- **Luau Runtime & Instance API**:
  - Added `Decal` and `Texture` to `Instance.new(className, parent)` with default face `'Front'`, white color, and 0 transparency.
  - Added `ClassName` support returning `'Decal'` and `'Texture'`.
  - Updated `IsA()` inheritance: `decal:IsA("Decal")`, `texture:IsA("Texture")`, and `texture:IsA("Decal")` (since Texture inherits from Decal in Roblox).
  - Added Instance properties with live getters/setters: `Texture`, `Face`, `Color3` / `Color`, `Transparency`, `StudsPerTileU`, `StudsPerTileV`, `OffsetStudsU`, `OffsetStudsV`, `ZIndex`.
- **Properties Panel & Insert Object UI**:
  - Insert Object context menu now features `Decal` (pink image icon) and `Texture` (cyan grid icon).
  - Explorer tree shows custom `Image` icon for Decals and `Grid` icon for Textures.
  - Added dedicated Decal / Texture collapsible section in `PropertiesPanel` with inputs for:
    - `Texture` text input
    - `Face` dropdown (`Front`, `Back`, `Top`, `Bottom`, `Left`, `Right`)
    - `Transparency` numeric slider/input
    - `Color3` color picker and hex display
    - `StudsPerTileU`, `StudsPerTileV`, `OffsetStudsU`, `OffsetStudsV` (active for Textures).

## 100% Frontend Roblox Image & Asset ID Resolution — 2026-09-11
- **Eliminated Backend / Cloudflare Worker Requirement**:
  - Replaced broken public CORS proxies (`api.allorigins.win` timeouts and `corsproxy.io` 401 API key blocks) with dedicated Roblox community reverse proxy `thumbnails.roproxy.com`.
  - Added fallback pipeline: `thumbnails.roproxy.com` -> local Vite dev proxy (`/api/roblox-thumbnail/`) -> `assetdelivery.roproxy.com` -> optional user proxy.
  - Enables full Roblox asset and image resolution directly in client browsers on static hosting (GitHub Pages, Netlify, Vercel) with zero backend setup.
- **Robust Asset ID Extraction**:
  - Implemented `extractRobloxAssetId` supporting:
    - Pure numbers (`144075659`)
    - `rbxassetid://<id>`
    - `rbxthumb://type=Asset&id=<id>...`
    - Catalog URLs (`roblox.com/catalog/<id>/...`)
    - Creator Store links (`create.roblox.com/store/asset/<id>/...`)
    - Library URLs (`roblox.com/library/<id>/...`)
    - Query links (`roblox.com/asset/?id=<id>`)
- **Direct Three.js CDN Texture Loading**:
  - Validated that Roblox CDN images (`tr.rbxcdn.com`, `t*.rbxcdn.com`) natively include `Access-Control-Allow-Origin: *`.
  - Made direct CDN image URL candidate #1 with `wsrv.nl` as secondary CORS fallback.
- **Bundled Asset Resolution**:
  - Added direct mapping for bundled local assets (`Grid.png`, `SpawnLocation.png`, `Moon.png`, `Sun.png`, `workspace.png`).
- **Properties Panel UX**:
  - Enhanced `Texture` input with detailed placeholder, tooltip documentation, and one-click clear button.

## Baseplate Texture & SpawnLocation Decal Scene Upgrade — 2026-09-12
- **Initial Scene Tree Defaults**:
  - Attached a `Texture` element under `Baseplate` with ID `6372755229`, `Face = "Top"`, `StudsPerTileU = 16`, `StudsPerTileV = 16`, and `Transparency = 0.8`.
  - Attached a `Decal` element under `SpawnLocation` with ID `3724740815`, `Face = "Top"`, and `Transparency = 0`.
  - Set Baseplate color to `#5B5B5B` and SpawnLocation color to light grey/white (`#e8e8e8`).
- **Pure Dynamic Asset ID Resolution**:
  - Removed local `Grid.png`, `SpawnLocation.png`, and `workspace.png` imports and dependencies completely from `R_Assets/`.
  - Textures and decals now resolve 100% dynamically from Roblox CDN using their IDs (`6372755229` and `3724740815`) via `fetchRobloxThumbnail` and Three.js `TextureLoader`.
  - Friendly aliases (`"grid"`, `"spawnlocation"`) automatically map to the respective asset IDs.
- **Visual & Viewport Polish**:
  - Tuned sky dome gradient colors (`zenithColor = #73859c`, `horizonColor = #69768d`) and daytime ambient illumination (`#73859c`) to match modern Roblox Studio atmospheric lighting.
  - Added slight surface offset epsilon (`eps = 0.005`) to `PartDecalOrTexture` to eliminate z-fighting depth flicker across large part surfaces.
  - Adjusted initial viewport camera position to `[24, 16, 28]` with `fov: 50` for an ideal elevated perspective framing the SpawnLocation and Baseplate grid.

## Roblox Studio Element & Object Icon Extraction & Organization — 2026-09-12
- **Official Master Spritesheet**:
  - Sourced official `ClassImages.PNG` (2352×16, containing all 147 Roblox class icons).
- **Automated Slicing & Structuring**:
  - Implemented PNG decoding and slicing script extracting every icon into individual 16×16 transparent PNGs.
  - Linked official class reflection metadata (`ReflectionMetadata.xml`) mapping 300+ classes to their exact Explorer icon indices.
- **Clean `R_Assets/` Organization**:
  - `R_Assets/Classes/`: Contains 278 class icons (`Part.png`, `Script.png`, `LocalScript.png`, `ModuleScript.png`, `Folder.png`, `Model.png`, `Decal.png`, `Texture.png`, `SpawnLocation.png`, etc.).
  - `R_Assets/Services/`: Contains 25 service icons (`Workspace.png`, `Players.png`, `Lighting.png`, `ReplicatedStorage.png`, `ServerScriptService.png`, `StarterGui.png`, etc.).
  - `R_Assets/AllIcons/`: Contains all 147 raw indexed icon slices (`icon_0.png` ... `icon_146.png`).
  - `R_Assets/StudioUI/`: Contains 67 official Roblox Studio UI icons (arrows, audio, grid, folders, filters, alerts).
  - `R_Assets/icon_manifest.json`: Full manifest mapping class names to their category, index, and asset path.

## Roblox Studio Icon UI Integration with Lucide Fallbacks — 2026-09-12
- **Eager Bundling via `import.meta.glob`**:
  - Dynamically import and bundle all 278 class icons and 25 service icons from `R_Assets/Classes/*.png` and `R_Assets/Services/*.png` via Vite's `import.meta.glob`.
  - Built high-performance lowercase lookup dictionaries (`CLASS_ICONS` and `SERVICE_ICONS`) with internal alias resolution (`object` -> `part`, `folder_script` -> `folder`).
- **Universal Resolver with Lucide Fallback (`getRobloxIconUrl`)**:
  - Implemented `getRobloxIconUrl(name, type)` that checks Roblox services, class mappings, and names.
  - Returns the URL string when an extracted Roblox Studio icon is found, or `null` if none exists so consumers cleanly fallback to Lucide icons.
- **UI Components Updated**:
  - **Explorer Tree (`getNodeIcon`)**: Automatically displays the official 16×16 Roblox icon (`Part`, `Model`, `Folder`, `Script`, `LocalScript`, `ModuleScript`, `Workspace`, `Lighting`, `Decal`, `Texture`, `SpawnLocation`, `PointLight`, `SpotLight`, `Atmosphere`, `Sky`, etc.) with Lucide fallback.
  - **Tab Bar**: Replaced script and viewport tab icons with the official Roblox icons (`Script`, `LocalScript`, `ModuleScript`, `Workspace`), maintaining Lucide fallbacks.
  - **Insert Object Context Menu**: All menu items (`Model`, `Folder`, `Part`, `Decal`, `Texture`, `Script`, `LocalScript`, `ModuleScript`, `PointLight`, `SpotLight`, `SurfaceLight`, `RemoteEvent`, `RemoteFunction`, `Sky`, `Atmosphere`, `ColorCorrectionEffect`, `BloomEffect`, `SunRaysEffect`, `BlurEffect`) now display the official Roblox icons.
- **Type Safety & Build Verification**:
  - Verified with `tsc --noEmit` (0 errors) and production build `vite build` (all 300+ icons bundled seamlessly).

## Modern Roblox Studio Vector Icons Upgrade — 2026-09-12
- **Discovered Modern Vector Texture Assets**:
  - Located official modern vector icon repository in `C:\Program Files (x86)\Roblox\Versions\version-93202a13414c4131\content\studio_svg_textures\Shared\InsertableObjects\Dark\Standard\`.
  - Replaced the 2012-2019 legacy spritesheet (`ClassImages.PNG`) icons with the latest modern flat vector Roblox Studio icons (Dark Theme).
- **Asset Migration & Preservation**:
  - Safely archived the classic icons into `R_Assets/Classic/Classes/` and `R_Assets/Classic/Services/`.
  - Extracted and deployed **317 modern class icons** into `R_Assets/Classes/` and **28 modern service icons** into `R_Assets/Services/`.
  - Generated `R_Assets/icon_manifest_modern.json` mapping all 317 modern classes and services.
  - Added alias support (`Baseplate.png` -> `BasePlate.png`, `ChatService.png` -> `TextChatService.png`, and fallback generic service icons for `MarketplaceService`, `TweenService`, `RunService`).
- **Seamless Live Rendering**:
  - Explorer tree, tab headers, and Insert Object context menu now render the modern Roblox Studio icons directly.
  - Production build verified with `vite build` (0 errors, 2606 modules compiled).

## Roblox Studio Script Editor Red & Yellow Squiggly Lines — 2026-09-12
- **Luau Static Analyzer & Diagnostic Engine (`src/luauLinter.ts`)**:
  - Implemented real-time tokenization and lexical scope analyzer tailored for Luau.
  - **Red Squiggly Lines (`MarkerSeverity.Error`)**:
    - Pinpoints exact syntax error tokens and symbol boundaries from Lua compiler error outputs (`unexpected symbol near ')'`, `')' expected near 'bar'`, `unfinished string`, `<eof>`).
    - Focuses precisely on the offending symbol rather than underlining the entire line.
  - **Yellow Squiggly Lines (`MarkerSeverity.Warning`)**:
    - **Unknown Globals (`W000`)**: Flags non-local variables not recognized in Roblox Luau builtins (`game`, `workspace`, `Vector3`, `CFrame`, `Instance`, `task`, etc.).
    - **Unused Local Variables (`W001`)**: Flags declared local variables and arguments never read in scope; supports standard `_` prefix ignore convention.
    - **Deprecated Roblox APIs (`W002`)**: Detects legacy methods (`:Remove()` -> `:Destroy()`, `:findFirstChild()` -> `:FindFirstChild()`, `:children()` -> `:GetChildren()`, `wait()` -> `task.wait()`, `spawn()` -> `task.spawn()`, `delay()` -> `task.delay()`).
    - **Method vs. Member Differentiation**: Accurately recognizes member accesses (`obj.prop`), method calls (`obj:method()`), table constructors (`{ key = value }`), and implicit `self` injection in `function tbl:method()`.
- **Studio-Authentic Visual Styling (`src/index.css` & Monaco Theme)**:
  - Custom SVG wavy squiggly patterns for `.squiggly-error` (`#ff4d4d`) and `.squiggly-warning` (`#ffbf00`).
  - Added `editorError.foreground`, `editorWarning.foreground`, and overview ruler indicators in `roblox-studio-dark` theme.
- **Enhanced Status Bar**:
  - Added live indicators with count and line numbers for both Errors (red alert circle) and Warnings (yellow alert triangle).
  - One-click navigation reveals and centers the offending line directly in Monaco Editor.
- **Fast Debounced Linting**:
  - Reduced debounce to 200ms on typing and 80ms on tab switch for near instantaneous visual feedback.
- **Build Verification**:
  - Verified with `tsc --noEmit` and `vite build` (0 errors).