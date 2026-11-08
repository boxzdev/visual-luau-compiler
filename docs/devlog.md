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

## Code Editor Squiggly Syntax Error & Warning Colors & Diagnostics — 2026-09-12
- **Roblox Studio Error and Warning Underline Colors**:
  - **Red squiggly underline (`#ff4d4d`)**: Real syntax or compilation errors where code cannot compile or run.
  - **Orange squiggly underline (`#ff8c00`)**: Warnings (unused local variables, unreachable code after `return`/`break`, deprecated `wait()`/`spawn()`/`delay()` APIs) where the code can still run.
  - **Blue squiggly underline (`#00a2ff`)**: Type check suggestions and hints (e.g. undeclared global variable assignment without `local`).
- **Monaco Theme & CSS Wave Implementation**:
  - Configured `editorError.foreground` (`#ff4d4d`), `editorWarning.foreground` (`#ff8c00`), `editorInfo.foreground` (`#00a2ff`), `editorHint.foreground` (`#00a2ff`), and overview ruler counterparts in `roblox-studio-dark` Monaco theme.
  - Added CSS wave pattern overrides for `.monaco-editor .squiggly-error`, `.monaco-editor .squiggly-warning`, `.monaco-editor .squiggly-info`, and `.monaco-editor .squiggly-hint` in `src/index.css`.
- **Static Analysis Engine (`analyzeLuaCode`) in `luaRunner.ts`**:
  - Validates code with Lua WebAssembly parser for real compilation errors.
  - Performs static lint analysis detecting unreachable statements, unused local declarations, deprecated Roblox functions, and undeclared globals with type check suggestions.
- **Output Panel & Editor Status Bar Colors**:
  - **Red text in Output (`#ff4d4f`)**: Runtime errors logged via `error()`.
  - **Yellow text in Output (`#ffe600`)**: Warnings logged via `warn()`.
  - **Editor Status Bar**: Shows colored status button linking directly to the line of error/warning/suggestion.
- **Verification**:
  - `tsc --noEmit` passed with 0 errors.
  - `vite build` succeeded with 0 errors.

## Roblox Studio Accurate GUI Elements & Client/Server Architecture — 2026-09-13
- **Strict Client vs. Server Architecture Guarantees**:
  - **2D GUI (`ScreenGui` & descendants)**: Strictly client-side.
    - **Server Gameplay**: 2D ScreenGui is **hidden** (Roblox servers have no display / player monitor; subtle status badge shown).
    - **Local Gameplay (Client)**: 2D ScreenGui is **visible and fully interactive** on the player screen. Button clicks and text inputs trigger client `LocalScript` listeners.
    - **Edit Mode (`Viewport`)**: Renders an edit preview of all `ScreenGui` instances under `StarterGui`.
  - **3D GUI (`SurfaceGui`, `BillboardGui`)**:
    - **Server Gameplay**: Renders in 3D world space from `serverRuntimeTree` (replicates down to client view).
    - **Local Gameplay**: Renders from `clientRuntimeTree` (supports both replicated and client-created GUIs).
    - **Edit Mode**: Renders directly on 3D part faces or above parts.
- **10 Supported Roblox Studio GUI Classes**:
  - **`ScreenGui`**: 2D layer collector container with `Enabled`, `IgnoreGuiInset`, `ResetOnSpawn`, and `DisplayOrder`.
  - **`Frame`**: 2D panel with UDim2 `Position` & `Size`, Vector2 `AnchorPoint`, `BackgroundColor3`, `BackgroundTransparency`, `BorderColor3`, `BorderSizePixel`, `ClipsDescendants`, and `ZIndex`.
  - **`TextLabel`**: 2D typography element with `Text`, `TextColor3`, `TextTransparency`, `TextSize`, `TextScaled`, `TextWrapped`, `Font`, and alignment (`TextXAlignment`, `TextYAlignment`).
  - **`TextButton`**: Interactive button with `AutoButtonColor` hover/press tinting, firing `MouseButton1Click`, `Activated`, `MouseButton1Down`, `MouseButton1Up`, `MouseEnter`, and `MouseLeave` signals.
  - **`ImageLabel`**: 2D image renderer with Roblox asset ID resolution (`rbxassetid://`, numeric IDs, catalog URLs), `ImageColor3`, `ImageTransparency`, and `ScaleType` (`Stretch`, `Fit`, `Crop`, `Tile`).
  - **`ImageButton`**: Interactive image button firing all pointer events with `AutoButtonColor` and click feedback.
  - **`TextBox`**: Interactive text input element with `PlaceholderText`, `ClearTextOnFocus`, two-way data-binding, and `FocusLost(enterPressed)` event.
  - **`ScrollingFrame`**: Scrollable container with `CanvasSize` and custom Roblox-dark scrollbar.
  - **`SurfaceGui`**: 3D plane GUI projected on Part faces (`Front`, `Back`, `Top`, `Bottom`, `Left`, `Right`) via `@react-three/drei`'s `<Html transform occlude>` with native pointer events and `LightInfluence`.
  - **`BillboardGui`**: 3D camera-facing billboard GUI positioned at `StudsOffset` relative to a Part, with `AlwaysOnTop` and `MaxDistance`.
- **Luau Engine Metatables & Architecture (`luaRunner.ts`)**:
  - `UDim2.new(xScale, xOffset, yScale, yOffset)`, `UDim2.fromScale()`, `UDim2.fromOffset()` with arithmetic (`+`, `-`), equality (`==`), and Roblox string formatting (`"{%.3f, %d}, {%.3f, %d}"`).
  - `UDim.new(scale, offset)` and `Vector2.new(x, y)` with full metatables and operations.
  - Adaptive `Position` and `Size` on Instance proxies (handling `UDim2` for GUI and `Vector3` for 3D Parts).
  - Dynamic `Instance.new(className, parent)` for all 10 GUI classes directly from Luau code.
  - `game:GetService("Players").LocalPlayer.PlayerGui` wired directly to client runtime.
  - Event signals (`MouseButton1Click`, `Activated`, `MouseButton1Down`, `MouseButton1Up`, `MouseEnter`, `MouseLeave`, `FocusLost`) connected via `fireInstanceSignal` to `:Connect()` callbacks in Luau.
- **UI, Viewport & Explorer Integration (`App.tsx`)**:
  - Modern extracted Roblox Studio icons (`ScreenGui.png`, `Frame.png`, `TextLabel.png`, `TextButton.png`, `ImageLabel.png`, `ImageButton.png`, `TextBox.png`, `ScrollingFrame.png`, `SurfaceGui.png`, `BillboardGui.png`) in Explorer tree.
  - Right-click "Insert Object" menu updated with dedicated "User Interface" category.
  - `<ScreenGuiOverlay />` positioned over the 3D viewport canvas.
  - `<PartSurfaceGui />` and `<PartBillboardGui />` rendered inside `DraggablePart`.
- **Properties Panel Inspector (`PropertiesPanel.tsx`)**:
  - Collapsible GUI sections for **Layout** (UDim2 Position, Size, Vector2 AnchorPoint with expandable sub-fields, ZIndex, ClipsDescendants), **Appearance** (Color pickers, transparency, borders), **Text**, **Image**, **Button**, **TextBox**, **ScreenGui**, and **3D GUI**.
- **Verification**:
  - `npm.cmd run lint`: 0 errors.
  - `npm.cmd run build`: Compiled 2606 modules with code 0.

## Roblox Studio Insert Button & Selection Tool GUI Upgrade — 2026-09-18
- **Dedicated Tool GUI for Object Insertion (Roblox Studio Accuracy)**:
  - Replaced right-click dependency for inserting objects with Roblox Studio's authentic button-driven workflow.
  - Right-clicking tree items in the Explorer now performs standard row selection without opening the selection popup, reserving insertion exclusively for the dedicated Tool GUI.
- **Explorer Row Hover/Select Insert Button (`+`)**:
  - Each item in the Explorer tree now features a circular/rounded `+` button aligned to the right side of the row.
  - Automatically fades in on row hover (`group-hover:opacity-100`) or stays visible with an active highlight (`bg-[#0078d7]`) when the insert menu is open for that node.
  - Clicking `+` stops event propagation, targets that specific instance, and opens the Insert Object dialog anchored beside the button.
- **Explorer Header Insert Tool Button (`+ Insert`)**:
  - Replaced the static *"Right click to add"* label in the Explorer header with an interactive `+ Insert` toolbar button.
  - Clicking it dynamically targets the currently selected tree item (or falls back to `Workspace`).
- **Roblox Studio-Accurate Insert Object Dialog**:
  - **Dynamic Title & Header**: Displays *"Insert Object into [Instance]"* along with a dedicated close button (`X`).
  - **Real-Time Search Bar**: Added an auto-focused `Search object...` input with instant live filtering across all 6 categories (Common & 3D, Scripts, User Interface, Lights, Networking, Environment & Effects).
  - **Keyboard Navigation**: Pressing `Enter` automatically selects and inserts the first matching object; pressing `Escape` or clicking outside dismisses the menu.
  - **Click Handling**: Clicking inside the search input or scrolling the list preserves focus and does not close the dialog prematurely.
  - **Official Icons**: Displays the modern extracted Roblox Studio SVG textures (`getRobloxIconUrl`) with themed Lucide icon fallbacks.
- **Verification**:
  - `npm.cmd run lint`: 0 errors (`tsc --noEmit`).
  - `npm.cmd run build`: Compiled 2606 modules with code 0.

## 3D GUI Bug Fixes & Rendering Architecture (SurfaceGui & BillboardGui) — 2026-09-18
- **Accurate SurfaceGui Pixel-to-Stud Sizing**:
  - Fixed Drei `<Html transform distanceFactor={...}>` scaling issue. Drei calculates CSS 3D transformation matrices using `ratio = distanceFactor / 400`. The previous `distanceFactor={10}` caused canvas pixel scaling to balloon to 20×15 studs (5x to 20x larger than the parent part).
  - Configured Drei `<Html distanceFactor={400}>` (normalizing ratio to 1.0) and nested the canvas inside a parent `<group scale={[faceWidth / canvasW, faceHeight / canvasH, 1]}>`. This achieves pixel-perfect face mapping where an 800×600 canvas maps cleanly onto the exact width and height of any part face.
- **Fixed Vanishing & Flickering 3D GUIs (Drei Occlusion Raycast Bug)**:
  - Drei's `occlude={!alwaysOnTop}` casted an internal Three.js ray from the camera through the HTML center into `scene`. Because the 3D GUI plane is positioned at `±sz/2 + 0.012` studs directly adjacent to the part mesh, the raycast constantly collided with the parent part's own geometry and applied `display: none;`, causing random flickering and complete disappearance.
  - Removed Drei raycast `occlude` and implemented native CSS `backfaceVisibility: 'hidden'`, preventing bleed-through from behind the face.
  - Added camera look-direction dot-product face culling to ensure backfaces are cleanly hidden without unstable raycast artifacts.
- **Roblox Coordinate Alignment for Part Faces**:
  - Aligned all 6 NormalId face orientations with Roblox standard coordinate conventions and `PartDecalOrTexture`:
    - `Front`: `[0, 0, -sz/2 - 0.012]`, rotation `[0, Math.PI, 0]` (Roblox LookVector is `-Z`).
    - `Back`: `[0, 0, sz/2 + 0.012]`, rotation `[0, 0, 0]` (`+Z`).
    - `Top`: `[0, sy/2 + 0.012, 0]`, rotation `[-Math.PI / 2, 0, 0]` (`+Y`).
    - `Bottom`: `[0, -sy/2 - 0.012, 0]`, rotation `[Math.PI / 2, 0, 0]` (`-Y`).
    - `Right`: `[sx/2 + 0.012, 0, 0]`, rotation `[0, Math.PI / 2, 0]` (`+X`).
    - `Left`: `[-sx/2 - 0.012, 0, 0]`, rotation `[0, -Math.PI / 2, 0]` (`-X`).
- **BillboardGui MaxDistance Camera Culling**:
  - Previously, `BillboardGui.MaxDistance` was ignored.
  - Implemented dynamic per-frame camera distance checks with `@react-three/fiber` `useFrame`. When `maxDistance > 0` and camera distance exceeds `maxDistance`, the billboard smoothly hides (`display: none; pointerEvents: none;`), matching Roblox Studio behavior.
  - Maintained `alwaysOnTop` layering with `zIndexRange={[100, 0]}`.
- **Default Transparency for 3D GUI Containers**:
  - Fixed `backgroundTransparency` defaulting to `0` in `insertObject` and `Instance.new`.
  - Previously, adding a `SurfaceGui` or `BillboardGui` instantly covered parts with a solid white opaque box. Now defaults to `1` (transparent container), matching Roblox Studio.
  - Added empty-container dotted boundary indicators in Edit mode so designers can visualize empty 3D GUIs on parts without obscuring materials.
- **Adornee Property Support**:
  - Added support for `SurfaceGui.Adornee` and `BillboardGui.Adornee` (both string IDs and Instance references).
  - 3D GUIs placed in `StarterGui` or `Workspace` can now adorn any arbitrary target Part in the scene via `gui.Adornee = workspace.TargetPart`.
- **Luau Runtime Enhancements (`luaRunner.ts`)**:
  - Exposed `Enum.NormalId` (`Front`, `Back`, `Top`, `Bottom`, `Right`, `Left`).
  - Added `Adornee`, `LightInfluence`, `Face`, `CanvasSize`, `StudsOffset`, `AlwaysOnTop`, and `MaxDistance` getters and setters in `createInstanceProxy`.
  - Fixed duplicate `Face` accessor collision in the proxy handler.
  - Updated `Instance.new("SurfaceGui")` and `Instance.new("BillboardGui")` defaults (`backgroundTransparency: 1`, `canvasSize: [200, 50]` for billboards, `borderSizePixel: 0`).
- **Verification**:
  - `npm.cmd run lint`: 0 errors (`tsc --noEmit`).
  - `npm.cmd run build`: Compiled 2606 modules with code 0 (`vite build`).

## Roblox Studio Services Reference Documentation (`roblox_service.md`) — 2026-11-06
- **Comprehensive API & Service Reference Guide**:
  - Authored `roblox_service.md`, a complete documentation manual cataloging all 20+ functional Roblox Studio services, methods, properties, and signals implemented in the project (`luaRunner.ts`, `App.tsx`, `physicsEngine.ts`).
  - **Engine Services**: Complete method and signal documentation for `TweenService`, `RunService`, `UserInputService`, `CollectionService`, `Debris`, `HttpService`, `PathfindingService`, `ContextActionService`, `Players`, `TeleportService`, and `MarketplaceService`.
  - **DataModel & Hierarchy Containers**: Documented `Workspace` (Raycasting, Camera, Terrain, Part filtering), `Lighting` (ClockTime, Fog, Post-Processing Effects), `ReplicatedStorage`, `ServerScriptService`, `ServerStorage`, `StarterGui`, `PlayerGui`, `StarterPlayer`, `SoundService`, and `Teams`.
  - **Networking & Signals**: Documented dual-runtime cross-VM bridge via `RemoteEvent` (`FireServer`, `FireClient`, `FireAllClients`, `OnServerEvent`, `OnClientEvent`) and `RemoteFunction` (`InvokeServer`, `InvokeClient`, `OnServerInvoke`, `OnClientInvoke`).
  - **Universal Instance Model & Metatables**: Documented Roblox Instance methods (`Clone`, `Destroy`, `FindFirstChild`, `WaitForChild`, `GetChildren`, `GetDescendants`, `IsA`, `GetPropertyChangedSignal`), custom datatypes (`Vector3`, `Vector2`, `CFrame`, `Color3`, `BrickColor`, `UDim`, `UDim2`, `TweenInfo`, `Enum`), and task scheduler APIs (`task.spawn`, `task.wait`, `task.delay`, `task.cancel`).

## 3D GUI (SurfaceGui & BillboardGui) Visual Bug Fixes & Dummy Element Removal — 2026-11-06
- **SurfaceGui Backface Culling Inversion Fix**:
  - Resolved bug where `SurfaceGui` on the `Front` face vanished when looking directly at it and only appeared when looking through the back of the part.
  - Root cause: `normalVecRef.set(...localNormal).applyQuaternion(groupRef.getWorldQuaternion())` double-rotated the normal because `groupRef` already had face rotation applied (`rot = [0, Math.PI, 0]`), flipping `[0, 0, -1]` to `[0, 0, 1]` (pointing inward).
  - Solution: Drei `<Html transform>` planes face along local `+Z`. Using `groupRef.current.getWorldDirection(normalVecRef.current)` directly returns the true world-space outward normal for all 6 faces and all part rotations.
- **CSS 3D Stacking Context Flattening Fix**:
  - Removed root `filter: brightness(...)` on `<Html>` which broke browser `preserve-3d` matrix contexts, causing blur, z-fighting, and rendering glitches.
  - Replaced with a non-breaking shading overlay div (`rgba(0, 0, 0, ...)`) inside the canvas, preserving native 3D hardware acceleration.
- **BillboardGui Wild Scaling & Font Legibility Fix**:
  - Removed `distanceFactor={10}` on `<Html center>`. In Roblox Studio, `BillboardGui` Offset sizing is in pixels on screen and does not shrink with distance. Removing `distanceFactor={10}` prevents billboards from shrinking to 3.5px unreadable smudges at standard camera distances (30–40 studs).
- **BillboardGui Behind-Camera Projection Culling**:
  - Added camera-plane culling (`camera.getWorldDirection().dot(worldPos - camera.position) <= 0.05`) in `useFrame` to prevent Drei's screen projector from inverting coordinates and rendering phantom billboards when parts move behind the camera.
- **Dummy Element Elimination in GUI Trees**:
  - Added strict `VALID_GUI_TYPES` validation in `GuiElementNode`. Non-GUI children (Scripts, Folders, Decals, etc.) accidentally nested inside GUI hierarchies will no longer fall through to generic white dummy boxes with borders.
  - Explicitly filtered `guiChildren` in both `PartSurfaceGui` and `PartBillboardGui`.
- **Properties Panel `gui3D` Inspector Clean-Up**:
  - Removed dummy hack where `CanvasSize` was shown for `BillboardGui` and simultaneously mutated `canvasSize` and `guiSize`.
  - Restricted `CanvasSize` (Vector2 width × height) exclusively to `SurfaceGui`.
  - Added authentic `Size (UDim2)` expandable property inspector (X/Y Scale, X/Y Offset) for `BillboardGui`.
  - Enabled `LightInfluence` property for both `SurfaceGui` and `BillboardGui`.
  - Restricted selection outlines (`outline: 2px solid ...`) to edit mode (`!isInteractive && isSelected`) so outlines never show during Gameplay mode.
- **Smart Text Scaling on Insertion**:
  - When inserting `TextLabel` or `TextButton` inside a `SurfaceGui` or `BillboardGui`, `textScaled` now defaults to `true`, making text immediately readable and proportional to the 3D surface.
- **Verification & Code Integrity**:
  - Verified `src/App.tsx` and `src/PropertiesPanel.tsx` component hierarchy and JSX tags.
  - Ensured all mathematical transformations and vector directions match Three.js and Roblox coordinate systems.

## Roblox Studio Toolbar & Viewport Tab Overhaul — 2026-11-06
- **Authentic Roblox Studio Toolset Icons (Vector SVGs)**:
  - Replaced generic Lucide icons with authentic pixel-perfect Roblox Studio tool icons:
    - **Select**: Classic white angled cursor arrow with dashed cyan selection box `[ ]`.
    - **Move**: Iconic 3D coordinate axes tripod (Red +X right, Green +Y up, Blue +Z diagonal down-left) with central sphere hub.
    - **Scale**: 3D bounding box / cube with colored expansion handles (Red, Green, Blue cube handles).
    - **Rotate**: 3D gimbal rotation rings (Red, Green, Blue interlocking circular arcs).
    - **UI Editor (2D GUI)**: Studio UI editor window panel with title bar, inner layout blocks, and corner resize handle.
  - Added Roblox Studio keyboard shortcuts: `Ctrl+1` (Select), `Ctrl+2` (Move), `Ctrl+3` (Scale), `Ctrl+4` (Rotate).
- **Roblox Studio Test Bar Simulation Switcher**:
  - Added the official `Current: Server` / `Current: Client` toggle button directly onto the top toolbar beside the Stop button during testing.
  - Features live mode indicator with official Roblox Studio Server and Client icons.
- **Authentic Play / Stop Buttons**:
  - Updated **Play** to Roblox Studio's emerald green button with sharp play triangle glyph.
  - Updated **Stop** to Roblox Studio's crimson red button with white stop square glyph.
- **Top Toolbar Streamlining**:
  - Removed redundant `Current: Server` / `Current: Client` button from the top toolbar to keep the toolbar clean and uncluttered.
  - Simulation view switching remains seamlessly accessible via the `Server Gameplay ⌵` / `Local Gameplay` tab header dropdown menu.
- **Viewport & Gameplay Tab Bar Modernization**:
  - Updated `Viewport` tab icon to the official Roblox Studio `Workspace.png` asset.
  - Updated `Server Gameplay` to use the official Roblox `ServerScriptService.png` asset (server tower chassis).
  - Updated `Local Gameplay` to use the official Roblox `NetworkClient.png` asset (client monitor/player).
  - Overhauled the mode switcher dropdown menu with authentic Roblox Studio dark theme styling, official icons, and active checkmarks (`✓`).

## Comprehensive Roblox Services Expansion & Security Guardrails — 2026-11-06
- **Expansion of Standard & Scriptable Roblox Services**:
  - Implemented 60+ functional, scriptable Roblox engine and Studio services with realistic method sets and event hooks:
    - **`DataStoreService`**: In-memory key-value persistence with `GetDataStore`, `GetOrderedDataStore`, `GetGlobalDataStore`, `GetAsync`, `SetAsync`, `UpdateAsync`, `IncrementAsync`, `RemoveAsync`, and paginated `GetSortedAsync`.
    - **`BadgeService`**: Awarding and querying player achievements (`AwardBadge`, `UserHasBadgeAsync`, `GetBadgeInfoAsync`).
    - **`Chat` / `ChatService`**: Classic in-game chat messaging (`Chat`, `FilterStringForBroadcast`, `CanUserChatAsync`).
    - **`PhysicsService`**: Collision group registration and matrix collision configuration (`RegisterCollisionGroup`, `CollisionGroupSetCollidable`, `CollisionGroupsAreCollidable`).
    - **`TextService`**: Text filtering results and GUI font measurement (`FilterStringAsync`, `GetTextSize`).
    - **`ProximityPromptService`**: Proximity prompt interaction hub supporting `:Connect()` and `:Wait()` (`PromptShown`, `PromptHidden`, `PromptTriggered`, `PromptButtonHoldBegan`, `PromptButtonHoldEnded`).
    - **`GuiService`**: Screen resolution and GUI inset calculations (`GetScreenResolution`, `GetGuiInset`, `MenuOpened`, `MenuClosed`).
    - **`ContentProvider`**: Asset preloading and CDN query mock (`PreloadAsync`, `BaseUrl`).
    - **`InsertService`**: Dynamic asset and mesh loading (`LoadAsset`, `CreateMeshPartAsync`).
    - **`MessagingService`**: Cross-server pub/sub message broadcasting (`PublishAsync`, `SubscribeAsync`).
    - **`MemoryStoreService`**: Ephemeral data collections (`GetSortedMap`, `GetHashMap`, `GetQueue`).
    - **`LogService`**: Real-time console log stream interception (`MessageOut`, `GetLogHistory`).
    - **`ScriptContext`**: Global script execution error interception (`Error` signal, `SetTimeout`).
    - **`Selection` & `ChangeHistoryService`**: Studio instance selection management and undo/redo history (`Get`, `Set`, `Add`, `Remove`, `SelectionChanged`, `SetWaypoint`, `Undo`, `Redo`).
    - **`Stats` & `stats()`**: Engine runtime metrics (`HeartbeatTimeMs`, `PhysicsStepTimeMs`, `GetTotalMemoryUsageMb`).
    - **`TestService`**: Assertion and test runner framework (`Check`, `Checkpoint`, `Error`, `Warn`, `Message`, `Require`).
    - **`SocialService` & `UserService`**: Friend invites and user profile queries (`PromptGameInvite`, `GetUserInfosByUserIdsAsync`).
    - **Input & Device Services**: `VRService`, `HapticService`, `GamepadService`, `TouchInputService`, `VirtualUser`, `VirtualInputManager`.
    - **Animation & Sequence Providers**: `KeyframeSequenceProvider`, `AnimationClipProvider`.
    - **Localization & Shared Tables**: `LocalizationService`, `SharedTableRegistry`.
    - **Settings & Studio Helpers**: `UserSettings():GetService("UserGameSettings")`, `settings():GetService(...)`, `StudioService`, `ScriptEditorService`, `GeometryService`.
    - **Audio & Modern Chat**: `SoundService` (`PlayLocalSound`, audio properties), `TextChatService` (`MessageReceived`, `SendAsync`).
- **Strict Security Boundaries & Impossible Services Guard**:
  - Maintained strict Roblox security model compliance by detecting and rejecting internal C++, restricted (`RobloxScriptSecurity`), and non-creatable backend singletons (`ABTestService`, `HttpRbxApiService`, `ClusterPacketCache`, `CrossDMScriptChangeListener`, `DataModelPatchService`, `FeatureRestrictionManager`, `FlyweightService`, `GuidRegistryService`, `CookiesService`, `LiveScriptingService`, `NetworkClient`, `NetworkServer`, etc.).
  - Attempting to call `game:GetService(...)` on impossible/internal services raises an authentic Roblox error: `"<Name> is not accessible: restricted internal engine service or cannot be created by scripts"`.
- **Monaco Editor Autocomplete & Intellisense**:
  - Expanded `ROBLOX_SERVICES` in `src/App.tsx` with all 60+ supported services.
  - Added 40+ new instance and service method completion snippets in `INSTANCE_METHODS` for seamless code autocompletion.
- **Documentation**:
  - Updated `roblox_service.md` with complete reference tables, method signatures, and dedicated documentation of impossible/restricted internal services.

## Pure GUI Code Scripting Method & Runtime Enhancements — 2026-11-06
- **Pure GUI Code Scripting Architecture**:
  - Full support for dynamically creating, styling, nesting, animating, and controlling 2D and 3D user interfaces entirely via Luau/Lua scripts without using Explorer templates.
  - Supported GUI classes: `ScreenGui`, `Frame`, `TextLabel`, `TextButton`, `ImageLabel`, `ImageButton`, `TextBox`, `ScrollingFrame`, `SurfaceGui`, `BillboardGui`.
- **Resolved Lua->JS FFI Marshaling Bug**:
  - Fixed an issue where assigning `element.Parent = screenGui` or calling `Instance.new("Frame", screenGui)` dropped `__nodeId` across the Wasmoon FFI boundary due to metatable shallow copying.
  - Implemented own-key identity caching (`__nodeId`, `__type`, `__raw`) on wrapped instances and routed parenting through `__setParentById(targetParentId)`.
- **Orphan Node Management for Unparented Hierarchies**:
  - Modeled true Roblox behavior where instances created without a parent (`local gui = Instance.new("ScreenGui")`) remain unparented root orphans.
  - Child elements, modifiers, and scripts can be attached to unparented parents; when the root `ScreenGui` is assigned `gui.Parent = playerGui`, the entire hierarchy cleanly mounts to the DataModel and renders live in the viewport.
- **UI Modifiers & Responsive Viewport Rendering**:
  - Implemented full property suites for UI modifiers:
    - `UICorner` (`CornerRadius` via `UDim` scale & offset)
    - `UIStroke` (`Thickness`, `Color`, `Transparency`, `ApplyStrokeMode`)
    - `UIPadding` (`PaddingTop`, `PaddingBottom`, `PaddingLeft`, `PaddingRight`)
    - `UIListLayout` (`FillDirection`, `HorizontalAlignment`, `VerticalAlignment`, `Padding`, `SortOrder`)
    - `UIGridLayout` (`CellSize`, `CellPadding`, `StartCorner`)
    - `UIAspectRatioConstraint` (`AspectRatio`, `AspectType`, `DominantAxis`)
  - Updated React `GuiElementNode` to render rounded corners (`borderRadius`), outlines (`outline`), internal padding, flex layouts (`display: flex`, directional gaps, alignment), and aspect ratios dynamically.
- **Programmatic GUI Animation & Tweening**:
  - Added `:TweenPosition()`, `:TweenSize()`, and `:TweenSizeAndPosition()` directly on GUI instances with standard Roblox easing styles (`Linear`, `Sine`, `Quad`, `Cubic`, `Bounce`, `Elastic`, `Back`) and directions (`In`, `Out`, `InOut`).
  - Upgraded `TweenService:Create` to interpolate `UDim2` positions/sizes, `Color3` colors, and transparencies smoothly at 60 FPS.
- **Interactive Signals & Input Methods**:
  - Added right-click signals: `MouseButton2Click`, `MouseButton2Down`, `MouseButton2Up`.
  - Added pointer motion: `MouseMoved`, `InputChanged`.
  - Added input lifecycle: `InputBegan`, `InputEnded`.
  - Added focus management: `Focused`, `FocusLost`, `CaptureFocus()`, `ReleaseFocus(submitted?)`.
  - Added layout measurements: `.AbsolutePosition` and `.AbsoluteSize` (`Vector2`).
- **Monaco Autocomplete & Datatypes**:
  - Added contextual autocomplete for `Instance.new("..."` suggesting all 30+ creatable classes with descriptive summaries.
  - Added constructors: `UDim.new`, `ColorSequence.new`, `ColorSequenceKeypoint.new`, `NumberSequence.new`, `NumberSequenceKeypoint.new`, `NumberRange.new`.
  - Added GUI method completions: `TweenPosition`, `TweenSize`, `TweenSizeAndPosition`, `CaptureFocus`, `ReleaseFocus`, `ClearAllChildren`.

## Complete GUI Elements Properties & UI Modifiers Expansion — 2026-11-07
- **Full Roblox Studio GUI Property Set Implementation**:
  - Implemented comprehensive, authentic Roblox Studio properties across all 2D and 3D GUI classes and UI modifiers in the data model, Lua runtime engine, Properties panel, and viewport rendering.
  - **Classes Supported**:
    - **Layer Collectors**: `ScreenGui`, `SurfaceGui`, `BillboardGui`.
    - **Basic 2D Objects**: `Frame`, `ScrollingFrame`.
    - **Text & Input Elements**: `TextLabel`, `TextButton`, `TextBox`.
    - **Image Elements**: `ImageLabel`, `ImageButton`.
    - **UI Modifiers & Constraints**: `UICorner`, `UIStroke`, `UIPadding`, `UIListLayout`, `UIGridLayout`, `UIAspectRatioConstraint`, `UISizeConstraint`, `UITextSizeConstraint`, `UIGradient`, `UIScale`, `UIPageLayout`, `UIFlexItem`.
- **Runtime Lua Engine & Metamethods (`src/luaRunner.ts`)**:
  - Expanded `TreeNodeData` interface with all modern GUI fields: `guiRotation`, `sizeConstraint`, `automaticSize`, `selectable`, `borderMode`, `autoLocalize`, `textStrokeColor`, `textStrokeTransparency`, `richText`, `textTruncate`, `lineHeight`, `maxVisibleGraphemes`, `sliceScale`, `sliceCenter`, `tileSize`, `imageRectOffset`, `imageRectSize`, `resampleMode`, `modal`, `placeholderColor`, `multiLine`, `textEditable`, `showNativeInput`, `cursorPosition`, `canvasPosition`, `scrollingCanvasSize`, `scrollingDirection`, `scrollBarThickness`, `scrollBarImageColor`, `scrollBarImageTransparency`, `verticalScrollBarInset`, `verticalScrollBarPosition`, `horizontalScrollBarInset`, `elasticBehavior`, `scrollingEnabled`, `automaticCanvasSize`, `zIndexBehavior`, `clipToDeviceSafeArea`, `pixelsPerStud`, `sizingMode`, `sizeOffset`, `studsOffsetWorldSpace`, `extentsOffset`, `extentsOffsetWorldSpace`, `distanceLowerLimit`, `distanceUpperLimit`, `lineJoinMode`, `cellPadding`, `fillDirectionMaxCells`, `itemHorizontalAlignment`, `wraps`, `minSize`, `maxSize`, `minTextSize`, `maxTextSize`, `uiScale`, `gradientColor`, `gradientTransparency`, `gradientRotation`, `gradientOffset`, `animated`, `circular`, `easingDirection`, `easingStyle`, `tweenTime`.
  - Implemented polymorphic runtime getters/setters in `createInstanceProxy` for `Rotation` (degree scalar on GuiObjects vs Vector3 on 3D parts), `CanvasSize` (UDim2 on ScrollingFrame vs Vector2 on SurfaceGui), `Color` / `Transparency` (routed to stroke/gradient parameters on UI modifiers), and `Offset` (vector offset on UIGradient vs scalar on Atmosphere).
  - Expanded `__WRAP_INSTANCE` table rehydration for `Color3` (`TextStrokeColor3`, `PlaceholderColor3`, `ScrollBarImageColor3`), `UDim2` (`CellSize`, `CellPadding`, `TileSize`), and `Vector2` (`CanvasPosition`, `ImageRectOffset`, `ImageRectSize`, `SizeOffset`, `MinSize`, `MaxSize`, `Offset`).
  - Added full Lua `Enum` definitions: `TextXAlignment`, `TextYAlignment`, `AutomaticSize`, `SizeConstraint`, `ScaleType`, `BorderMode`, `FillDirection`, `HorizontalAlignment`, `VerticalAlignment`, `SortOrder`, `StartCorner`, `ScrollingDirection`, `ApplyStrokeMode`, `LineJoinMode`, `EasingDirection`, `EasingStyle`, `ZIndexBehavior`.
- **Properties Panel Overhaul (`src/PropertiesPanel.tsx`)**:
  - Implemented collapsible, searchable sections for all GUI components:
    - **Layout**: `Position`, `Size`, `AnchorPoint`, `Rotation` (degrees), `AutomaticSize` (None/X/Y/XY), `SizeConstraint` (RelativeXY/RelativeXX/RelativeYY), `ZIndex`, `LayoutOrder`, `Visible`, `Active`, `Selectable`, `ClipsDescendants`.
    - **Appearance**: `BackgroundColor3`, `BackgroundTransparency`, `BorderColor3`, `BorderSizePixel`, `BorderMode` (Outline/Middle/Inset), `AutoLocalize`.
    - **Text**: `Text`, `TextColor3`, `TextTransparency`, `TextStrokeColor3`, `TextStrokeTransparency`, `TextSize`, `TextScaled`, `TextWrapped`, `RichText`, `TextTruncate`, `LineHeight`, `MaxVisibleGraphemes`, `Font`, `TextXAlignment`, `TextYAlignment`.
    - **Image**: `Image`, `ImageColor3`, `ImageTransparency`, `ScaleType`, `SliceScale`, `ResampleMode`, `ImageRectOffset`, `ImageRectSize`, `TileSize`.
    - **Button**: `AutoButtonColor`, `Selected`, `Modal`.
    - **TextBox**: `PlaceholderText`, `PlaceholderColor3`, `ClearTextOnFocus`, `MultiLine`, `TextEditable`, `ShowNativeInput`.
    - **ScrollingFrame**: `CanvasSize`, `CanvasPosition`, `AutomaticCanvasSize`, `ScrollingDirection`, `ScrollBarThickness`, `ScrollBarImageColor3`, `ScrollBarImageTransparency`, `VerticalScrollBarPosition`, `VerticalScrollBarInset`, `HorizontalScrollBarInset`, `ElasticBehavior`, `ScrollingEnabled`.
    - **ScreenGui**: `Enabled`, `IgnoreGuiInset`, `ResetOnSpawn`, `DisplayOrder`, `ZIndexBehavior`, `ClipToDeviceSafeArea`.
    - **3D GUI**: `Enabled`, `Face`, `CanvasSize`, `PixelsPerStud`, `SizingMode`, `Size`, `SizeOffset`, `AlwaysOnTop`, `LightInfluence`, `Brightness`, `StudsOffset`, `MaxDistance`, `DistanceLowerLimit`, `DistanceUpperLimit`, `Adornee`.
    - **UI Modifiers & Constraints**: Dedicated sections for `UICorner`, `UIStroke`, `UIPadding`, `UIListLayout`, `UIGridLayout`, `UIAspectRatioConstraint`, `UISizeConstraint`, `UITextSizeConstraint`, `UIGradient`, `UIScale`, `UIPageLayout`.
  - Added reusable, responsive vector input helpers for `UDim`, `UDim2`, and `Vector2` preserving Studio field layout and styling.
- **Explorer, Insert Object Menu & Viewport Rendering (`src/App.tsx`)**:
  - Added `UI Modifiers & Constraints` category to the Insert Object popup dialog with automatic binding to official studio icons (`UICorner.png`, `UIStroke.png`, `UIListLayout.png`, `UIGradient.png`, `UIScale.png`, etc.) via `TYPE_TO_CLASS`.
  - Updated `insertObject` to instantiate modifier nodes with authentic default properties.
  - Enhanced `GuiElementNode` styling to support CSS rotation around `transformOrigin` (`AnchorPoint`), child `UIScale` magnification, child `UIGradient` linear gradients, text stroke shadows, and line height.
- **Verification & Schema Generation**:
  - Generated and validated [`src/guiProperties.json`](file:///c:/visual-luau-compiler-main/src/guiProperties.json) containing 21 comprehensive property definition sections across all GUI objects and UI modifiers, resolving the Vite import resolution error.
  - Refined type casting for `canvasSize` in [`src/PropertiesPanel.tsx`](file:///c:/visual-luau-compiler-main/src/PropertiesPanel.tsx).
  - Passed `npx tsc --noEmit` with 0 type errors.
  - Passed production build (`npm run build`) cleanly in 4.56s.

## Project Structure Organization & Modular Architecture — 2026-11-07
- **Modular Directory Architecture**:
  - Organized the flat `src/` codebase into clean, dedicated modules:
    - **`src/types/`**: Contains [`tree.ts`](file:///c:/visual-luau-compiler-main/src/types/tree.ts) and [`index.ts`](file:///c:/visual-luau-compiler-main/src/types/index.ts) with core TypeScript definitions (`TreeNodeData`, `RigidBodyState`, `LogEntry`, `LogType`, `LuaDiagnostic`, `LuaSyntaxError`).
    - **`src/data/`**: Houses [`guiProperties.json`](file:///c:/visual-luau-compiler-main/src/data/guiProperties.json) and typed descriptor exports in [`index.ts`](file:///c:/visual-luau-compiler-main/src/data/index.ts).
    - **`src/engine/`**: Groups execution engines [`luaRunner.ts`](file:///c:/visual-luau-compiler-main/src/engine/luaRunner.ts) and [`physicsEngine.ts`](file:///c:/visual-luau-compiler-main/src/engine/physicsEngine.ts) with unified exports in [`index.ts`](file:///c:/visual-luau-compiler-main/src/engine/index.ts).
    - **`src/components/`**: Houses React UI panels such as [`PropertiesPanel.tsx`](file:///c:/visual-luau-compiler-main/src/components/PropertiesPanel.tsx) with barrel exports in [`index.ts`](file:///c:/visual-luau-compiler-main/src/components/index.ts).
- **Clean Modular Migration**:
  - Migrated imports in [`src/App.tsx`](file:///c:/visual-luau-compiler-main/src/App.tsx) and across components to use the modular paths (`./engine/luaRunner`, `./components/PropertiesPanel`, `./engine/physicsEngine`, `./types`).
  - Removed redundant root copy files (`src/guiProperties.json`, `src/luaRunner.ts`, `src/physicsEngine.ts`, and `src/PropertiesPanel.tsx`), leaving a clean and uncluttered `src/` tree.
- **Verification**:
  - Passed `npx tsc --noEmit` with 0 type errors.
  - Passed `npm run build` production bundling cleanly.

## Bug Fix: GUI Move/Transform Pointer Event Capture & Drag Stickiness — 2026-11-07
- **Issue**:
  - When selecting and moving a GUI element (Frame, Label, Button, etc.) with the UI Editor tool (`activeTool === 'guiTransform'`), releasing the mouse button failed to commit and drop the element. The element remained stuck following the mouse cursor indefinitely, even across multiple clicks.
- **Root Cause**:
  - `startGuiDrag` listened for `pointerup` on `window` in the bubbling phase (`useCapture: false`).
  - Meanwhile, `handlePointerUp` on all GUI elements called `e.stopPropagation()`. When mouse release occurred on the element, the synthetic event stopped native bubbling, preventing `window` from ever receiving `pointerup`.
  - As a result, the `pointermove` listener was never detached, `liveTransform` was never cleared, and the element remained locked in dragging mode.
- **Fix**:
  - Registered window listeners with `useCapture: true` (`window.addEventListener('pointerup', onPointerUp, true)` and `'pointermove'`, `'pointercancel'`) so release events are intercepted before any child handler can block them.
  - Added dual listeners on `targetEl` for `pointerup`, `pointercancel`, and `lostpointercapture` with explicit `releasePointerCapture`.
  - In `handlePointerUp` and `handleClick`, bypassed `stopPropagation()` when `editable` is active to allow gestures to complete naturally.
  - Added drag session management via `dragCleanupRef` and `latestTransformRef`, guaranteeing any previous or interrupted drag is committed and cleaned up.
  - Added a 2px deadzone threshold to differentiate pure selection clicks from drag translations.
- **Verification**:
  - Passed `npx tsc --noEmit` with 0 errors.
  - Passed `npm run build` cleanly.

## Roblox Character, Joint, Value & Attachment Elements Expansion — 2026-11-08
- **Core Elements Implementation**:
  - Implemented 8 essential Roblox engine classes spanning character systems, rigging joints, 3D constraints, and data containers:
    - **`Motor6D`** (`motor6D`): Joint instance for character skeletal rigging and animated parts.
    - **`Attachment`** (`attachmant`): 3D coordinate frame anchoring points with directional axes.
    - **`HumanoidDescription`**: Avatar appearance description asset defining body scales, clothing asset IDs, and limb colors.
    - **`Humanoid`**: Avatar controller managing locomotion, health, state transitions, and descriptions.
    - **`Animator`**: Animation playback controller for loading and stepping `AnimationTrack` sequences.
    - **`Status`**: Character status indicator and modifier object.
    - **`BodyColors`** (`Body Colors`): Limb color tinting container for R6 and R15 characters.
    - **`StringValue`**: Reactive string data container with `Value` and `.Changed` event signal.
- **Luau Runtime Engine & Metamethods (`src/engine/luaRunner.ts`)**:
  - **Dynamic Class Reflection & Creation**:
    - Added `Instance.new(...)` instantiations for all 8 classes with alias and case tolerance (`motor6D`, `attachmant`, `body colors`).
    - Extended `ClassName` resolution and `IsA(...)` inheritance matching (`JointInstance`, `Instance`, `Humanoid`, `ValueBase`, etc.).
  - **Properties & Two-Way Viewport Synchronization**:
    - `Motor6D`: `Part0`, `Part1`, `C0`, `C1`, `Transform`, `CurrentAngle`, `DesiredAngle`, `MaxVelocity`.
    - `Attachment`: `Axis`, `SecondaryAxis`, `WorldPosition`, `WorldOrientation`, `WorldCFrame`, `Visible`.
    - `Humanoid`: `Health`, `MaxHealth`, `WalkSpeed`, `JumpPower`, `JumpHeight`, `HipHeight`, `RigType` (R6 / R15), `DisplayName`, `AutoRotate`, `PlatformStand`, `Sit`, `UseJumpPower`, `RequiresNeck`.
    - `HumanoidDescription`: Limb colors (`HeadColor`, `TorsoColor`, etc.), clothing IDs (`Shirt`, `Pants`), body scales (`HeightScale`, `WidthScale`, `DepthScale`, `HeadScale`, `BodyTypeScale`, `ProportionScale`), and accessories (`BackAccessory`, `HairAccessory`, `FaceAccessory`, etc.).
    - `Animator`: `:LoadAnimation()`, `:GetPlayingAnimationTracks()`, `:StepAnimations()`.
    - `BodyColors`: `HeadColor3`, `TorsoColor3`, `LeftArmColor3`, `RightArmColor3`, `LeftLegColor3`, `RightLegColor3`, and legacy `BrickColor` limb properties.
    - `StringValue`: `Value` property and reactive `.Changed` signal.
  - **Humanoid Methods & RBXScriptSignals**:
    - Methods: `:TakeDamage(amount)`, `:MoveTo(location)`, `:ChangeState(state)`, `:GetState()`, `:ApplyDescription(desc)`, `:GetAppliedDescription()`, `:AddAccessory(accessory)`.
    - RBXScriptSignals: `Died`, `HealthChanged`, `StateChanged`, `Running`, `Jumping`, `Climbing`, `Freefall`, `Seated`, `MoveToFinished`.
- **Properties Panel Overhaul (`src/components/PropertiesPanel.tsx`)**:
  - Implemented collapsible Roblox Studio inspector panels with real-time two-way bindings:
    - **Motor6D Panel**: `Part0` and `Part1` instance references, `C0` and `C1` CFrame components, angular velocity and desired angles.
    - **Attachment Panel**: Position, Orientation, Axis, SecondaryAxis vectors, and visibility toggle.
    - **Humanoid Panel**: Health / MaxHealth gauges, WalkSpeed, JumpPower, HipHeight, RigType selector, DisplayName, and locomotion toggles (`AutoRotate`, `PlatformStand`, `Sit`).
    - **HumanoidDescription Panel**: Body scale multipliers (0.5x to 2.0x), clothing asset IDs, and limb color overrides.
    - **BodyColors Panel**: Hex / Color picker inputs for all 6 character limbs (`HeadColor3`, `TorsoColor3`, etc.).
    - **StringValue Panel**: Direct string value text input.
- **Explorer, Insert Object & 3D Viewport (`src/App.tsx`)**:
  - Added new "Characters & Animation" and "Values" categories to the Insert Object modal dialog.
  - Added search alias matching for non-exact queries (`attachmant` -> `Attachment`, `body colors` -> `BodyColors`).
  - Added 3D gizmo visualization for child `Attachment` nodes on BaseParts, rendering coordinate axes (Red/Green/Blue lines) and a semi-transparent indicator sphere in the Three.js viewport.
  - Extended Monaco Editor autocompletion for all newly added classes.
- **Assets & Documentation**:
  - Added `StringValue.png` and `Status.png` to `R_Assets/Classes/` to complement existing class icons.
  - Updated `docs/elements.md` with complete API reference tables, properties, signals, methods, and Luau scripting code examples.
- **Verification**:
  - Passed `tsc --noEmit` with 0 type errors.
  - Passed `npm run build` production bundling cleanly.
